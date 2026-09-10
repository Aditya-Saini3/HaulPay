import type { LoadStatus } from "@/earnings";
import { newId } from "../ids";
import {
  lineItemToRow,
  loadToRow,
  rowToLineItem,
  rowToLoad,
  rowToStop,
  stopToRow,
} from "../mappers";
import type { Load, LoadLineItemRow, LoadStop } from "../models";
import { buildUpsert, getDatabase, nowIso, toBind, type Row } from "../sqlite";
import { PRIMARY_KEYS } from "../schema";
import { allRows, query, queryOne, softDelete, upsertLocal } from "./base";

/**
 * Loads, with their stops and money lines.
 *
 * A load is only ever written as a whole: the parent row, its stops and its
 * line items land in one transaction, so a crash mid-save cannot leave a load
 * showing a gross that its line items do not add up to.
 */

export interface LoadFilters {
  status?: LoadStatus | null;
  truckId?: string | null;
  driverId?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
}

async function expenseTotalsByLoad(): Promise<Map<string, number>> {
  const rows = await query<{ load_id: string; total: number }>(
    `SELECT load_id, SUM(amount_cents) AS total FROM expenses
     WHERE _deleted = 0 AND skipped = 0 AND load_id IS NOT NULL
     GROUP BY load_id`,
  );
  return new Map(rows.map((r) => [r.load_id, r.total ?? 0]));
}

export async function listLoads(filters: LoadFilters = {}): Promise<Load[]> {
  const where: string[] = ["l._deleted = 0"];
  const params: unknown[] = [];

  if (filters.status) {
    where.push("l.status = ?");
    params.push(filters.status);
  }
  if (filters.truckId) {
    where.push("l.truck_id = ?");
    params.push(filters.truckId);
  }
  if (filters.driverId) {
    where.push("l.driver_id = ?");
    params.push(filters.driverId);
  }
  if (filters.from) {
    // Compares the date part so a range in local days is not thrown off by the
    // time of day a load happened to start.
    where.push("(l.started_at IS NULL OR substr(l.started_at, 1, 10) >= ?)");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("(l.started_at IS NULL OR substr(l.started_at, 1, 10) <= ?)");
    params.push(filters.to);
  }
  if (filters.search) {
    where.push("(l.load_number LIKE ? OR l.broker LIKE ?)");
    const like = `%${filters.search}%`;
    params.push(like, like);
  }

  const loadRows = await query<Row>(
    `SELECT l.* FROM loads l WHERE ${where.join(" AND ")} ORDER BY l.started_at DESC, l.created_at DESC`,
    params,
  );
  if (loadRows.length === 0) return [];

  const ids = loadRows.map((r) => String(r.id));
  const placeholders = ids.map(() => "?").join(",");
  const [stopRows, itemRows, expenseTotals] = await Promise.all([
    query<Row>(
      `SELECT * FROM load_stops WHERE _deleted = 0 AND load_id IN (${placeholders}) ORDER BY sequence`,
      ids,
    ),
    query<Row>(
      `SELECT * FROM load_line_items WHERE _deleted = 0 AND load_id IN (${placeholders}) ORDER BY sort_order`,
      ids,
    ),
    expenseTotalsByLoad(),
  ]);

  const stopsByLoad = groupBy(stopRows.map(rowToStop), (s) => s.loadId);
  const itemsByLoad = groupBy(itemRows.map(rowToLineItem), (i) => i.loadId);

  return loadRows.map((row) => {
    const id = String(row.id);
    return rowToLoad(
      row,
      itemsByLoad.get(id) ?? [],
      stopsByLoad.get(id) ?? [],
      expenseTotals.get(id) ?? 0,
    );
  });
}

export async function getLoad(id: string): Promise<Load | null> {
  const row = await queryOne<Row>("SELECT * FROM loads WHERE id = ? AND _deleted = 0", [id]);
  if (!row) return null;

  const [stops, items, expenseRow] = await Promise.all([
    query<Row>("SELECT * FROM load_stops WHERE load_id = ? AND _deleted = 0 ORDER BY sequence", [id]),
    query<Row>("SELECT * FROM load_line_items WHERE load_id = ? AND _deleted = 0 ORDER BY sort_order", [id]),
    queryOne<{ total: number }>(
      "SELECT SUM(amount_cents) AS total FROM expenses WHERE load_id = ? AND _deleted = 0 AND skipped = 0",
      [id],
    ),
  ]);

  return rowToLoad(row, items.map(rowToLineItem), stops.map(rowToStop), expenseRow?.total ?? 0);
}

