import { buildUpsert, getDatabase, nowIso, toBind, type Row } from "../sqlite";
import { PRIMARY_KEYS, type SyncedTable } from "../schema";

/**
 * Shared write path for every repository.
 *
 * Any local write marks the row dirty and stamps updated_at. The sync layer
 * looks for nothing else — that flag is the entire outbox, which is why a
 * write made in a dead zone is indistinguishable from one made on wifi.
 */

export async function upsertLocal(table: SyncedTable, row: Row): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  const withMeta: Row = {
    ...row,
    created_at: row.created_at ?? now,
    updated_at: now,
    _dirty: 1,
    _deleted: 0,
  };
  const { sql, values } = buildUpsert(table, withMeta, PRIMARY_KEYS[table]);
  await db.runAsync(sql, values);
}

export async function upsertMany(table: SyncedTable, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const now = nowIso();
    for (const row of rows) {
      const { sql, values } = buildUpsert(
        table,
        { ...row, created_at: row.created_at ?? now, updated_at: now, _dirty: 1, _deleted: 0 },
        PRIMARY_KEYS[table],
      );
      await db.runAsync(sql, values);
    }
  });
}

/**
 * Soft delete. A hard delete would be invisible to the server: the row would
 * simply stop being pushed and would come back on the next pull.
 */
export async function softDelete(table: SyncedTable, id: string, idColumn = "id"): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE ${table} SET _deleted = 1, _dirty = 1, updated_at = ? WHERE ${idColumn} = ?`,
    toBind([nowIso(), id]),
  );
}

export async function getRow(
  table: SyncedTable,
  id: string,
  idColumn = "id",
): Promise<Row | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Row>(
    `SELECT * FROM ${table} WHERE ${idColumn} = ? AND _deleted = 0`,
    toBind([id]),
  );
}

export async function allRows(table: SyncedTable, orderBy = ""): Promise<Row[]> {
  const db = await getDatabase();
  const order = orderBy ? ` ORDER BY ${orderBy}` : "";
  return db.getAllAsync<Row>(`SELECT * FROM ${table} WHERE _deleted = 0${order}`);
}

export async function query<T = Row>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  const db = await getDatabase();
  return db.getAllAsync<T>(sql, toBind(params));
}

export async function queryOne<T = Row>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const db = await getDatabase();
  return db.getFirstAsync<T>(sql, toBind(params));
}
