#!/usr/bin/env bash
# Update to the newest image (or APP_TAG from .env): backup first (migrations only go forward), pull,
# restart, wait until healthy, show the running version. If the new version doesn't get healthy, the
# previous image starts again (its migrations stay – restore a backup only on purpose, deploy/restore.sh).
#
#   cd /opt/zadudize && ./update.sh
set -euo pipefail
cd "$(dirname "$0")"

SERVICE=app
TIMEOUT_S="${TIMEOUT_S:-180}"

revision() { docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1" 2>/dev/null || true; }
running_image() { docker compose ps -q "$SERVICE" | xargs -r docker inspect -f '{{.Image}}' 2>/dev/null || true; }

wait_healthy() {
  local id start
  id="$(docker compose ps -q "$SERVICE")"
  start=$(date +%s)
  while [ $(($(date +%s) - start)) -lt "$TIMEOUT_S" ]; do
    case "$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null)" in
      healthy) return 0 ;;
      unhealthy) return 1 ;;
    esac
    sleep 3
  done
  return 1
}

previous="$(running_image)"
previous_rev="$( [ -n "$previous" ] && revision "$previous" )"
echo "Läuft jetzt: ${previous_rev:-unbekannt}"

echo "== Sicherung vor dem Update"
./backup.sh

echo "== Neues Image holen"
docker compose pull "$SERVICE"
if [ "$(docker compose config --images | head -1 | xargs docker image inspect -f '{{.Id}}')" = "$previous" ]; then
  echo "Kein neues Image – nichts zu tun."
  exit 0
fi

echo "== Neustart"
docker compose up -d --remove-orphans
if wait_healthy; then
  echo "Update fertig. Läuft jetzt: $(revision "$(running_image)")"
  docker compose ps
  exit 0
fi

echo "Die neue Version wird nicht gesund – zurück zur vorherigen." >&2
docker compose logs --tail=50 "$SERVICE" >&2 || true
if [ -n "$previous_rev" ]; then
  APP_TAG="$previous_rev" docker compose up -d "$SERVICE"
  wait_healthy && echo "Zurück auf $previous_rev. In .env APP_TAG=$previous_rev setzen, bis der Fehler behoben ist." >&2
fi
exit 1
