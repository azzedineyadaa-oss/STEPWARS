#!/usr/bin/env bash
# Rassemble toutes les migrations dans supabase/setup.sql, à coller en une
# fois dans le SQL Editor d'un projet Supabase neuf.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/supabase/setup.sql"
{
  echo "-- Fichier généré par scripts/bundle-sql.sh : ne pas modifier à la main."
  echo "-- À coller en une fois dans le SQL Editor d'un projet Supabase neuf."
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    echo
    echo "-- ===== $(basename "$migration") ====="
    cat "$migration"
  done
} > "$OUT"
echo "Écrit : $OUT"
