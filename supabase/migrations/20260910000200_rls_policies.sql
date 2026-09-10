-- Row Level Security.
--
-- Every table is locked down and scoped to auth.uid(). Two access paths exist:
--
--   1. The owner. `owner_id = auth.uid()` — an owner-operator or a carrier
--      company account sees everything under their own id.
--   2. A carrier's driver. A driver row can be linked to its own auth user via
--      drivers.auth_user_id. That driver sees the rows assigned to them and
--      nothing else — not the carrier's other drivers, not the carrier's other
--      trucks, and never another driver's pay.
--
-- Both helpers are SECURITY DEFINER and marked STABLE so Postgres can cache
-- them per statement, and both are schema-qualified with an empty search_path
-- so they cannot be hijacked by a user-created function.

alter table profiles            enable row level security;
alter table trucks              enable row level security;
alter table drivers             enable row level security;
alter table loads               enable row level security;
alter table load_stops          enable row level security;
alter table load_line_items     enable row level security;
alter table shifts              enable row level security;
alter table shift_loads         enable row level security;
alter table expense_categories  enable row level security;
alter table expenses            enable row level security;
alter table fuel_entries        enable row level security;
alter table attachments         enable row level security;

-- The driver row belonging to the calling user, if any. A company driver
-- working for a carrier has one; an owner-operator does not.
create or replace function current_driver_id() returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.drivers d
  where d.auth_user_id = auth.uid()
    and d.deleted_at is null
  limit 1;
$$;

