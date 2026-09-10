-- Account-level defaults captured during the setup wizard.
--
-- Dispatch and factoring come off nearly every load, so storing them lets a new
-- load start with those deduction lines already on it. Per diem is a per-day
-- allowance priced over distinct days worked. Authority is informational and
-- affects no calculation — it is what an owner-operator answers when asked
-- whether they are leased on.
--
-- Serialized AccountDefaults from src/earnings/types.ts:
--   { dispatchPercent, factoringPercent, perDiem: { perDayCents, overnightOnly }, authority }

alter table profiles
  add column if not exists defaults jsonb;

comment on column profiles.defaults is
  'AccountDefaults: dispatch/factoring percentages that pre-fill new loads, per diem, and leased-on vs own authority.';