/** Writes a load and everything hanging off it as one atomic unit. */
export async function saveLoad(
  load: Load,
  stops: LoadStop[],
  lineItems: LoadLineItemRow[],
): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    const parent = buildUpsert(
      "loads",
      { ...loadToRow(load), created_at: load.createdAt ?? now, updated_at: now, _dirty: 1, _deleted: 0 },
      PRIMARY_KEYS.loads,
    );
    await db.runAsync(parent.sql, parent.values);

    // Children are replaced wholesale. Rows the user removed are tombstoned
    // rather than dropped, so the delete reaches the server too.
    const keepStopIds = stops.map((s) => s.id);
    await tombstoneMissing(db, "load_stops", "load_id", load.id, keepStopIds, now);
    for (const [index, stop] of stops.entries()) {
      const upsert = buildUpsert(
        "load_stops",
        { ...stopToRow({ ...stop, sequence: index }), created_at: now, updated_at: now, _dirty: 1, _deleted: 0 },
        PRIMARY_KEYS.load_stops,
      );
      await db.runAsync(upsert.sql, upsert.values);
    }

    const keepItemIds = lineItems.map((i) => i.id);
    await tombstoneMissing(db, "load_line_items", "load_id", load.id, keepItemIds, now);
    for (const [index, item] of lineItems.entries()) {
      const upsert = buildUpsert(
        "load_line_items",
        { ...lineItemToRow({ ...item, sortOrder: index }), created_at: now, updated_at: now, _dirty: 1, _deleted: 0 },
        PRIMARY_KEYS.load_line_items,
      );
      await db.runAsync(upsert.sql, upsert.values);
    }
  });
}

async function tombstoneMissing(
  db: Awaited<ReturnType<typeof getDatabase>>,
  table: string,
  parentColumn: string,
  parentId: string,
  keepIds: string[],
  now: string,
): Promise<void> {
  if (keepIds.length === 0) {
    await db.runAsync(
      `UPDATE ${table} SET _deleted = 1, _dirty = 1, updated_at = ? WHERE ${parentColumn} = ? AND _deleted = 0`,
      [now, parentId],
    );
    return;
  }
  const placeholders = keepIds.map(() => "?").join(",");
  await db.runAsync(
    `UPDATE ${table} SET _deleted = 1, _dirty = 1, updated_at = ?
     WHERE ${parentColumn} = ? AND _deleted = 0 AND id NOT IN (${placeholders})`,
    [now, parentId, ...keepIds],
  );
}

export async function updateLoadStatus(id: string, status: LoadStatus): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE loads SET status = ?, updated_at = ?, _dirty = 1 WHERE id = ?", toBind([
    status,
    nowIso(),
    id,
  ]));
}

export async function deleteLoad(id: string): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE loads SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?", toBind([now, id]));
    await db.runAsync("UPDATE load_stops SET _deleted = 1, _dirty = 1, updated_at = ? WHERE load_id = ?", toBind([now, id]));
    await db.runAsync("UPDATE load_line_items SET _deleted = 1, _dirty = 1, updated_at = ? WHERE load_id = ?", toBind([now, id]));
  });
}

/** Duplicates a load with fresh ids, cleared dates and a Booked status. */
export async function duplicateLoad(id: string): Promise<string | null> {
  const original = await getLoad(id);
  if (!original) return null;

  const newLoadId = newId();
  const copy: Load = {
    ...original,
    id: newLoadId,
    status: "booked",
    startedAt: null,
    endedAt: null,
    loadNumber: null,
    hours: { worked: null, driving: null, loading: null, waiting: null, unpaidBreak: null },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const stops = original.stops.map((stop) => ({
    ...stop,
    id: newId(),
    loadId: newLoadId,
    appointmentAt: null,
    reference: null,
  }));
  const items = original.lineItems.map((item) => ({
    ...(item as LoadLineItemRow),
    id: newId(),
    loadId: newLoadId,
  }));

  await saveLoad(copy, stops, items);
  return newLoadId;
}

/**
 * The final dropoff of the load delivered most recently before `beforeIso`.
 * This is what the deadhead suggestion is measured from.
 */
export async function previousDropoff(beforeIso: string): Promise<LoadStop | null> {
  const row = await queryOne<Row>(
    `SELECT s.* FROM load_stops s
     JOIN loads l ON l.id = s.load_id
     WHERE l._deleted = 0 AND s._deleted = 0
       AND s.lat IS NOT NULL AND s.lng IS NOT NULL
       AND l.ended_at IS NOT NULL AND l.ended_at <= ?
     ORDER BY l.ended_at DESC, s.sequence DESC
     LIMIT 1`,
    [beforeIso],
  );
  return row ? rowToStop(row) : null;
}

export async function allLoads(): Promise<Load[]> {
  return listLoads();
}

export { allRows, softDelete, upsertLocal };

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}
