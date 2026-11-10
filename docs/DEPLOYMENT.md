# Deployment

How „Zappen durch die Zeit“ runs at `https://zadudize.de`: one virtual server (netcup VPS, 2 vCPU, 4 GB RAM, Debian 13, in Germany) with Docker Compose – Caddy (HTTPS) → app (Node.js 22) → PostgreSQL 17. GitHub Actions builds the image; nothing is built on the server. Domain, DNS and e-mail stay with all-inkl.

| File | Purpose |
|---|---|
| `Dockerfile`, `.dockerignore` | the image: web app plus the `pnpm ingest` commands, runs as a non-root user |
| `.github/workflows/image.yml` | builds and pushes `ghcr.io/thorbieshappyprojects/zappen-durch-die-zeit` (tags `latest`, commit hash, version) |
| `deploy/compose.yml` | services `caddy`, `app`, `db`, and `jobs` for one-off commands |
| `deploy/Caddyfile` | HTTPS, `www` redirect, body limits, site lock, access log |
| `deploy/env.production.example` | all variables for `/opt/zadudize/.env` (names and comments only) |
| `deploy/provision.sh` | server setup (user, SSH, firewall, updates, swap, Docker) |
| `deploy/update.sh`, `backup.sh`, `restore.sh` | update with rollback, nightly backup, restore into a new database |
| `deploy/import-archive.sh` | data import from the owner's machine |
| `deploy/cron.d/zadudize` | scheduled jobs |

## Requirements

- One long-running app instance: caches, throttles and the theme pool live in the process.
- PostgreSQL with `pg_trgm` (the official `postgres:17` image has it). Production refuses to start without `DATABASE_URL`; PGlite is for development only.
- A persistent volume for contribution attachments (`uploads`).
- The visitor address from the proxy: Caddy ignores a forged `X-Forwarded-For` and passes the address it sees; the app runs with `TRUSTED_PROXY_HOPS=1`.

## Memory and speed (measured 10 Nov 2026)

On the owner's Mac (Docker Desktop, 8 CPUs, arm64 build of the image) with the Compose stack from `deploy/` and **all 3,545 days** imported into PostgreSQL 17 (database 164 MB; the import of the archive days took 90 s):

| Moment | app | db | caddy |
|---|---|---|---|
| after start | 70–80 MB | 220–230 MB | 19–26 MB |
| after the first requests (coverage, theme pool, built programmes loaded) | 132 MB | 237 MB | 20 MB |
| load test: 20 parallel visitors on day pages for 60 s | 225–255 MB | 240 MB | 27–29 MB |

Response times: a single day page 0.06–0.14 s once warm (the very first one after start 0.3 s, Lückenlos and themes 0.2–0.25 s the first time). Under the load test, before caching day data: 12.6 pages/s, median 1.6 s. With day data, date lists and channel hints cached per process (cleared on import and moderation) and the coverage warmed at start: **42.7 pages/s, median 0.46 s, p95 0.53 s, no errors**. The app is one Node process: under load it uses about 1.6 CPU cores, so on the 2-vCPU server expect roughly half that throughput. Memory stays far below the limits (app 1800 MB, db 1200 MB, caddy 200 MB) and the Node heap limit of 1400 MB.

## Setup step by step

### 1. Image (once, after the first push)

The first push to `main` runs `image.yml`. Then in GitHub: the package `zappen-durch-die-zeit` (profile → Packages) → Package settings → visibility **public**, so the server pulls without a login.

### 2. Server base

As root on a fresh Debian 13:

```sh
scp deploy/provision.sh root@SERVER:/root/
ssh root@SERVER bash /root/provision.sh
```

It is idempotent. Root login is switched off once the user `deploy` has root's SSH keys; from then on `ssh deploy@SERVER`. Afterwards take a snapshot in the netcup panel („clean base“). Check that only SSH and Caddy listen publicly: `sudo ss -tlnpu` (Docker publishes ports past `ufw`, which is why only Caddy publishes any).

IPv6: netcup assigns a /64; the server needs one address from it configured (check with `ip -6 addr show scope global`) before the `AAAA` records are set.

### 3. Application folder

```sh
scp deploy/compose.yml deploy/Caddyfile deploy/*.sh deploy@SERVER:/opt/zadudize/
scp -r deploy/cron.d deploy@SERVER:/opt/zadudize/
scp deploy/env.production.example deploy@SERVER:/opt/zadudize/.env
ssh deploy@SERVER 'chmod 600 /opt/zadudize/.env && sudo install -m 644 /opt/zadudize/cron.d/zadudize /etc/cron.d/zadudize'
```

