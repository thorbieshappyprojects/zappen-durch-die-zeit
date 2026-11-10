# Zappen durch die Zeit – Architecture

A web "TV set" that shows German television of the 1990s **as it ran on a day back then, at the same time of day as now**. Each channel (ARD, ZDF, SAT.1, RTL, ProSieben, RTL II, Super RTL, VOX, Kabel 1, MTV, VIVA, the Dritte …) shows what was on *right now* on that day. We **host no video**: every slot links or embeds an existing copy (YouTube, Internet Archive, Dailymotion, Vimeo; Mediatheken as link-outs) and says how close the match is. Between programmes the TV plays period interstitials (ads, idents, announcers, sign-off).

UI text is German; code, comments and docs are English. Older design papers are in `docs/archive/`.

## 1. Overview

```
                 ┌─────────────────────── apps/web (Next.js 16, App Router) ───────────────────────┐
 Browser ──────▶ │ proxy.ts (CSP nonce, invalid dates → 404)                                        │
 (TvApp, players)│ pages: /  /tag/<date>  /tag/<date>/programm  /tag/<date>/lueckenlos  /info        │
                 │        /mitmachen (+ /mitmachen/senden)  /impressum  /datenschutz  /og  /admin/*  │
                 │ lib/db.ts (per-process caches)  lib/admin-*  lib/contribution-*  lib/video-health │
                 └───────────────┬───────────────────────────────────────────────────────────────────┘
                                 │ @zdz/core (pure logic)        @zdz/db (Drizzle queries)
                                 ▼
                      PostgreSQL (production) / PGlite (development, .data/pglite)
                                 ▲
 seed/*.json, .data/archive/… ───┘  workers/ingest (pnpm ingest …): import, interstitials, snapshot,
                                    purge, review-apply, admin-totp, sources/licences
```

| Package | Contents |
|---|---|
| `apps/web` | The TV (`components/TvApp.tsx` and players), Info/Mitmachen/Impressum/Datenschutz, day listings, share previews (`/og`), admin. `proxy.ts` sets the per-request CSP; `instrumentation.ts` runs the production config check. |
| `packages/core` | Pure, tested domain logic: TV-day time math, stations, providers and video ids, coverage scores, start/best day, share links, listings, interstitial rules, built programmes (Lückenlos, themes), recommendations, CSP, client address, retention, contribution classification, note sanitising. |
| `packages/db` | Drizzle schema and migrations (`drizzle/`), the seed importer, queries, contributions, reports, interstitials, admin login state, statistics. Postgres via `DATABASE_URL`, otherwise PGlite (Postgres in WASM). |
| `workers/ingest` | The `pnpm ingest` CLI: migrations, imports (`seed`, `archive`), interstitials, snapshots and purge, upload-review apply, TOTP setup, source licences. |
| `seed/` | Curated data in the repository (see `docs/DATA.md`). |

## 2. Data model (Postgres, `packages/db/src/schema.ts`)

```
channel(id, slug, name, display_number, is_private, …)
schedule_source(id, name, url, license_status, notes)        -- importers refuse sources without a permissive status
tv_day(id, date, source_id, completeness enum[full, partial, series_only])
tv_day_channel(tv_day_id, channel_id, display_number)
broadcast(id, tv_day_id, channel_id, start_min, end_min, starts_at, ends_at, title, normalized_title, description, flags, programme_id)
programme(id, kind, title, normalized_title, …)              -- many broadcasts → one programme (repeats, same title)
media_candidate(id, programme_id, broadcast_id, provider, url, provider_video_id, title, duration_s, embeddable,
                match_level, confidence, status, found_by, notes)
interstitial(id, channel_id null, kind enum[ad_break, ident, announcer, trailer, sign_off, sign_on, test_card], url,
             provider_video_id, in_s, out_s, duration_s, aired_on, aired_period, valid_from, valid_to, rank, status, notes)
contribution(id, kind, status, tv_date, channel, broadcast_start, broadcast_title, url, body, contributor_name,
             contributor_email, ip_hash, spam_reasons, reviewed_at, review_note, media_candidate_id)
contribution_file(id, contribution_id, original_name, mime, size_bytes, sha256, storage_key)   -- files in UPLOAD_DIR
media_report(id, url, reason, note, tv_date, channel, broadcast_start, broadcast_title, automatic, ip_hash, handled_at)
blocked_video(url pk, reason)          station_setting(slug pk, hidden)        site_setting(key pk, value jsonb)
upload_review(group_id pk, decision, note)     admin_login_attempt(id, ip_hash, at)     stats_snapshot(day pk, data)
```

