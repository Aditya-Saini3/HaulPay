-- HaulPay initial schema.
--
-- Money is stored as integer cents everywhere (bigint, because a carrier's
-- yearly gross overflows int4 at $21.5M). Miles are numeric(10,1). No floats
-- touch money.
--
-- Two ownership shapes coexist:
--   * owner_id  — the account that owns the row and pays for the data.
--   * driver_id — the person the row is about.
-- A small carrier's owner_id is the company account; their drivers each get
-- their own auth user linked through drivers.auth_user_id. RLS in the next
-- migration is built entirely on those two columns.

create extension if not exists "pgcrypto";

create type user_role as enum ('company_driver', 'owner_operator', 'small_carrier');
create type load_status as enum ('booked', 'in_transit', 'delivered', 'invoiced', 'paid');
create type trailer_type as enum ('dry_van', 'reefer', 'flatbed', 'step_deck', 'tanker', 'power_only');
create type stop_type as enum ('pickup', 'dropoff', 'stop');
create type appointment_type as enum ('fcfs', 'scheduled');
create type line_item_kind as enum ('accessorial', 'deduction');
create type recurrence_frequency as enum ('none', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually');
create type currency_code as enum ('USD', 'CAD');
create type distance_unit as enum ('mi', 'km');
create type week_start as enum ('sunday', 'monday');
create type attachment_kind as enum ('rate_confirmation', 'bol', 'receipt', 'other');

-- Rows are soft-deleted and stamped so the offline mirror can sync both ways
-- with last-write-wins.
create or replace function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

/* -------------------------------------------------------------------------- */
/* profiles                                                                    */
/* -------------------------------------------------------------------------- */

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'owner_operator',
  display_name text,
  company_name text,
  currency currency_code not null default 'USD',
  units distance_unit not null default 'mi',
  week_start week_start not null default 'sunday',
  -- Serialized PayStructure from src/earnings/types.ts. Kept as JSON because
  -- the shape differs per structure and the earnings module owns its meaning.
  pay_structure jsonb,
  -- Serialized DriverAccessorialPay.
  accessorial_pay jsonb,
  -- Whether load profit is shown before or after allocated fixed costs.
  allocate_fixed_costs boolean not null default true,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

/* -------------------------------------------------------------------------- */
/* trucks                                                                      */
/* -------------------------------------------------------------------------- */

create table trucks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  unit_number text,
  nickname text,
  make text,
  model text,
  year int,
  assigned_driver_id uuid,
  -- Valhalla truck-costing inputs. Metric because that is what Valhalla takes.
  height_m numeric(4,2),
  width_m numeric(4,2),
  length_m numeric(5,2),
  weight_t numeric(6,2),
  axle_load_t numeric(5,2),
  hazmat boolean not null default false,
  -- Used to estimate fuel cost per mile before any fuel entries exist.
  avg_mpg numeric(5,2),
  avg_fuel_price_cents int,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trucks_owner_idx on trucks (owner_id) where deleted_at is null;
create trigger trucks_set_updated_at before update on trucks
  for each row execute function set_updated_at();

/* -------------------------------------------------------------------------- */
/* drivers                                                                     */
/* -------------------------------------------------------------------------- */

create table drivers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Set when the driver has their own HaulPay login under a carrier.
  auth_user_id uuid references auth.users (id) on delete set null,
  name text not null,
  phone text,
  email text,
  -- Serialized PayStructure: kind, cpm_cents, percent, hourly_rate_cents,
  -- ot_rate_cents, ot_threshold_hours, ot_basis, guaranteed_daily_hours,
  -- flat_cents, stop_rate_cents, hybrid_floor.
  pay_structure jsonb,
  accessorial_pay jsonb,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index drivers_owner_idx on drivers (owner_id) where deleted_at is null;
create unique index drivers_auth_user_idx on drivers (auth_user_id) where auth_user_id is not null;
create trigger drivers_set_updated_at before update on drivers
  for each row execute function set_updated_at();

alter table trucks
  add constraint trucks_assigned_driver_fk
  foreign key (assigned_driver_id) references drivers (id) on delete set null;

/* -------------------------------------------------------------------------- */
/* loads                                                                       */
/* -------------------------------------------------------------------------- */

create table loads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  truck_id uuid references trucks (id) on delete set null,
  driver_id uuid references drivers (id) on delete set null,
  load_number text,
  broker text,
  commodity text,
  weight_lbs int,
  trailer_type trailer_type,
  status load_status not null default 'booked',
  linehaul_cents bigint not null default 0,
  -- Loaded miles come from Valhalla but stay editable: brokers pay on their
  -- own mileage and the driver's number has to be able to win.
  loaded_miles numeric(10,1) not null default 0,
  deadhead_miles numeric(10,1) not null default 0,
  -- What the payer actually paid on. Null falls back to loaded_miles.
  paid_miles numeric(10,1),
  started_at timestamptz,
  ended_at timestamptz,
  hours_worked numeric(6,2),
  driving_hours numeric(6,2),
  loading_hours numeric(6,2),
  waiting_hours numeric(6,2),
  unpaid_break_hours numeric(6,2),
  -- Encoded polyline6 from Valhalla, decoded for the map. Route preview only,
  -- never presented as turn-by-turn navigation.
  route_geometry text,
  route_provider text,
  route_computed_at timestamptz,
  currency currency_code not null default 'USD',
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loads_miles_nonneg check (
    loaded_miles >= 0 and deadhead_miles >= 0 and (paid_miles is null or paid_miles >= 0)
  ),
  constraint loads_ends_after_start check (ended_at is null or started_at is null or ended_at >= started_at)
);

