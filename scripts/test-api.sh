#!/usr/bin/env bash
# Test de bout en bout de src/lib/api.ts : Postgres local + migration +
# PostgREST (la couche API de Supabase), interrogés avec supabase-js.
# PostgREST est téléchargé une fois dans node_modules/.cache.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
PGRST_VERSION=v12.2.12
PGRST="$ROOT/node_modules/.cache/postgrest-$PGRST_VERSION/postgrest"
if [ ! -x "$PGRST" ]; then
  mkdir -p "$(dirname "$PGRST")"
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/$PGRST_VERSION/postgrest-$PGRST_VERSION-linux-static-x86-64.tar.xz" \
    | tar xJ -C "$(dirname "$PGRST")"
fi

WORK="$(mktemp -d)"
PORT=54331
export JWT_SECRET=local-test-jwt-secret-with-at-least-32-characters PGRST_PORT=54332 PROXY_PORT=54333

RUN=()
if [ "$(id -u)" = 0 ]; then
  chown postgres "$WORK"
  RUN=(runuser -u postgres --)
fi

cleanup() {
  kill "${PGRST_PID:-}" "${PROXY_PID:-}" 2>/dev/null || true
  "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"${RUN[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=127.0.0.1" -l "$WORK/log" -w start >/dev/null

PSQL=("${RUN[@]}" "$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$migration"
done
"${PSQL[@]}" -c "
  create role authenticator login noinherit;
  grant anon, authenticated to authenticator;
  insert into auth.users (id) values
    ('00000000-0000-0000-0000-00000000000a'),
    ('00000000-0000-0000-0000-00000000000b'),
    ('00000000-0000-0000-0000-00000000000c');"

cat > "$WORK/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@127.0.0.1:$PORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $PGRST_PORT
CONF
"$PGRST" "$WORK/postgrest.conf" >"$WORK/postgrest.log" 2>&1 &
PGRST_PID=$!
node "$ROOT/scripts/e2e/proxy.mjs" &
PROXY_PID=$!
for _ in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PGRST_PORT/")" = 200 ] && break
  sleep 0.25
done

cd "$ROOT"
node --experimental-strip-types --no-warnings --import ./scripts/e2e/register.mjs \
  --test supabase/tests/api.e2e.test.ts || { tail -20 "$WORK/postgrest.log"; exit 1; }
