/**
 * The local SQLite schema, mirroring Postgres closely enough that a row can be
 * pushed up or pulled down without translation beyond snake_case to camelCase.
 *
 * Three columns exist only locally and never sync:
 *   _dirty      — the row has local changes waiting to go up.
 *   _deleted    — tombstone, so a delete made offline still propagates.
 *   _synced_at  — when the row last matched the server.
 *
 * Money is INTEGER cents. SQLite has no decimal type and REAL is a float, so
 * storing dollars here would reintroduce exactly the rounding the earnings
 * module refuses to have.
 */

export const SCHEMA_VERSION = 2;

export const CREATE_TABLES = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner_operator',
  display_name TEXT,
  company_name TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  units TEXT NOT NULL DEFAULT 'mi',
  week_start TEXT NOT NULL DEFAULT 'sunday',
  pay_structure TEXT,
  accessorial_pay TEXT,
  defaults TEXT,
  allocate_fixed_costs INTEGER NOT NULL DEFAULT 1,
  onboarding_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE TABLE IF NOT EXISTS trucks (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  unit_number TEXT,
  nickname TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  assigned_driver_id TEXT,
  height_m REAL,
  width_m REAL,
  length_m REAL,
  weight_t REAL,
  axle_load_t REAL,
  hazmat INTEGER NOT NULL DEFAULT 0,
  avg_mpg REAL,
  avg_fuel_price_cents INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  auth_user_id TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  pay_structure TEXT,
  accessorial_pay TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE TABLE IF NOT EXISTS loads (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  truck_id TEXT,
  driver_id TEXT,
  load_number TEXT,
  broker TEXT,
  commodity TEXT,
  weight_lbs INTEGER,
  trailer_type TEXT,
  status TEXT NOT NULL DEFAULT 'booked',
  linehaul_cents INTEGER NOT NULL DEFAULT 0,
  loaded_miles REAL NOT NULL DEFAULT 0,
  deadhead_miles REAL NOT NULL DEFAULT 0,
  paid_miles REAL,
  started_at TEXT,
  ended_at TEXT,
  hours_worked REAL,
  driving_hours REAL,
  loading_hours REAL,
  waiting_hours REAL,
  unpaid_break_hours REAL,
  route_geometry TEXT,
  route_provider TEXT,
  route_computed_at TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE INDEX IF NOT EXISTS loads_started_idx ON loads (started_at DESC);
CREATE INDEX IF NOT EXISTS loads_status_idx ON loads (status);
CREATE INDEX IF NOT EXISTS loads_truck_idx ON loads (truck_id);

CREATE TABLE IF NOT EXISTS load_stops (
  id TEXT PRIMARY KEY NOT NULL,
  load_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  lat REAL,
  lng REAL,
  appointment_at TEXT,
  appointment_type TEXT,
  reference TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE INDEX IF NOT EXISTS load_stops_load_idx ON load_stops (load_id, sequence);

CREATE TABLE IF NOT EXISTS load_line_items (
  id TEXT PRIMARY KEY NOT NULL,
  load_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT 'other',
  label TEXT NOT NULL,
  amount_cents INTEGER,
  percent_of_gross REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE INDEX IF NOT EXISTS load_line_items_load_idx ON load_line_items (load_id);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  driver_id TEXT,
  truck_id TEXT,
  work_date TEXT NOT NULL,
  start_at TEXT,
  end_at TEXT,
  unpaid_break_hours REAL NOT NULL DEFAULT 0,
  hours_worked REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE INDEX IF NOT EXISTS shifts_date_idx ON shifts (work_date DESC);

CREATE TABLE IF NOT EXISTS shift_loads (
  shift_id TEXT NOT NULL,
  load_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT,
  PRIMARY KEY (shift_id, load_id)
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT,
  parent_id TEXT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'ellipse-outline',
  color TEXT NOT NULL DEFAULT '#7C8B99',
  is_fixed INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  truck_id TEXT,
  load_id TEXT,
  driver_id TEXT,
  category_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  incurred_on TEXT NOT NULL,
  vendor TEXT,
  notes TEXT,
  receipt_url TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  recurrence_rule TEXT NOT NULL DEFAULT 'none',
  recurrence_start_on TEXT,
  recurrence_end_on TEXT,
  generated_from_id TEXT,
  is_template INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (incurred_on DESC);
CREATE INDEX IF NOT EXISTS expenses_load_idx ON expenses (load_id);
CREATE INDEX IF NOT EXISTS expenses_truck_idx ON expenses (truck_id);
CREATE INDEX IF NOT EXISTS expenses_template_idx ON expenses (generated_from_id);

CREATE TABLE IF NOT EXISTS fuel_entries (
  expense_id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  gallons REAL NOT NULL DEFAULT 0,
  price_per_gallon_cents INTEGER,
  odometer INTEGER,
  state TEXT,
  is_def INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  load_id TEXT,
  expense_id TEXT,
  kind TEXT NOT NULL DEFAULT 'other',
  storage_path TEXT NOT NULL,
  local_uri TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  _dirty INTEGER NOT NULL DEFAULT 0,
  _deleted INTEGER NOT NULL DEFAULT 0,
  _synced_at TEXT
);

CREATE INDEX IF NOT EXISTS attachments_load_idx ON attachments (load_id);
CREATE INDEX IF NOT EXISTS attachments_expense_idx ON attachments (expense_id);

-- Sync bookkeeping: the high-water mark per table for incremental pulls.
CREATE TABLE IF NOT EXISTS sync_state (
  table_name TEXT PRIMARY KEY NOT NULL,
  last_pulled_at TEXT,
  last_pushed_at TEXT
);
`;

/** Tables that sync, in dependency order — parents must land before children. */
export const SYNCED_TABLES = [
  "profiles",
  "trucks",
  "drivers",
  "loads",
  "load_stops",
  "load_line_items",
  "shifts",
  "shift_loads",
  "expense_categories",
  "expenses",
  "fuel_entries",
  "attachments",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** The primary key column for each table, since two of them are not `id`. */
export const PRIMARY_KEYS: Record<SyncedTable, string[]> = {
  profiles: ["user_id"],
  trucks: ["id"],
  drivers: ["id"],
  loads: ["id"],
  load_stops: ["id"],
  load_line_items: ["id"],
  shifts: ["id"],
  shift_loads: ["shift_id", "load_id"],
  expense_categories: ["id"],
  expenses: ["id"],
  fuel_entries: ["expense_id"],
  attachments: ["id"],
};

/** Local-only columns, stripped before a row is pushed to Postgres. */
export const LOCAL_ONLY_COLUMNS = ["_dirty", "_deleted", "_synced_at", "local_uri", "uploaded"];
