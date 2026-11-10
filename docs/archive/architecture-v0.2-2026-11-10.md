# Zappen durch die Zeit – Architecture (v0.2)

(Formerly „Was lief damals?“, now the tagline.)

> Handoff document for Claude Code. Status: 10 Nov 2026 (v0.1 of 9 Nov 2026 was written after two research rounds and the HTML prototype `prototype/index.html`; this version reflects the implemented app, including the security and usability change request of 10 Nov 2026).
> Language of the UI: German. Language of code, comments and docs: English.

## 1. Product in one paragraph

A web "TV set" that shows German television **as it was on the same day/time 30-ish years ago (1990–2005)**. The user turns it on, a date in the past is picked (e.g. Wednesday 13 March 1991), and each channel (ARD, ZDF, SAT.1, RTL, ProSieben, Tele 5, later RTL II, VOX, Super RTL, Kabel 1 …) shows what was on *right now* back then. Station names follow one rule (core `STATIONS`): the name a station carried for most of 1990–2000, on every day, whatever the source spelled ("RTL plus", "PRO 7", "Kabelkanal" stay in the import data only). We **host no video**. We link or embed the best available existing copy (YouTube, ARD/ZDF Mediatheken, RTL+, Joyn, Bundestag, bpb …) and label how close the match is. Between programmes on private channels, a period-correct commercial break plays.

## 2. What we learned (constraints that drive the design)

**Schedule data is the hard part, not the videos.**

| Era | Best source | Quality | Notes |
|---|---|---|---|
| 1950s–1999 | tvprogramme.net | Complete or near-complete days, times + short descriptions, transcribed by volunteers from printed guides | 1990s: 385 days (1990: 58, 1991: 165, 1992: 80, 1993–99: 82, many of them holidays; channel coverage varies per day — check the day overview). Plus static pages for the 1950s–80s. The site is discontinued. Imprint: no copyright on the programme itself; database right assumed expired (owner decision 2026-11-09), licence status `not_required`. A local preservation copy is in `.data/archive/tvprogramme.net/`. Pages are double-encoded UTF-8. |
| 1993–1999 | Printed TV guides (Hörzu, TV Spielfilm, IWZ/prisma/rtv supplements) → scan + OCR | Complete, but needs digitization | No online scans exist. Options: libraries (DNB; possibly WLB Stuttgart for IWZ), eBay (~€15–20/issue). Treat as a later pipeline. |
| any year, series only | fernsehserien.de (per-show broadcast history with date, time, episode) | Exact, but series-centric, "ohne Anspruch auf Vollständigkeit" | No full grid. EU database rights → **license, don't scrape**. |
| ~2000–2002 | Wayback Machine snapshots of rtv.de, tvspielfilm.de etc. | Fragments only (one 3-h window per crawl, truncated titles) | Useful for spot checks, not as a backbone. Read the date from page content, not the snapshot timestamp. |

**Video availability (from the 1991 test):** game shows and private-channel series are well covered on YouTube (VHS uploads, often with original ads). Public-broadcaster series are increasingly in the Mediatheken (e.g. Schwarzwaldklinik episode "Sturz mit Folgen" in the ZDF Mediathek). News, magazines and feature films are mostly missing. Ad breaks from 1991 exist on YouTube, sometimes from the day before.

**Hosting/embedding:** the Claude artifact prototype could not embed videos (sandbox). The real app must use the **YouTube IFrame Player API** so that tuning in mid-programme seeks into the video (see §6).

## 3. Core concepts

- **TV day:** 06:00 → 06:00 local time (Europe/Berlin). Broadcasts after midnight belong to the previous TV day. Store `start`/`end` as minutes from 00:00 of the TV day (values > 1440 allowed) plus a real `timestamptz`.
- **Broadcast:** what aired on channel X from–to (from a schedule source).
- **Programme:** the canonical thing that aired (show, episode, film, live event, news edition). Many broadcasts → one programme (repeats).
- **MediaCandidate:** a playable/linkable copy found online for a programme or broadcast, with a **match level** (colours in `apps/web/lib/labels.ts`):
  - `exact` 🟢 – this very broadcast/episode (or the same live event)
  - `same_show_period` 🟡 – same show, same year as aired on that channel
  - `same_show` 🔵 – everything else (other episodes, other years, the same event from another broadcaster)
  - `none` ❌ – nothing found → programme card with search link and "Video vorschlagen"
