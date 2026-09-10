import { LOCAL_ONLY_COLUMNS, PRIMARY_KEYS, SYNCED_TABLES, type SyncedTable } from "@/db/schema";
import { buildUpsert, getDatabase, nowIso, type Row } from "@/db/sqlite";
import { supabase } from "@/lib/supabase";

/**
 * Two-way sync between the local mirror and Postgres.
 *
 * Push first, then pull. A dirty local row is the outbox — there is no separate
 * queue to get out of step with the data. Conflicts resolve last-write-wins on
 * `updated_at`, which for a single-user-per-account app is the right trade: the
 * alternative is asking a driver in a truck stop to merge two versions of a
 * rate confirmation.
 *
 * Tables sync in dependency order so a load lands before its stops, and a
 * partial sync never leaves a child row pointing at a parent that is not there
 * yet.
 */

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: { table: string; message: string }[];
  startedAt: string;
  finishedAt: string;
}

/** Server column names, so a local-only column never reaches Postgres. */
function toServerRow(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (LOCAL_ONLY_COLUMNS.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

function primaryKeyMatch(table: SyncedTable, row: Row): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  for (const key of PRIMARY_KEYS[table]) match[key] = row[key];
  return match;
}

async function pushTable(table: SyncedTable): Promise<{ pushed: number; error?: string }> {
  const client = supabase;
  if (!client) return { pushed: 0 };

  const db = await getDatabase();
  const dirty = await db.getAllAsync<Row>(`SELECT * FROM ${table} WHERE _dirty = 1`);
  if (dirty.length === 0) return { pushed: 0 };

  const deletions = dirty.filter((row) => row._deleted === 1);
  const upserts = dirty.filter((row) => row._deleted !== 1);
  let pushed = 0;

  // Deletes go first: a row the user removed should not be re-upserted by a
  // later batch that still holds a stale copy of it.
  for (const row of deletions) {
    const match = primaryKeyMatch(table, row);
    const { error } = await client.from(table).delete().match(match);
    // A row already gone from the server is a success, not a failure.
    if (error && error.code !== "PGRST116") return { pushed, error: error.message };
    await db.runAsync(
      `DELETE FROM ${table} WHERE ${PRIMARY_KEYS[table].map((k) => `${k} = ?`).join(" AND ")}`,
      PRIMARY_KEYS[table].map((k) => row[k] as never),
    );
    pushed += 1;
  }

  if (upserts.length > 0) {
    const payload = upserts.map(toServerRow);
    const { error } = await client
      .from(table)
      .upsert(payload, { onConflict: PRIMARY_KEYS[table].join(",") });
    if (error) return { pushed, error: error.message };

    const now = nowIso();
    await db.withTransactionAsync(async () => {
      for (const row of upserts) {
        const where = PRIMARY_KEYS[table].map((k) => `${k} = ?`).join(" AND ");
        await db.runAsync(
          `UPDATE ${table} SET _dirty = 0, _synced_at = ? WHERE ${where}`,
          [now, ...PRIMARY_KEYS[table].map((k) => row[k] as never)],
        );
      }
    });
    pushed += upserts.length;
  }

  return { pushed };
}

async function pullTable(table: SyncedTable): Promise<{ pulled: number; error?: string }> {
  const client = supabase;
  if (!client) return { pulled: 0 };

  const db = await getDatabase();
  const state = await db.getFirstAsync<{ last_pulled_at: string | null }>(
    "SELECT last_pulled_at FROM sync_state WHERE table_name = ?",
    [table],
  );
  const since = state?.last_pulled_at;

  // Incremental after the first run: only rows the server has touched since.
  let request = client.from(table).select("*").order("updated_at", { ascending: true }).limit(1000);
  if (since) request = request.gt("updated_at", since);

  const { data, error } = await request;
  if (error) return { pulled: 0, error: error.message };
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    await markPulled(table, since ?? nowIso());
    return { pulled: 0 };
  }

  let highWater = since ?? "";
  await db.withTransactionAsync(async () => {
    for (const serverRow of rows) {
      const updatedAt = String(serverRow.updated_at ?? "");
      if (updatedAt > highWater) highWater = updatedAt;

      // A local edit that has not been pushed yet wins over an older server
      // copy. Without this check a pull immediately after an offline edit
      // would silently discard the driver's own change.
      const where = PRIMARY_KEYS[table].map((k) => `${k} = ?`).join(" AND ");
      const keyValues = PRIMARY_KEYS[table].map((k) => serverRow[k] as never);
      const local = await db.getFirstAsync<Row>(
        `SELECT updated_at, _dirty FROM ${table} WHERE ${where}`,
        keyValues,
      );
      if (local?._dirty === 1 && String(local.updated_at ?? "") >= updatedAt) continue;

      const { sql, values } = buildUpsert(
        table,
        { ...serverRow, _dirty: 0, _deleted: 0, _synced_at: nowIso() },
        PRIMARY_KEYS[table],
      );
      await db.runAsync(sql, values);
    }
  });

  await markPulled(table, highWater || nowIso());
  return { pulled: rows.length };
}

async function markPulled(table: SyncedTable, at: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sync_state (table_name, last_pulled_at) VALUES (?, ?)
     ON CONFLICT (table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
    [table, at],
  );
}

let inFlight: Promise<SyncResult> | null = null;

/**
 * Runs a full sync. Concurrent callers share one run rather than racing — a
 * screen focus, a network reconnect and a pull-to-refresh can all land at once.
 */
export function sync(): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<SyncResult> {
  const startedAt = nowIso();
  const result: SyncResult = { pushed: 0, pulled: 0, errors: [], startedAt, finishedAt: startedAt };

  if (!supabase) {
    result.finishedAt = nowIso();
    return result;
  }

  for (const table of SYNCED_TABLES) {
    const push = await pushTable(table);
    result.pushed += push.pushed;
    if (push.error) result.errors.push({ table, message: push.error });
  }

  for (const table of SYNCED_TABLES) {
    const pull = await pullTable(table);
    result.pulled += pull.pulled;
    if (pull.error) result.errors.push({ table, message: pull.error });
  }

  result.finishedAt = nowIso();
  return result;
}

/** How many local rows are still waiting to go up. Drives the "N pending" chip. */
export async function pendingCount(): Promise<number> {
  const db = await getDatabase();
  let total = 0;
  for (const table of SYNCED_TABLES) {
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE _dirty = 1`,
    );
    total += row?.n ?? 0;
  }
  return total;
}
