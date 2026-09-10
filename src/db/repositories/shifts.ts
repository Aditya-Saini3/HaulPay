import type { DayKey } from "@/earnings";
import { rowToShift, shiftToRow } from "../mappers";
import type { Shift } from "../models";
import { PRIMARY_KEYS } from "../schema";
import { buildUpsert, getDatabase, nowIso, toBind, type Row } from "../sqlite";
import { query, queryOne } from "./base";

export async function listShifts(from?: DayKey, to?: DayKey): Promise<Shift[]> {
  const where = ["_deleted = 0"];
  const params: unknown[] = [];
  if (from) {
    where.push("work_date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("work_date <= ?");
    params.push(to);
  }

  const rows = await query<Row>(
    `SELECT * FROM shifts WHERE ${where.join(" AND ")} ORDER BY work_date DESC`,
    params,
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => String(r.id));
  const placeholders = ids.map(() => "?").join(",");
  const links = await query<{ shift_id: string; load_id: string }>(
    `SELECT shift_id, load_id FROM shift_loads WHERE _deleted = 0 AND shift_id IN (${placeholders})`,
    ids,
  );

  const byShift = new Map<string, string[]>();
  for (const link of links) {
    const bucket = byShift.get(link.shift_id);
    if (bucket) bucket.push(link.load_id);
    else byShift.set(link.shift_id, [link.load_id]);
  }

  return rows.map((row) => rowToShift(row, byShift.get(String(row.id)) ?? []));
}

export async function getShift(id: string): Promise<Shift | null> {
  const row = await queryOne<Row>("SELECT * FROM shifts WHERE id = ? AND _deleted = 0", [id]);
  if (!row) return null;
  const links = await query<{ load_id: string }>(
    "SELECT load_id FROM shift_loads WHERE shift_id = ? AND _deleted = 0",
    [id],
  );
  return rowToShift(row, links.map((l) => l.load_id));
}

/** The shift already logged for a day, so clock-in reuses it rather than stacking a second. */
export async function getShiftForDate(workDate: DayKey): Promise<Shift | null> {
  const row = await queryOne<Row>(
    "SELECT * FROM shifts WHERE work_date = ? AND _deleted = 0 ORDER BY created_at DESC LIMIT 1",
    [workDate],
  );
  return row ? rowToShift(row) : null;
}

export async function saveShift(shift: Shift): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    const upsert = buildUpsert(
      "shifts",
      { ...shiftToRow(shift), created_at: shift.createdAt ?? now, updated_at: now, _dirty: 1, _deleted: 0 },
      PRIMARY_KEYS.shifts,
    );
    await db.runAsync(upsert.sql, upsert.values);

    // Links are replaced wholesale; removed ones are tombstoned so the delete syncs.
    await db.runAsync(
      "UPDATE shift_loads SET _deleted = 1, _dirty = 1 WHERE shift_id = ? AND _deleted = 0",
      [shift.id],
    );
    for (const loadId of shift.loadIds) {
      const link = buildUpsert(
        "shift_loads",
        { shift_id: shift.id, load_id: loadId, owner_id: shift.ownerId, _dirty: 1, _deleted: 0 },
        PRIMARY_KEYS.shift_loads,
      );
      await db.runAsync(link.sql, link.values);
    }
  });
}

export async function deleteShift(id: string): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE shifts SET _deleted = 1, _dirty = 1, updated_at = ? WHERE id = ?", toBind([now, id]));
    await db.runAsync("UPDATE shift_loads SET _deleted = 1, _dirty = 1 WHERE shift_id = ?", toBind([id]));
  });
}