- **Interstitial:** idents, announcers, trailers, sign-on/sign-off, test cards and ad breaks (table `interstitial`, replaced `ad_break`/`ad_spot`); `channel_id` null = pool item (single 90s ad spots). Rules in core `interstitials.ts`: private channels get their own ad break or a pool spot before the next programme, ARD/ZDF a pool spot only 17:00–20:00, then ident and announcer; a recording from that very day wins.
- **Day selection:** the start page opens today's date in an earlier year (real days only), otherwise one of the best-covered days. Days come from tvprogramme.net (real) or are **assumed** (`series_only`: regular slots derived from other days); assumed days are marked and never used as start/best/random days.
- **Built programmes:** "Lückenlos" (core `seamless.ts`) fills every station's TV day back to back with its own recordings from nearby days; the theme programmes "Kinderprogramm" and "Talk Shows" (core `themes.ts`) do the same with one genre from the whole decade, each station with its own shows.

## 4. Data model (Postgres)

```
channel(id, slug, name, display_number, is_private, logo_era jsonb, active_from, active_to)
schedule_source(id, name, url, license_status, notes)
tv_day(id, date, source_id, completeness enum[full,partial,series_only])
broadcast(id, tv_day_id, channel_id, start_min, end_min, starts_at timestamptz, ends_at timestamptz,
          title, subtitle, description, flags jsonb /* Wh., s/w, OmU, live */, raw jsonb, programme_id null)
programme(id, kind enum[series_episode,show_edition,film,live_event,news,other], title, series_title,
          season, episode, episode_title, year, ext_ids jsonb /* fernsehserien, tvdb, tmdb, imdb, wikidata */)
media_candidate(id, programme_id null, broadcast_id null, provider enum[youtube,zdf,ard,rtlplus,joyn,bundestag,bpb,other],
          url, provider_video_id, title, duration_s, embeddable bool, match_level, confidence real,
          status enum[proposed,approved,rejected,dead], found_by, verified_at, last_checked_at, notes)
interstitial(id, channel_id null, kind enum[ad_break,ident,announcer,trailer,sign_off,sign_on,test_card], url,
          provider_video_id, in_s, out_s, duration_s, aired_on, aired_period, valid_from, valid_to, rank, status, notes)
contribution(id, kind, status enum[pending,approved,rejected,spam], tv_date, channel, broadcast_start, broadcast_title,
          url, body, contributor_name, contributor_email, ip_hash, spam_reasons, reviewed_at, review_note, media_candidate_id)
contribution_file(id, contribution_id, original_name, mime, size_bytes, sha256, storage_key)   -- files in UPLOAD_DIR
media_report(id, url, reason, note, tv_date, channel, broadcast_start, broadcast_title, automatic, ip_hash, handled_at)
blocked_video(url pk, reason, created_at)          -- hides a video everywhere, survives re-imports
station_setting(slug pk, hidden)                   -- admin: station out of channel list and zapping
site_setting(key pk, value jsonb)                  -- admin switches (CRT look, sounds), last used TOTP step
upload_review(group_id pk, decision, note)         -- admin decisions on left-out uploads (seed/upload-review.json)
admin_login_attempt(id, ip_hash, at)               -- failed logins for the throttle (one window)
stats_snapshot(day pk, data jsonb)                 -- daily key figures for the dashboard trend
```

Indexes: `broadcast(tv_day_id, channel_id, start_min)`, `media_candidate(programme_id, status)`, trigram index on normalized titles.

As implemented in M2 (`packages/db/src/schema.ts`): `license_status` is an enum (`unknown, requested, pending, granted, denied, not_required`); remote importers refuse to run unless it is `granted`/`not_required`, and imports never overwrite a recorded status. `broadcast` and `programme` carry `normalized_title` (trigram-indexed). Unique keys `media_candidate(programme_id, url)` and `interstitial(channel_id, kind, url, in_s)` (nulls not distinct) keep re-imports idempotent; `interstitial.rank` orders alternatives. For curated alternatives, `media_candidate.title` holds the link label. Seed matches become `programme` rows (one per matched title, linked to all broadcasts with that title) with `approved` candidates.

## 5. System components

```
apps/web          Next.js 16 (App Router, TypeScript) – the TV, Info/Mitmachen/Impressum/Datenschutz, admin
                  (/admin: dashboard, Beiträge, Meldungen, Gesperrt, Zwischenspiele, Aussortiert); proxy.ts sets the
                  per-request CSP nonce, instrumentation.ts checks the production config at start
packages/core     domain types, time math (TV day), match-level logic
packages/db       Drizzle ORM schema + migrations (Postgres; local dev uses PGlite = Postgres in WASM)
workers/ingest    schedule importers (one adapter per source) → normalized broadcasts
workers/match     programme linking + media search + scoring → media_candidate (status=proposed)
workers/health    periodic link/embeddability checks → status=dead, re-search
seed/             curated JSON days (start: seed/1991-03-13.json)
prototype/        the original HTML prototype (design reference, do not import code blindly)
```

