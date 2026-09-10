import { profileToRow, rowToProfile, rowToDriver, driverToRow, rowToTruck, truckToRow } from "../mappers";
import type { Driver, Profile, Truck } from "../models";
import { PRIMARY_KEYS } from "../schema";
import { buildUpsert, getDatabase, nowIso, type Row } from "../sqlite";
import { query, queryOne, softDelete } from "./base";

export async function getProfile(userId: string): Promise<Profile | null> {
  const row = await queryOne<Row>("SELECT * FROM profiles WHERE user_id = ? AND _deleted = 0", [userId]);
  return row ? rowToProfile(row) : null;
}

export async function saveProfile(profile: Profile): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  const { sql, values } = buildUpsert(
    "profiles",
    { ...profileToRow(profile), created_at: now, updated_at: now, _dirty: 1, _deleted: 0 },
    PRIMARY_KEYS.profiles,
  );
  await db.runAsync(sql, values);
}

export async function listTrucks(): Promise<Truck[]> {
  const rows = await query<Row>("SELECT * FROM trucks WHERE _deleted = 0 ORDER BY unit_number, nickname");
  return rows.map(rowToTruck);
}

export async function getTruck(id: string): Promise<Truck | null> {
  const row = await queryOne<Row>("SELECT * FROM trucks WHERE id = ? AND _deleted = 0", [id]);
  return row ? rowToTruck(row) : null;
}

export async function saveTruck(truck: Truck): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  const { sql, values } = buildUpsert(
    "trucks",
    { ...truckToRow(truck), created_at: now, updated_at: now, _dirty: 1, _deleted: 0 },
    PRIMARY_KEYS.trucks,
  );
  await db.runAsync(sql, values);
}

export async function deleteTruck(id: string): Promise<void> {
  await softDelete("trucks", id);
}

export async function listDrivers(): Promise<Driver[]> {
  const rows = await query<Row>("SELECT * FROM drivers WHERE _deleted = 0 ORDER BY name");
  return rows.map(rowToDriver);
}

export async function getDriver(id: string): Promise<Driver | null> {
  const row = await queryOne<Row>("SELECT * FROM drivers WHERE id = ? AND _deleted = 0", [id]);
  return row ? rowToDriver(row) : null;
}

export async function saveDriver(driver: Driver): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  const { sql, values } = buildUpsert(
    "drivers",
    { ...driverToRow(driver), created_at: now, updated_at: now, _dirty: 1, _deleted: 0 },
    PRIMARY_KEYS.drivers,
  );
  await db.runAsync(sql, values);
}

export async function deleteDriver(id: string): Promise<void> {
  await softDelete("drivers", id);
}