Trigram indexes on normalised titles; unique keys `media_candidate(programme_id, url)` and `interstitial(channel_id, kind, url, in_s)` keep re-imports idempotent. Licence status is an enum (`unknown, requested, pending, granted, denied, not_required`); imports never overwrite a recorded status.

## 3. TV day and time model

- A **TV day** runs 06:00 → 06:00 Europe/Berlin. Broadcasts after midnight belong to the previous TV day; times are stored as minutes from 00:00 of the TV day (values above 1440 allowed) plus real timestamps. All time math goes through `packages/core/src/time.ts`.
- The TV follows the **wall clock**: at 20:15 today it shows 20:15 on the chosen day. A deep link (`/tag/<date>?sender=&zeit=&programm=`) can set another time; 00:00–05:59 means the night after the date.
- **Real days** come from the programme data; **assumed days** (`series_only`) are derived from regular slots (see `docs/DATA.md`). Assumed days are marked and never chosen as start, best or random day.
- **Start page:** today's date in an earlier year (real days only), live; otherwise one of the best-covered days in "Programm frei wählen", starting a show we have exactly (else the same show from that year) close to the current time of day, as a deep link with `sender`/`zeit` (core `pickStartDay`, `bestDays`, `pickStartBroadcast`; coverage score in `coverage.ts`).

## 4. Playback