**Why this stack:** one language end to end, Next.js gives SSR for shareable "day" pages plus API routes; Postgres for relational schedule data; workers run as simple Node scripts (cron / GitHub Actions) at first. No queue needed for the MVP.

## 6. Playback design

- **Seek-in-progress:** when a user tunes to a channel at 17:22 and the programme started at 17:10, start the video at `offset = now − broadcast.start` (recordings shorter than the elapsed time loop: `offset mod duration`). This creates the "live TV" feeling. Use the YouTube IFrame Player API (`start` param / `seekTo`).
- **Non-embeddable sources** (ZDF/ARD Mediathek, RTL+, Joyn): show the programme card on the TV screen + "Open in Mediathek" button. Investigate official embed options per provider later.
- **Fallback chain per slot:** exact → same_show_period → same_show → programme card. No substitute programme (owner decision, Nov 2026): a broadcast without a video shows its card with the YouTube search link and "Video vorschlagen"; unknown gaps on partial days say so. Videos that fail to play (removed, embedding disabled, stalled) are skipped for the visit. (Core `fallbackFor` is kept but no longer used by the TV.)
- **Interstitials:** at programme boundaries (see §3); after the last broadcast of a day the sign-off.
- **What the TV shows:** tabs above the set – **Fernsehen** with three modes (**Lückenlos**: built programme, linear; **Wie damals**: the real listing, linear; **Programm frei wählen**: any show from the guide, player controls), or a theme programme (**Kinderprogramm**, **Talk Shows**: built from the decade, any show can be picked, the end of a video goes on to the next show). Share links carry channel, time and theme (`?sender=&zeit=&programm=`).
- **Channel switching:** brief static/noise transition, keyboard 1–9 / Enter, ←/→, L; P−/P+ and a sound button on the panel; swipe on phones (one-time hint). Hidden stations are skipped everywhere.
- **Period details (nice-to-have):** channel logos/idents per era, test card when off-air, Sendeschluss with national anthem clip, teletext-style EPG.

## 7. Matching pipeline (workers/match)

1. **Normalize titles:** strip "(Wh.)", episode quotes, "Heute:" prefixes; split series vs. episode title; detect live events, news, films (genre hints in description: "Spielfilm, USA 1985").
2. **Link to programme:** fernsehserien.de / TVDB / TMDB ids (TVDB has German episode air dates, e.g. for GZSZ, Die Cleveren).
3. **Search providers:**
   - YouTube Data API `search.list` (expensive in quota – check the current quota, cache aggressively) with queries like `"<title>" 1991`, `"<title>" "<episode title>"`, `"<channel> <date>"`; then `videos.list` for duration/embeddable status.
   - Mediatheken: evaluate the MediathekView community API for ARD/ZDF availability; JustWatch-like data for RTL+/Joyn (check terms).
   - Special sources: Bundestag Mediathek, bpb Mediathek (both had exact 1999 items).
4. **Score:** title similarity, date found in video title/description, duration plausibility vs. slot length, channel name in title, upload description quality ("VHS", "komplette Folge", "inkl. Werbung").
5. **Human review queue** in the admin UI: approve/reject, set match level. Nothing goes live unreviewed in the MVP.
6. **Health checks:** re-check approved links weekly; mark dead; re-run search.

## 8. Legal & policy (not legal advice – get it reviewed before going public)

- We link/embed only, never host. YouTube embeds via the official player.
- EU case law (GS Media) makes knowingly linking to infringing uploads risky, especially commercially → prefer licensed sources (Mediatheken, RTL+, Joyn, official channels), visible **takedown process** (`takedown_request`), fast removal.
- Schedule data: facts are generally free, but databases are protected (EU sui generis right, ~15 years after the last substantial update). fernsehserien.de/wunschliste.de: licence first. tvprogramme.net: no copyright on the programme per its imprint; database right assumed expired (no substantial update since ~2003) → used and published, credited on the Info page.
- No user tracking beyond what's needed; GDPR-compliant consent for YouTube embeds (use privacy-enhanced mode `youtube-nocookie.com` and a click-to-load consent overlay).

## 8a. Security & operations (change request 10 Nov 2026)

