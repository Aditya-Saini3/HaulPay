import * as SQLite from "expo-sqlite";
import { CREATE_TABLES, SCHEMA_VERSION } from "./schema";

/**
 * The local database handle.
 *
 * Everything the app reads comes from here, never straight from Supabase. The
 * sync layer keeps this in step with the server in the background, which is
 * what makes the app work in a dead zone in Nevada and catch up in Reno.
 */

const DATABASE_NAME = "haulpay.db";

let database: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  // Concurrent callers during startup must share one open, not race three.
  if (!opening) opening = openAndMigrate();
  database = await opening;
  return database;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync(CREATE_TABLES);

  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;
  if (current < SCHEMA_VERSION) {
    await runMigrations(db, current);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}

/**
 * Forward-only migrations from whatever version is on the device.
 *
 * `CREATE_TABLES` runs first with IF NOT EXISTS, so a fresh install already has
 * the current shape and every case here is a no-op for it. These exist for
 * devices carrying an older database, and each one has to tolerate being run
 * against a table that already has the column.
 */
async function runMigrations(db: SQLite.SQLiteDatabase, from: number): Promise<void> {
  if (from > 0 && from < 2) {
    // v2 added profiles.defaults. SQLite has no ADD COLUMN IF NOT EXISTS, and
    // a duplicate-column error here is the expected outcome on a fresh install.
    await db.execAsync("ALTER TABLE profiles ADD COLUMN defaults TEXT").catch(() => undefined);
  }
}

/** Drops everything. Used on sign-out so the next account starts clean. */
export async function resetDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
    for (const table of tables) {
      await db.runAsync(`DELETE FROM ${table.name}`);
    }
  });
}

export async function closeDatabase(): Promise<void> {
  if (!database) return;
  await database.closeAsync();
  database = null;
  opening = null;
}

/* -------------------------------------------------------------------------- */
/* Row helpers                                                                 */
/* -------------------------------------------------------------------------- */

export type Row = Record<string, unknown>;

/** Exactly what expo-sqlite can bind to a placeholder. */
export type BindValue = string | number | null | boolean | Uint8Array;

/**
 * Narrows arbitrary values to bindable ones. Anything SQLite cannot take —
 * an object, an array, undefined — becomes NULL rather than throwing deep
 * inside the driver with no indication of which column was at fault.
 */
export function toBind(values: readonly unknown[]): BindValue[] {
  return values.map((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (value instanceof Uint8Array) return value;
    return null;
  });
}

/** SQLite has no boolean type; 1/0 come back as numbers. */
export function toBool(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}

export function fromBool(value: boolean | null | undefined): number {
  return value ? 1 : 0;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/** JSON columns hold serialized pay structures and similar. */
export function toJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function fromJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

/**
 * Builds a parameterised UPSERT. Values are always bound, never interpolated —
 * a broker name with an apostrophe in it should not be able to end a statement.
 */
export function buildUpsert(
  table: string,
  row: Row,
  primaryKeys: string[],
): { sql: string; values: BindValue[] } {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns
    .filter((c) => !primaryKeys.includes(c))
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");

  const sql =
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ` +
    `ON CONFLICT (${primaryKeys.join(", ")}) DO UPDATE SET ${updates}`;

  return { sql, values: toBind(columns.map((c) => row[c])) };
}

export function nowIso(): string {
  return new Date().toISOString();
}