Fill in `/opt/zadudize/.env` on the server: secrets with `openssl rand -hex 32` (never reuse the development ones), the owner details, and the site lock (next step). The two-factor secret comes from the image: `docker compose run --rm jobs pnpm --silent ingest admin-totp --print`.

### 4. DNS at all-inkl

In the KAS: `A` record for `zadudize.de` and `www.zadudize.de` → the server's IPv4; `AAAA` for both → its IPv6 address (only once it answers, see above). Mail records stay as they are. Wait until both names resolve to the server (`dig +short zadudize.de`) before the first start; otherwise the certificate request fails and is rate-limited.

### 5. Site lock (before the launch)

```sh
docker run --rm -it caddy:2 caddy hash-password    # asks for the password
```

Put `SITE_LOCK_USER=<name>` and `SITE_LOCK_HASH='<hash>'` (single quotes: the hash contains `$`) into `.env`. Every address except `/healthz` then asks for that password. **Opening the site:** empty both values and `docker compose up -d caddy`.

### 6. First start

```sh
cd /opt/zadudize && docker compose pull && docker compose up -d
curl -s https://zadudize.de/healthz        # {"ok":true}
```

The app applies the migrations at every start; a failed migration stops the start (`docker compose logs app`).

### 7. Data

From the owner's machine (the converted days are not in the repository):

```sh
deploy/import-archive.sh deploy@SERVER
```

It copies `.data/archive/tvprogramme.net-seed` (about 84 MB) to `/opt/zadudize/import`, imports the curated days, the archive days, the interstitials and a snapshot, and restarts the app. Locally the import of all days took 90 s and the database is 164 MB. Later data updates use the same script; re-imports keep the community videos.

## Updates

```sh
cd /opt/zadudize && ./update.sh
```

Backup first (migrations only go forward), pull, restart, wait until healthy, show the running commit. If the new version doesn't get healthy, the previous commit's image starts again. Manual rollback: `APP_TAG=<commit hash> docker compose up -d app` (and the same in `.env` to keep it).

## Backups and restore

- `backup.sh` (cron 03:45): `pg_dump --format=custom` and the uploads volume into `/var/backups/zadudize/daily/<date>`; keeps 7 daily and 4 weekly copies. With `BACKUP_AGE_RECIPIENT` (an `age` public key; the private key stays with the owner) and `BACKUP_REMOTE` (e.g. an all-inkl SFTP/FTPS account limited to a folder `backup-zadudize`) an encrypted copy goes off the server, one file per weekday.
- `restore.sh <backup folder> [uploads]` restores into a **new** database, prints row counts next to the running one and the commands to switch. It never overwrites the running database. Test a restore after the first backup.
- Decrypt an off-server copy: `age -d -i key.txt zadudize-Mon.tar.age | tar x`.

## Scheduled jobs (`deploy/cron.d/zadudize`)

| When | What |
|---|---|
| daily 03:15 | `pnpm ingest snapshot` (dashboard figures, then the retention purge) |
| daily 03:45 | `backup.sh` |
| Monday 04:10 | empty Caddy's access log (IP addresses, kept at most 14 days) |
| daily 04:00 | security updates, reboot if needed (unattended-upgrades) |

Logs of the jobs: `/var/log/zadudize/`. A scheduled re-check of reported videos doesn't exist yet (`docs/OPERATIONS.md`).

## Logs and privacy

Caddy's access log (JSON, `docker compose logs caddy`) contains IP addresses; Docker keeps at most 5 × 10 MB and the weekly job empties it, so entries are at most 14 days old (in practice 7). The app itself never logs addresses. `/healthz` is not logged.

## Environment variables

`deploy/env.production.example` lists every variable with a comment; `apps/web/.env.example` the development ones. The keys of the curation scripts (YouTube Data API, Internet Archive) never go onto the server.

## Troubleshooting

| Symptom | Check |
|---|---|
| `app` restarts in a loop | `docker compose logs app`: the startup check names a missing or weak variable, or a migration failed |
| certificate missing | DNS not yet pointing to the server, or port 80/443 blocked; `docker compose logs caddy` |
| everyone shares one rate limit | `TRUSTED_PROXY_HOPS` must be 1 behind this Caddy |
| videos don't load, CSP errors in the console | a new provider host must be added to core `csp.ts` |
| share previews point elsewhere | `SITE_URL` |
| `/admin/aussortiert` shows „Keine Daten“ | `UPLOAD_REVIEW_FILE` |
| `/healthz` 503 | database down, uploads volume not writable, or less than 10 % free disk |
