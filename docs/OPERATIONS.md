# Operations (Betriebshandbuch)

The routine for running the site. Contact address for everything below: dev@thorbieshappyprojects.com.

## Daily routine

1. **Contributions** (`/admin/beitraege`): approve or reject. An approved video link becomes a video for that broadcast (`found_by = community`); programme days sent as text or photos are transcribed into `seed/` (`docs/DATA.md`). Check every video link with the rules in `docs/DATA.md` (uploader, genuineness, era).
2. **Reports** (`/admin/meldungen`): „Video melden“ from visitors and automatic reports from players that failed. Handle them: block the video, or mark the report as done; blocked videos are listed (and can be unblocked) at `/admin/gesperrt`. Headless browsers cannot play YouTube and file automatic reports – check for that after automated tests.
3. **Dashboard** (`/admin`): growth trend, hidden stations and recommendations, coverage per station.

## Takedown

Target: a link is removed within **48 hours** of a notice from a rights holder (e-mail, Mitmachen form or report).

1. Find the video: by the URL in the notice, or by date, station and time.
2. Block it at `/admin/meldungen`: it disappears from every day at once and stays hidden across re-imports. If there is no report for it yet, file one with „Video melden“ on the TV first (blocking works per report).
3. Remove it from `seed/media-library.json` / `seed/interstitials.json` so it is not curated again.
4. Answer the sender and keep a short note (date, URL, who asked, when removed).

Once a rights holder has pointed out an upload, it must not be linked again.

## Retention

Core `RETENTION_DAYS`, applied by `pnpm ingest purge` (part of every daily snapshot): spam 30 days, rejected contributions 90 days with their files, e-mail addresses 90 days after review, handled reports 180 days. Web server logs with IP addresses: at most 14 days. Don't run the purge on a copy you still need.

## Server routine

- Updates of the app: `./update.sh` in `/opt/zadudize` after each merge to `main` (backup, pull, restart, rollback on failure). Operating system updates run by themselves (reboot at 04:00 when needed).
- Look at `docker stats --no-stream`, `df -h` and `/var/log/zadudize/*.log` now and then; the uptime monitor watches `https://zadudize.de/healthz`.
- Before risky changes take a server snapshot in the netcup panel.

## When something breaks

| Problem | What to do |
|---|---|
| Health check fails | `cd /opt/zadudize && docker compose ps` and `docker compose logs --tail=100 app db`: startup check, database connection, migrations; free disk (`df -h`, below 10 % fails the check); then `docker compose restart app` |
| Disk fills up | `df -h`, `sudo du -sh /var/backups/zadudize/* /var/lib/docker`; old images: `docker image prune`; backups keep 7 + 4 copies; attachments of rejected contributions go with the purge; never delete database files by hand |
| A provider breaks embeds (player errors everywhere) | check in a normal browser; if a provider changed its embed host, update core `csp.ts` and `apps/web/lib/providers.ts`; automatic reports pile up meanwhile – mark them done once fixed |
| Many automatic reports for one video | the video was probably removed; three reports in 7 days plus a failed health check block it automatically |
| Admin login locked | wait 15 minutes; 20 failures overall lock it for everyone – look for an attack in the logs |

Open: there is no command yet that re-checks reported or long-unchecked videos on a schedule; until one exists, do it by hand from `/admin/meldungen`.

## Rotating secrets

| Secret | How |
|---|---|
| `ADMIN_TOKEN` | new value in `.env` (at least 20 characters, from a password manager), `docker compose up -d app`; sessions signed with the old value end |
| `ADMIN_TOTP_SECRET` | on the server `docker compose run --rm jobs pnpm --silent ingest admin-totp --print`, put the line into `.env`, `docker compose up -d app`, add the key to the authenticator app (locally `pnpm ingest admin-totp` writes `apps/web/.env.local`) |
| `CONTRIBUTION_SECRET` | `openssl rand -hex 32` into `.env`, `docker compose up -d app`; open forms need a reload, and today's address hashes change (rate limits start fresh) |
| `POSTGRES_PASSWORD` | `docker compose exec db psql -U zadudize -c "alter user zadudize password '<new>'"`, the same value into `.env`, `docker compose up -d app` |

Never print secrets into logs or tickets, and never commit them.
