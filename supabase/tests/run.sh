#!/usr/bin/env bash
# Applies the migrations to a scratch database and runs the RLS assertions.
#
#   PGURL=postgres://postgres@localhost:5432 ./supabase/tests/run.sh
#
# Against a plain PostgreSQL server the shim stands in for the auth and storage
# schemas Supabase provides. Against a Supabase database, skip the shim.
set -euo pipefail

PGURL="${PGURL:-postgres://postgres@localhost:5432}"
DB="${DB:-haulpay_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL="psql -v ON_ERROR_STOP=1 -q"

echo "==> recreating $DB"
$PSQL "$PGURL/postgres" -c "drop database if exists $DB;" -c "create database $DB;"

if [ "${SKIP_SHIM:-0}" != "1" ]; then
  echo "==> applying Supabase shim"
  $PSQL "$PGURL/$DB" -f "$ROOT/supabase/tests/00_supabase_shim.sql"
fi

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "==> $(basename "$migration")"
  $PSQL "$PGURL/$DB" -f "$migration"
done

echo "==> RLS assertions"
psql -v ON_ERROR_STOP=1 "$PGURL/$DB" -f "$ROOT/supabase/tests/rls_test.sql" 2>&1 \
  | grep -E "NOTICE:  ok:|ERROR|FAIL" \
  | sed 's/^psql:[^ ]* //'

echo "==> passed"