-- True when the calling user is the driver a row is assigned to.
create or replace function is_my_driver_row(row_driver_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select row_driver_id is not null and row_driver_id = public.current_driver_id();
$$;

revoke execute on function current_driver_id() from public;
revoke execute on function is_my_driver_row(uuid) from public;
grant execute on function current_driver_id() to authenticated;
grant execute on function is_my_driver_row(uuid) to authenticated;

/* -------------------------------------------------------------------------- */
/* profiles — strictly your own                                                */
/* -------------------------------------------------------------------------- */

create policy profiles_select_own on profiles
  for select to authenticated using (user_id = auth.uid());
create policy profiles_insert_own on profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update_own on profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_delete_own on profiles
  for delete to authenticated using (user_id = auth.uid());

/* -------------------------------------------------------------------------- */
/* trucks — the owner writes; an assigned driver may read their truck          */
/* -------------------------------------------------------------------------- */

create policy trucks_select on trucks
  for select to authenticated
  using (owner_id = auth.uid() or is_my_driver_row(assigned_driver_id));
create policy trucks_insert_own on trucks
  for insert to authenticated with check (owner_id = auth.uid());
create policy trucks_update_own on trucks
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy trucks_delete_own on trucks
  for delete to authenticated using (owner_id = auth.uid());

/* -------------------------------------------------------------------------- */
/* drivers — the carrier sees all of theirs; a driver sees only themselves     */
/* -------------------------------------------------------------------------- */

create policy drivers_select on drivers
  for select to authenticated
  using (owner_id = auth.uid() or auth_user_id = auth.uid());
create policy drivers_insert_own on drivers
  for insert to authenticated with check (owner_id = auth.uid());
-- Only the carrier edits a driver record. A driver cannot rewrite their own
-- pay structure into a raise.
create policy drivers_update_own on drivers
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy drivers_delete_own on drivers
  for delete to authenticated using (owner_id = auth.uid());

/* -------------------------------------------------------------------------- */
/* loads                                                                       */
/* -------------------------------------------------------------------------- */

create policy loads_select on loads
  for select to authenticated
  using (owner_id = auth.uid() or is_my_driver_row(driver_id));
-- A driver may log a load against themselves under their carrier's account.
create policy loads_insert on loads
  for insert to authenticated
  with check (owner_id = auth.uid() or is_my_driver_row(driver_id));
create policy loads_update on loads
  for update to authenticated
  using (owner_id = auth.uid() or is_my_driver_row(driver_id))
  with check (owner_id = auth.uid() or is_my_driver_row(driver_id));
create policy loads_delete on loads
  for delete to authenticated
  using (owner_id = auth.uid() or is_my_driver_row(driver_id));

/* -------------------------------------------------------------------------- */
/* load children — reachability through the parent load is the rule            */
/* -------------------------------------------------------------------------- */

create policy load_stops_all on load_stops
  for all to authenticated
  using (
    exists (
      select 1 from loads l
      where l.id = load_stops.load_id
        and (l.owner_id = auth.uid() or is_my_driver_row(l.driver_id))
    )
  )
  with check (
    exists (
      select 1 from loads l
      where l.id = load_stops.load_id
        and (l.owner_id = auth.uid() or is_my_driver_row(l.driver_id))
    )
  );

create policy load_line_items_all on load_line_items
  for all to authenticated
  using (
    exists (
      select 1 from loads l
      where l.id = load_line_items.load_id
        and (l.owner_id = auth.uid() or is_my_driver_row(l.driver_id))
    )
  )
  with check (
    exists (
      select 1 from loads l
      where l.id = load_line_items.load_id
        and (l.owner_id = auth.uid() or is_my_driver_row(l.driver_id))
    )
  );

/* -------------------------------------------------------------------------- */
/* shifts                                                                      */
/* -------------------------------------------------------------------------- */

create policy shifts_select on shifts
  for select to authenticated
  using (owner_id = auth.uid() or is_my_driver_row(driver_id));
create policy shifts_insert on shifts
  for insert to authenticated
  with check (owner_id = auth.uid() or is_my_driver_row(driver_id));
create policy shifts_update on shifts
  for update to authenticated
  using (owner_id = auth.uid() or is_my_driver_row(driver_id))
  with check (owner_id = auth.uid() or is_my_driver_row(driver_id));
create policy shifts_delete on shifts
  for delete to authenticated
  using (owner_id = auth.uid() or is_my_driver_row(driver_id));

create policy shift_loads_all on shift_loads
  for all to authenticated
  using (
    exists (
      select 1 from shifts s
      where s.id = shift_loads.shift_id
        and (s.owner_id = auth.uid() or is_my_driver_row(s.driver_id))
    )
  )
  with check (
    exists (
      select 1 from shifts s
      where s.id = shift_loads.shift_id
        and (s.owner_id = auth.uid() or is_my_driver_row(s.driver_id))
    )
  );

/* -------------------------------------------------------------------------- */
/* expense_categories — system defaults are readable by all, writable by none  */
/* -------------------------------------------------------------------------- */

create policy expense_categories_select on expense_categories
  for select to authenticated
  using (owner_id is null or owner_id = auth.uid());
create policy expense_categories_insert_own on expense_categories
  for insert to authenticated with check (owner_id = auth.uid());
create policy expense_categories_update_own on expense_categories
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy expense_categories_delete_own on expense_categories
  for delete to authenticated using (owner_id = auth.uid());

/* -------------------------------------------------------------------------- */
/* expenses                                                                    */
/* -------------------------------------------------------------------------- */

create policy expenses_select on expenses
  for select to authenticated
  using (owner_id = auth.uid() or is_my_driver_row(driver_id));
create policy expenses_insert on expenses
  for insert to authenticated
  with check (owner_id = auth.uid() or is_my_driver_row(driver_id));
create policy expenses_update on expenses
  for update to authenticated
  using (owner_id = auth.uid() or is_my_driver_row(driver_id))
  with check (owner_id = auth.uid() or is_my_driver_row(driver_id));
create policy expenses_delete on expenses
  for delete to authenticated
  using (owner_id = auth.uid() or is_my_driver_row(driver_id));

create policy fuel_entries_all on fuel_entries
  for all to authenticated
  using (
    exists (
      select 1 from expenses e
      where e.id = fuel_entries.expense_id
        and (e.owner_id = auth.uid() or is_my_driver_row(e.driver_id))
    )
  )
  with check (
    exists (
      select 1 from expenses e
      where e.id = fuel_entries.expense_id
        and (e.owner_id = auth.uid() or is_my_driver_row(e.driver_id))
    )
  );

/* -------------------------------------------------------------------------- */
/* attachments                                                                 */
/* -------------------------------------------------------------------------- */

create policy attachments_all on attachments
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

-- Private bucket. Rate confirmations and BOLs are commercially sensitive and
-- receipts carry card digits, so nothing here is public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- Every object is stored under <uid>/..., which is what these policies check.
create policy documents_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy documents_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy documents_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy documents_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
