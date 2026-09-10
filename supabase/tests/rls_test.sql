-- RLS assertions.
--
-- Run against a database that has the shim plus all migrations applied:
--
--   psql -f supabase/tests/00_supabase_shim.sql
--   psql -f supabase/migrations/*.sql
--   psql -f supabase/tests/rls_test.sql
--
-- Every check raises an exception on failure, so a clean run means the policies
-- hold. The cast that matters: these run as the `authenticated` role with a
-- JWT subject set, exactly as a request from the app arrives.

\set ON_ERROR_STOP on

begin;

-- Three accounts: a carrier and two of its drivers, plus an unrelated
-- owner-operator who must never see any of it.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'carrier@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'driver-a@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'driver-b@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com');

insert into profiles (user_id, role, company_name) values
  ('11111111-1111-1111-1111-111111111111', 'small_carrier', 'Bluebird Transport'),
  ('22222222-2222-2222-2222-222222222222', 'company_driver', null),
  ('33333333-3333-3333-3333-333333333333', 'company_driver', null),
  ('44444444-4444-4444-4444-444444444444', 'owner_operator', null);

insert into drivers (id, owner_id, auth_user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Driver A'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Driver B');

insert into trucks (id, owner_id, unit_number, assigned_driver_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '101', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '102', 'aaaaaaaa-0000-0000-0000-000000000002');

insert into loads (id, owner_id, truck_id, driver_id, load_number, linehaul_cents, loaded_miles, started_at) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A-1', 250000, 900, '2026-03-02T08:00:00-06:00'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'B-1', 310000, 1100, '2026-03-03T08:00:00-06:00');

insert into load_line_items (load_id, owner_id, kind, code, label, amount_cents) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'accessorial', 'detention', 'Detention', 15000);

insert into expenses (id, owner_id, driver_id, truck_id, amount_cents, incurred_on) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 42000, '2026-03-02'),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 51000, '2026-03-03');

create or replace function assert_eq(actual bigint, expected bigint, what text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % — expected %, got %', what, expected, actual;
  end if;
  raise notice 'ok: % (%)', what, actual;
end;
$$;

-- Acts as an authenticated request from a given user.
create or replace function become(uid text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
end;
$$;

set local role authenticated;

/* -------------------------------------------------------------------------- */

select become('11111111-1111-1111-1111-111111111111');
select assert_eq((select count(*) from loads), 2, 'carrier sees both drivers'' loads');
select assert_eq((select count(*) from drivers), 2, 'carrier sees both driver records');
select assert_eq((select count(*) from trucks), 2, 'carrier sees both trucks');
select assert_eq((select count(*) from expenses), 2, 'carrier sees both drivers'' expenses');

select become('22222222-2222-2222-2222-222222222222');
select assert_eq((select count(*) from loads), 1, 'driver A sees only their own load');
select assert_eq((select count(*) from loads where load_number = 'A-1'), 1, 'and it is the right one');
select assert_eq((select count(*) from expenses), 1, 'driver A sees only their own expenses');
select assert_eq((select count(*) from trucks), 1, 'driver A sees only their assigned truck');
select assert_eq((select count(*) from drivers), 1, 'driver A cannot see driver B''s record');
select assert_eq((select count(*) from load_line_items), 1, 'driver A sees line items on their own load');
select assert_eq((select count(*) from profiles), 1, 'driver A sees only their own profile');

select become('33333333-3333-3333-3333-333333333333');
select assert_eq((select count(*) from loads where load_number = 'A-1'), 0, 'driver B cannot see driver A''s load');
select assert_eq((select count(*) from load_line_items), 0, 'driver B cannot see driver A''s money lines');
select assert_eq((select count(*) from expenses where amount_cents = 42000), 0, 'driver B cannot see driver A''s expenses');

select become('44444444-4444-4444-4444-444444444444');
select assert_eq((select count(*) from loads), 0, 'an unrelated account sees nothing');
select assert_eq((select count(*) from drivers), 0, 'an unrelated account sees no drivers');
select assert_eq((select count(*) from trucks), 0, 'an unrelated account sees no trucks');
select assert_eq((select count(*) from expenses), 0, 'an unrelated account sees no expenses');
select assert_eq((select count(*) from profiles), 1, 'an unrelated account sees only its own profile');

-- System expense categories are shared, and nobody can rewrite them.
select assert_eq((select count(*) from expense_categories where owner_id is null), 35, 'system categories are readable by every account');

do $$
begin
  update expense_categories set name = 'hijacked' where owner_id is null;
  if found then
    raise exception 'FAIL: a user was able to edit a system expense category';
  end if;
  raise notice 'ok: system categories are not editable by users';
end;
$$;

-- A driver must not be able to raise their own pay.
select become('22222222-2222-2222-2222-222222222222');
do $$
begin
  update drivers set pay_structure = '{"kind":"per_mile","cpmCents":999}'::jsonb
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if found then
    raise exception 'FAIL: a driver rewrote their own pay structure';
  end if;
  raise notice 'ok: a driver cannot rewrite their own pay structure';
end;
$$;

-- A driver must not be able to reassign a load to themselves.
do $$
begin
  update loads set driver_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = 'cccccccc-0000-0000-0000-000000000002';
  if found then
    raise exception 'FAIL: a driver stole another driver''s load';
  end if;
  raise notice 'ok: a driver cannot reassign another driver''s load to themselves';
end;
$$;

-- Writes must not be able to land under someone else's account.
do $$
begin
  begin
    insert into loads (owner_id, driver_id, load_number, linehaul_cents, loaded_miles)
    values ('44444444-4444-4444-4444-444444444444', null, 'FORGED', 100000, 100);
    raise exception 'FAIL: a load was inserted under another account';
  exception when insufficient_privilege then
    raise notice 'ok: cannot insert a load under another account';
  end;
end;
$$;

-- Storage objects are private to the folder named for their owner.
set local role postgres;
insert into storage.objects (bucket_id, name, owner) values
  ('documents', '11111111-1111-1111-1111-111111111111/loads/rate-con.pdf', '11111111-1111-1111-1111-111111111111'),
  ('documents', '22222222-2222-2222-2222-222222222222/receipts/fuel.jpg', '22222222-2222-2222-2222-222222222222');
set local role authenticated;

select become('22222222-2222-2222-2222-222222222222');
select assert_eq((select count(*) from storage.objects), 1, 'a user sees only their own storage objects');

set local role postgres;
rollback;