create index loads_owner_started_idx on loads (owner_id, started_at desc) where deleted_at is null;
create index loads_truck_idx on loads (truck_id) where deleted_at is null;
create index loads_driver_idx on loads (driver_id) where deleted_at is null;
create index loads_status_idx on loads (owner_id, status) where deleted_at is null;
create trigger loads_set_updated_at before update on loads
  for each row execute function set_updated_at();

/* -------------------------------------------------------------------------- */
/* load_stops                                                                  */
/* -------------------------------------------------------------------------- */

create table load_stops (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  sequence int not null,
  type stop_type not null,
  name text,
  address text,
  city text,
  state text,
  postal_code text,
  country text,
  lat double precision,
  lng double precision,
  appointment_at timestamptz,
  appointment_type appointment_type,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint load_stops_latlng check (
    (lat is null and lng is null)
    or (lat between -90 and 90 and lng between -180 and 180)
  )
);

create unique index load_stops_sequence_idx on load_stops (load_id, sequence);
create trigger load_stops_set_updated_at before update on load_stops
  for each row execute function set_updated_at();

/* -------------------------------------------------------------------------- */
/* load_line_items                                                             */
/* -------------------------------------------------------------------------- */

create table load_line_items (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind line_item_kind not null,
  -- 'detention' | 'layover' | 'tonu' | ... for accessorials,
  -- 'dispatch' | 'factoring' | ... for deductions. Free text so a user can add
  -- their own without a migration; the app maps known codes to icons.
  code text not null default 'other',
  label text not null,
  amount_cents bigint,
  -- Deductions may be a percentage of gross instead of a flat amount. An
  -- accessorial priced off gross would be self-referential, so it is rejected.
  percent_of_gross numeric(6,3),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_item_has_a_value check (amount_cents is not null or percent_of_gross is not null),
  constraint accessorials_are_flat check (kind = 'deduction' or percent_of_gross is null)
);

create index load_line_items_load_idx on load_line_items (load_id);
create trigger load_line_items_set_updated_at before update on load_line_items
  for each row execute function set_updated_at();

/* -------------------------------------------------------------------------- */
/* shifts                                                                      */
/* -------------------------------------------------------------------------- */