- **Client address** (`CLIENT_IP_HEADER` or the X-Forwarded-For entry `TRUSTED_PROXY_HOPS` from the right, core `client-ip.ts`) keys all rate limits; it is only ever stored as a daily rotating hash.
- **Admin:** password ≥ 20 characters plus TOTP (both required in production), signed expiring session cookie, failed logins and used TOTP steps in the database, 5 failures per address or 20 overall in 15 minutes lock the login. Every admin action runs through `lib/admin-action` (`guarded`), errors show inline.
- **Headers:** nonce-based CSP (core `csp.ts`, `proxy.ts`), nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy, HSTS in production; `robots.txt` keeps /admin and /og out.
- **Startup check** (`instrumentation.ts`): no strong `CONTRIBUTION_SECRET` or no `SITE_URL` → the server refuses to start; see `apps/web/.env.example`.
- **Contributions** go to the route `/mitmachen/senden` (origin check, body capped before reading, global upload quota); **video reports** are validated at runtime and only accepted for URLs we link.
- **Retention** (core `RETENTION_DAYS`, `pnpm ingest purge`, run with every snapshot): spam 30 days, rejected 90 days, e-mail addresses 90 days after review, handled reports 180 days.
- **Caches:** coverage statistics, the theme pool and built programmes per process (cleared by `invalidateCoverage`); `/og` and the built-programme JSON carry public cache headers.
- **CI** (`.github/workflows/ci.yml`): typecheck, tests, build, `pnpm audit --prod`; Dependabot weekly/monthly.

## 9. Milestones

**M1 – Prototype port (1–2 sessions)**
- Next.js app with the prototype's design (CRT TV, remote, teletext EPG, test card, ad overlay).
- Load `seed/1991-03-13.json` (195 broadcasts, 6 channels, 12 media matches, 5 ad breaks) – no DB yet.
- YouTube IFrame embed inside the TV screen with seek-in-progress; Mediathek items as link-out cards.
- Time controls: live clock, slider, jump via EPG.

**M2 – Database + importer**
- Postgres + Drizzle schema (§4), seed import.
- Importer adapter for tvprogramme.net (after permission): parse `view_tag.php` pages for all ~300 days of 1990–92; fix encoding; split per channel; detect regional windows.

**M3 – Matching + curation**
- YouTube search worker + scoring, review UI, health checker.
- Goal: ≥ 1 approved candidate for ≥ 40 % of prime-time slots on 10 curated days.

**M4 – Ads**
- Ad-break library for 1990–92 per channel and quarter; break insertion logic; later spot-level cutting.

**M5 – More eras**
- OCR pipeline for scanned TV guides (layout per magazine), fernsehserien.de licence for series slots, Wayback spot data for ~2000.

## 10. Open questions

1. Hosting/deployment target (Vercel + Neon/Supabase? self-hosted?).
2. Public launch vs. private hobby project → decides how strict the legal setup must be.
3. Day selection logic for the public product: same calendar date in a year with data, or a curated "day of the week" archive?
4. Permission requests: fernsehserien.de (imfernsehen GmbH) still open. tvprogramme.net settled (see source table).
5. Regional ARD windows (WDR/NDR/HR/…): pick one by user setting or default?

## Appendix A – seed file format (`seed/1991-03-13.json`)

```jsonc
{
  "date": "1991-03-13", "tvDayStart": "06:00", "timezone": "Europe/Berlin",
  "source": { "name": "...", "url": "...", "license": "permission pending" },
  "channels": [{ "id": "ard", "name": "Das Erste", "displayNumber": 1, "isPrivate": false }],
  "broadcasts": [{ "channel": "ard", "start": "21:10", "end": "22:30",
                   "startMinOfTvDay": 1270, "endMinOfTvDay": 1350,
                   "title": "Eiskunstlauf-WM live", "description": "Kür der Paare …" }],
  "media": [{ "matchTitle": "Eiskunstlauf-WM live", "level": "exact", "url": "https://www.youtube.com/watch?v=…", "note": "…" }],
  "adBreaks": [{ "channel": "rtl-plus", "url": "…", "note": "Werbung und Sendeschluss 12.03.1991" }]
}
```
Note: in the seed, `media` is matched by exact broadcast title (prototype shortcut). In the DB this becomes `media_candidate` linked to `programme`/`broadcast`.

## Appendix B – research notes
See the project docs `probe-1999-11-09.md` (data-source survey, why 1999 failed) and `probe-1991-03-13.md` (video availability for a full 1991 day).
