#!/usr/bin/env bash
# Nightly backup: database (pg_dump, custom format) and the uploads volume into /var/backups/zadudize.
# Keeps 7 daily and 4 weekly copies (Sunday's goes to weekly/). With BACKUP_AGE_RECIPIENT and
# BACKUP_REMOTE in .env, an age-encrypted copy goes to the FTP/SFTP target (one file per weekday,
# so the target holds the last 7 days).
#
#   cd /opt/zadudize && ./backup.sh        (cron: deploy/cron.d/zadudize)
set -euo pipefail
cd "$(dirname "$0")"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/zadudize}"
KEEP_DAILY=7
KEEP_WEEKLY=4
env_value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]$//"; }

stamp="$(date +%F)"
target="$BACKUP_DIR/daily/$stamp"
mkdir -p "$target"
umask 077

echo "== Datenbank"
docker compose exec -T db pg_dump -U zadudize -d zadudize --format=custom > "$target/zadudize.dump.part"
mv "$target/zadudize.dump.part" "$target/zadudize.dump"

echo "== Anhänge (uploads)"
docker run --rm -v zadudize_uploads:/data/uploads:ro busybox tar czf - -C /data uploads > "$target/uploads.tar.gz.part"
mv "$target/uploads.tar.gz.part" "$target/uploads.tar.gz"

if [ "$(date +%u)" = 7 ]; then
  mkdir -p "$BACKUP_DIR/weekly"
  rm -rf "$BACKUP_DIR/weekly/$stamp"
  cp -a "$target" "$BACKUP_DIR/weekly/$stamp"
fi

# Removes all but the newest $2 dated folders.
prune() { ls -1d "$1"/*/ 2>/dev/null | sort | awk -v keep="$2" '{ d[NR] = $0 } END { for (i = 1; i <= NR - keep; i++) print d[i] }' | xargs rm -rf; }
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

recipient="$(env_value BACKUP_AGE_RECIPIENT || true)"
remote="$(env_value BACKUP_REMOTE || true)"
if [ -n "$recipient" ] && [ -n "$remote" ]; then
  echo "== Verschlüsselte Kopie nach $remote"
  file="zadudize-$(date +%a).tar.age"
  tar cf - -C "$BACKUP_DIR/daily" "$stamp" | age -r "$recipient" > "$BACKUP_DIR/$file"
  password="$(env_value BACKUP_REMOTE_PASSWORD || true)"
  lftp -e "set ssl:verify-certificate yes; set net:max-retries 3; put -O . $BACKUP_DIR/$file; bye" \
    ${password:+-u "$(printf '%s' "$remote" | sed -E 's#^[a-z]+://([^@/]+)@.*#\1#'),$password"} \
    "$(printf '%s' "$remote" | sed -E 's#://[^@/]+@#://#')"
  rm -f "$BACKUP_DIR/$file"
fi

du -sh "$target"
echo "Sicherung fertig: $target"
