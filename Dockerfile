# syntax=docker/dockerfile:1.7
# Zappen durch die Zeit – web app and ingest commands (pnpm ingest …) in one image.
# Build: docker build -t zappen-durch-die-zeit .   Run: see deploy/compose.yml.

ARG NODE_IMAGE=node:22-bookworm-slim
ARG PNPM_VERSION=12.18.0

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY workers/ingest/package.json workers/ingest/

# All dependencies, for the build.
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build && rm -rf apps/web/.next/cache

# Runtime dependencies only (no compilers, linters or test tools).
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM ${NODE_IMAGE} AS runtime
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force \
  && mkdir -p /data/uploads /import && chown node:node /data/uploads
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=1400 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/packages/db/drizzle \
    UPLOAD_DIR=/data/uploads \
    UPLOAD_REVIEW_FILE=/app/seed/upload-review.json \
    ARCHIVE_SEED_DIR=/import/tvprogramme.net-seed \
    # node_modules is read-only and installed with --prod: no install before `pnpm ingest …`.
    pnpm_config_verify_deps_before_run=false
# Runtime dependencies, then the sources (the build context has no node_modules), then the built app.
COPY --from=prod-deps /app ./
COPY . .
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --chmod=755 deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint
# Everything belongs to root and is only readable for the app user: the app can't change itself.
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint"]
