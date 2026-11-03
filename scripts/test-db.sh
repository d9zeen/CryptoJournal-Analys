#!/usr/bin/env bash
# Прогоняет все миграции на чистой временной базе Postgres и запускает тесты RLS.
# Нужен локальный Postgres 15+ и доступ через `psql` (по умолчанию пользователь postgres).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=cryptojournal_test
PSQL=${PSQL:-"psql -U postgres -h localhost"}
$PSQL -q -c "drop database if exists $DB" >/dev/null
$PSQL -q -c "drop role if exists anon; drop role if exists authenticated; drop role if exists service_role" >/dev/null 2>&1 || true
$PSQL -q -c "create database $DB" >/dev/null
$PSQL -q -v ON_ERROR_STOP=1 -d $DB -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "→ миграция $f"
  $PSQL -q -v ON_ERROR_STOP=1 -d $DB -f "$f"
done
$PSQL -q -v ON_ERROR_STOP=1 -d $DB -f supabase/tests/rls_test.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: NOTICE:  /  /'