-- Local, drayage and yard drivers work shifts that do not map to discrete
-- loads. A driver can run the whole app on shifts and never create a load.
create table shifts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  driver_id uuid references drivers (id) on delete set null,
  truck_id uuid references trucks (id) on delete set null,
  -- The driver's own calendar day. A shift that clocks out after midnight
  -- still belongs to the day it started, which is how a settlement week reads.
  work_date date not null,
  start_at timestamptz,
  end_at timestamptz,
  unpaid_break_hours numeric(6,2) not null default 0,
  hours_worked numeric(6,2),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_ends_after_start check (end_at is null or start_at is null or end_at >= start_at)
);

create index shifts_owner_date_idx on shifts (owner_id, work_date desc) where deleted_at is null;
create trigger shifts_set_updated_at before update on shifts
  for each row execute function set_updated_at();

create table shift_loads (
  shift_id uuid not null references shifts (id) on delete cascade,
  load_id uuid not null references loads (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  primary key (shift_id, load_id)
);

/* -------------------------------------------------------------------------- */
/* expense_categories                                                          */
/* -------------------------------------------------------------------------- */

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  -- Null owner_id marks a system default, visible to everyone and editable by
  -- no one. A user's own categories behave identically everywhere else.
  owner_id uuid references auth.users (id) on delete cascade,
  parent_id uuid references expense_categories (id) on delete set null,
  name text not null,
  icon text not null default 'ellipse-outline',
  color text not null default '#7C8B99',
  is_fixed boolean not null default false,
  sort_order int not null default 100,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expense_categories_owner_idx on expense_categories (owner_id) where deleted_at is null;
create unique index expense_categories_system_name_idx
  on expense_categories (name, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where owner_id is null;
create trigger expense_categories_set_updated_at before update on expense_categories
  for each row execute function set_updated_at();

/* -------------------------------------------------------------------------- */
/* expenses                                                                    */
/* -------------------------------------------------------------------------- */

create table expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  truck_id uuid references trucks (id) on delete set null,
  load_id uuid references loads (id) on delete set null,
  driver_id uuid references drivers (id) on delete set null,
  category_id uuid references expense_categories (id) on delete set null,
  amount_cents bigint not null default 0,
  incurred_on date not null,
  vendor text,
  notes text,
  receipt_url text,
  currency currency_code not null default 'USD',
  -- An expense repeats on this rule; the app generates the individual entries.
  recurrence_rule recurrence_frequency not null default 'none',
  recurrence_start_on date,
  recurrence_end_on date,
  -- Points at the template row this entry was generated from, so generated
  -- rows can be edited or skipped one at a time without breaking the series.
  generated_from_id uuid references expenses (id) on delete cascade,
  is_template boolean not null default false,
  skipped boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_owner_date_idx on expenses (owner_id, incurred_on desc) where deleted_at is null;
create index expenses_truck_idx on expenses (truck_id) where deleted_at is null;
create index expenses_load_idx on expenses (load_id) where deleted_at is null;
create index expenses_template_idx on expenses (generated_from_id) where generated_from_id is not null;
create trigger expenses_set_updated_at before update on expenses
  for each row execute function set_updated_at();

/* -------------------------------------------------------------------------- */
/* fuel_entries                                                                */
/* -------------------------------------------------------------------------- */

create table fuel_entries (
  expense_id uuid primary key references expenses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  gallons numeric(8,3) not null default 0,
  price_per_gallon_cents int,
  odometer int,
  -- Two-letter state or province. This is what IFTA prep is built on.
  state text,
  is_def boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fuel_entries_owner_idx on fuel_entries (owner_id);
create trigger fuel_entries_set_updated_at before update on fuel_entries
  for each row execute function set_updated_at();

/* -------------------------------------------------------------------------- */
/* attachments                                                                 */
/* -------------------------------------------------------------------------- */

create table attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  load_id uuid references loads (id) on delete cascade,
  expense_id uuid references expenses (id) on delete cascade,
  kind attachment_kind not null default 'other',
  -- Path inside the private 'documents' storage bucket, always prefixed with
  -- the owner's uid so the storage policy can check it.
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attachment_belongs_to_something check (load_id is not null or expense_id is not null)
);

create index attachments_load_idx on attachments (load_id);
create index attachments_expense_idx on attachments (expense_id);
create trigger attachments_set_updated_at before update on attachments
  for each row execute function set_updated_at();
