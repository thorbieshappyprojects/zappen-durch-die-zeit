#!/usr/bin/env bash
# Runs on the owner's machine: copies the converted programme days (.data/archive/tvprogramme.net-seed,
# not in the repository) to the server and imports them there, with the curated days from the image,
# the interstitials and a snapshot. Re-imports keep the community videos (A1).
#
#   deploy/import-archive.sh deploy@SERVER
set -euo pipefail

host="${1:?Ziel angeben, z. B. deploy@SERVER}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
src="$repo/.data/archive/tvprogramme.net-seed"
dir="${APP_DIR:-/opt/zadudize}"
[ -d "$src" ] || { echo "Keine Archiv-Tage in $src – erst to_seed.py laufen lassen." >&2; exit 1; }

echo "== Kopieren ($(du -sh "$src" | cut -f1)) nach $host:$dir/import/"
rsync -az --delete "$src" "$host:$dir/import/"

echo "== Importieren"
start=$(date +%s)
ssh "$host" "cd $dir && set -e \
  && docker compose run --rm jobs pnpm --silent ingest import seed | tail -1 \
  && docker compose run --rm jobs pnpm --silent ingest import archive | tail -1 \
  && docker compose run --rm jobs pnpm --silent ingest interstitials | grep -E 'imported|removed' | cut -c1-120 \
  && docker compose run --rm jobs pnpm --silent ingest snapshot | grep -E 'Snapshot|Purge' \
  && docker compose exec -T db psql -U zadudize -d zadudize -tAc \"select 'Datenbank: ' || pg_size_pretty(pg_database_size('zadudize'))\" \
  && docker compose restart app >/dev/null"
echo "Fertig in $(($(date +%s) - start)) s. Die App wurde neu gestartet (Caches leer, Abdeckung neu berechnet)."
