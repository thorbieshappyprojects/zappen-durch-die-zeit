#!/bin/sh
# Without arguments: apply migrations, then start the web server (a failed migration stops the start).
# With arguments (jobs container): run them, e.g. `pnpm ingest snapshot`.
set -e
cd /app
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
pnpm --silent --filter @zdz/ingest ingest migrate
cd apps/web
exec ./node_modules/.bin/next start --port "${PORT:-3000}" --hostname 0.0.0.0