- **Seek into the programme:** tuning in at 17:22 to a programme that started at 17:10 starts the video at 12 minutes; a recording shorter than the elapsed time wraps (`seekOffsetSeconds`). The next programme takes over at its start time.
- **Players** (`components/VideoPlayer.tsx`): YouTube IFrame API on `youtube-nocookie.com`, `<video>` for Internet Archive files, iframes for Dailymotion and Vimeo. Everything loads only after the visitor's consent (click-to-load overlay, stored in localStorage).
- **YouTube** always shows its standard player with its own controls, in every mode, and nothing may lie on top of it (YouTube's embed rules). While a YouTube player is on screen, channel and clock show in the panel below the picture, the CRT layers and the static are off, and „Zurück zu jetzt“ appears there after the viewer paused or scrubbed in a linear mode. Other providers keep the CRT look and, in linear modes, a click shield.
- The CRT filter (scanlines, vignette) is an admin switch; direct files with 480 lines or fewer play without it.
- **Fallback per slot:** exact → same show and year → similar video → programme card with YouTube search link and „Video vorschlagen“. A video that fails to play is skipped for the visit and reported automatically (see §7).

### Modes

| Tab / mode | What it shows | Linear? |
|---|---|---|
| Fernsehen · **Lückenlos** | core `seamlessDay`: the day's broadcasts with video keep their slot, gaps are filled with the station's own recordings from nearby days (time-of-day fit first, then date); deterministic per date | yes |
| Fernsehen · **Wie damals** | the real listing of the day | yes |
| Fernsehen · **Programm frei wählen** | the listing; any show can be picked; the end of a video goes on to the next | no |
| **Kinderprogramm**, **Talk Shows** | core `themes.ts`: one genre from the whole decade per station (title patterns), built like Lückenlos; any show can be picked | no |
| **Chronik** | core `events.ts`: one event (`HISTORY_EVENTS`, list P400); per station its exact recordings of a reporting kind (news, specials, magazines, talk; title patterns) aired from a day before to ~10 days after, in airing order, looped; viewers flag unrelated ones (`off_topic` report), moderators take them out of that event (`event_exclusion`); see docs/EVENTS.md | no |

### Interstitials (core `interstitials.ts`)

At a programme boundary: private stations get their own ad break of that period or a pool spot, then an ident; ARD/ZDF get a pool spot only 17:00–20:00, then ident and an announcer before 19:58–20:15; a recording from that very day wins. After a last broadcast that ends at 22:00 or later the station signs off. Viewers can skip („Werbung überspringen“ / „Weiter zum Programm“).

## 5. Match levels and ranking

| Level | Seed value | Meaning |
|---|---|---|
| 🟢 `exact` | `exact` | this very broadcast (or the same live event) |
| 🟡 `same_show_period` | `same` | the same show from the same year, as aired on that channel |
| 🔵 `same_show` | `sim` | everything else: other episodes or years, the same event from another broadcaster, other commentary or language |
| ❌ `none` | – | nothing found |

Per broadcast, broadcast-specific candidates outrank programme-wide ones, then higher confidence; the runner-up becomes the alternative link (`queries.ts` `loadMedia`). Blocked videos are filtered out everywhere. Labels and colours: `apps/web/lib/labels.ts`.

## 6. Admin and moderation (`/admin`)

- Login: password `ADMIN_TOKEN` plus TOTP; signed, expiring session cookie `zdz_admin`; failed logins and the last used TOTP step in the database (5 per address or 20 overall in 15 minutes lock the login).
- Pages: dashboard (key figures, trend from daily snapshots, TV switches, station recommendations and coverage, date × station matrix), Beiträge (contributions), Meldungen (video reports), Gesperrt (blocked videos), Zwischenspiele (interstitials), Aussortiert (uploads the curation left out, `UPLOAD_REVIEW_FILE`).
- Every action runs through `guarded()` (`lib/admin-action.ts`) via `AdminForm`; destructive buttons need a second click.

## 7. Contributions and reports

- `/mitmachen`: one free-text field plus optional files, posted to the route `/mitmachen/senden` (origin check, body capped before reading, per-address and global quotas, signed form token with minimum fill time, honeypot). Core `classifySubmission` sorts it into video link, schedule or note. Nothing goes live before approval; an approved video link becomes a `media_candidate` with `found_by = community`.
- „Video melden“ stores a `media_report` (only for URLs we link). Three automatic "unavailable" reports within 7 days plus a failed health check (`lib/video-health.ts`) block the video.

## 8. Security

- Client address only via `clientIp()` (`CLIENT_IP_HEADER`, or the X-Forwarded-For entry `TRUSTED_PROXY_HOPS` from the right); stored only as a daily rotating hash.
- Nonce-based CSP per request (core `csp.ts`), nosniff, Referrer-Policy, frame and permissions policies, HSTS in production.
- Production start check: no strong `CONTRIBUTION_SECRET` or no `SITE_URL` → the server exits.
- Server-action input is validated at runtime; large uploads only through the capped route.
- Retention (core `RETENTION_DAYS`, `pnpm ingest purge`, also part of every snapshot): spam 30 days, rejected 90 days with files, e-mail addresses 90 days after review, handled reports 180 days.
- Notes shown on the site never contain e-mail addresses (core `withoutEmailAddresses`, applied on import and tested over all seed files).

## 9. Caches

Per process, 10 minutes, cleared on import and moderation (`invalidateCoverage`): coverage rows, the theme pool, built programmes and the dashboard figures. `/og` and the built-programme JSON carry public cache headers. One app instance is assumed.

## 10. Checks

`pnpm lint`, `pnpm typecheck`, `pnpm test` (core and db, tests use an in-memory PGlite), `pnpm build`; the same in CI (`.github/workflows/ci.yml`) plus `pnpm audit --prod`. Dependabot updates npm packages weekly and Actions monthly.
