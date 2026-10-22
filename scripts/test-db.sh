#!/usr/bin/env bash
# Applique la migration Supabase sur un Postgres local jetable et lance les
# tests de sécurité. Nécessite les binaires Postgres (initdb, pg_ctl, psql).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# supabase/setup.sql doit refléter les migrations (il est collé tel quel dans Supabase).
cp "$ROOT/supabase/setup.sql" "$ROOT/supabase/.setup.check.sql"
"$ROOT/scripts/bundle-sql.sh" >/dev/null
if ! cmp -s "$ROOT/supabase/setup.sql" "$ROOT/supabase/.setup.check.sql"; then
  rm -f "$ROOT/supabase/.setup.check.sql"
  echo "supabase/setup.sql n'était pas à jour : il vient d'être régénéré, pensez à le committer." >&2
  exit 1
fi
rm -f "$ROOT/supabase/.setup.check.sql"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"

RUN=()
if [ "$(id -u)" = 0 ]; then
  # Postgres refuse de tourner en root.
  chown postgres "$WORK"
  RUN=(runuser -u postgres --)
fi

cleanup() {
  "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"${RUN[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=("${RUN[@]}" "$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"
# Le fichier unique, comme dans le SQL Editor de Supabase.
"${PSQL[@]}" -f "$ROOT/supabase/setup.sql"
for test_file in "$ROOT"/supabase/tests/*_test.sql; do
  "${PSQL[@]}" -f "$test_file"
done
