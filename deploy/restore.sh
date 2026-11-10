#!/usr/bin/env bash
# Restores a backup into a NEW database next to the running one and compares row counts.
# Never touches the running database "zadudize"; how to switch over is printed at the end.
#
#   ./restore.sh /var/backups/zadudize/daily/2026-11-10            (database only)
#   ./restore.sh /var/backups/zadudize/daily/2026-11-10 uploads    (also unpacks the uploads to a folder)
set -euo pipefail
cd "$(dirname "$0")"

src="${1:?Ordner einer Sicherung angeben, z. B. /var/backups/zadudize/daily/$(date +%F)}"
dump="$src/zadudize.dump"
[ -f "$dump" ] || { echo "Keine Datenbank-Sicherung in $src" >&2; exit 1; }
name="zadudize_restore_$(basename "$src" | tr -c 'a-zA-Z0-9\n' '_')"
psql() { docker compose exec -T db psql -U zadudize -d "$1" -v ON_ERROR_STOP=1 -tAc "$2"; }

if [ "$(psql postgres "select 1 from pg_database where datname = '$name'")" = 1 ]; then
  echo "Die Datenbank $name gibt es schon – erst löschen (dropdb) oder eine andere Sicherung wählen." >&2
  exit 1
fi
echo "== Neue Datenbank $name"
psql postgres "create database $name"
docker compose exec -T db pg_restore -U zadudize -d "$name" --no-owner --exit-on-error < "$dump"

echo "== Zeilen: laufende Datenbank / Sicherung"
for t in tv_day broadcast media_candidate interstitial contribution media_report blocked_video upload_review; do
  printf '%-18s %10s %10s\n' "$t" "$(psql zadudize "select count(*) from $t")" "$(psql "$name" "select count(*) from $t")"
done

if [ "${2:-}" = uploads ] && [ -f "$src/uploads.tar.gz" ]; then
  out="$(dirname "$0")/restore-uploads-$(basename "$src")"
  mkdir -p "$out" && tar xzf "$src/uploads.tar.gz" -C "$out"
  echo "Anhänge entpackt nach $out (nicht in das laufende Volume kopiert)."
fi

cat <<EOF

Wiederhergestellt nach $name. Die laufende Datenbank ist unverändert.
Umschalten (nur wenn wirklich gewollt, mit Ausfallzeit):
  docker compose stop app
  docker compose exec db psql -U zadudize -d postgres -c 'alter database zadudize rename to zadudize_old_$(date +%Y%m%d)'
  docker compose exec db psql -U zadudize -d postgres -c 'alter database $name rename to zadudize'
  docker compose start app
Nur prüfen: wieder löschen mit
  docker compose exec db dropdb -U zadudize $name
EOF
