# M6 – Teilen, Übersicht & Atmosphäre (architecture)

> Handoff for Claude Code, 9 Nov 2026. Builds on `ARCHITECTURE.md` and `docs/ux-review-2026-11-09.md` (do the UX review first; the rename to „Zappen durch die Zeit“ is assumed).
> Origin: comparison with MyRetroTVs (random 90s YouTube clips), The Time Travel TV / ttttv.ca (clock-synced invented schedule, guide channel) and FieldStation42 (open-source local-file TV scheduler with bumpers/sign-off). Our differentiator stays: **real, dated schedules**. Do not add random-clip modes or mixed-era channels.
> UI German; code, comments, commits English. All new time math via `packages/core/src/time.ts`.

## Scope

| # | Feature | Milestone |
|---|---|---|
| F1 | Shareable deep links (day + channel + time) | M6 |
| F2 | Printable/SEO day page „Fernsehprogramm vom …“ | M6 |
| F3 | Teletext overview page P300 „Jetzt / Danach“ (all channels) | M6 |
| F4 | Station idents, announcers, sign-off (interstitials) | M6 |
| F5 | Keyboard: help overlay, last channel, fullscreen, dial + Enter | M6 |
| F6 | „Video defekt melden“ | M6 |
| F7 | TV sound effects (click, static), switchable | M6 |
| F8 | Historical weather of the day | **M7 (later)** |

Out of scope for now: first-screen claim text (owner decision: not yet), kiosk mode, donations.

Suggested order: F5 → F1 → F3 → F6 → F7 → F2 → F4 (F4 needs data curation).

---

## F1 – Shareable deep links

Goal: „Guck mal, was an meinem Geburtstag um 20:15 auf RTL lief“ as one link.

- URL: `/tag/YYYY-MM-DD?sender=<slug>&zeit=HH:MM`. Both params optional. Reuse the parameter names already used for `/mitmachen` (`sender`, `zeit`).
- Semantics:
  - `sender` → tune that channel on load (overrides the localStorage channel). Unknown/absent-on-that-day slug → ignore, keep default.
  - `zeit` → start in a manual clock anchored at that TV-day time (same as `jumpTo`), *not* live. Times 00:00–05:59 belong to the next calendar morning of the TV day (TV day 06:00→06:00) – convert with core helpers; add a unit test.
  - Without `zeit`: live behaviour as today.
- Keep the URL in sync while using the app: `router.replace` (no history spam) on channel change; add `zeit` only when the clock is manual. Debounce.
- „Teilen“ button in the info strip: Web Share API (`navigator.share`) where available, else copy to clipboard + toast „Link kopiert“. Shared link should contain the *current* time (`zeit`) so the receiver lands on the same programme.
- Open Graph per day/broadcast (`generateMetadata` in `app/tag/[date]/page.tsx`): title `20:15 RTL – Medicopter 117 · 9. November 1999 | Zappen durch die Zeit` when `sender`+`zeit` are given; description = broadcast description. OG image: generated with `next/og` (`opengraph-image.tsx`): teletext-style card with date, channel, time, title. No video thumbnails (rights).
- Core: `parseShareParams(searchParams, day) → { channelId?, tvDayMin? }` and `shareUrl(day, channel, tvDayMin?)` in `packages/core` with tests.

## F2 – Day listing page (print + search engines)

Goal: people google „Fernsehprogramm 13. März 1991“. Give every day a server-rendered text page.

- Route: `/tag/[date]/programm` (German slug), fully SSR, no client JS needed. Link from the TV header („Programm des Tages“) and from the teletext footer.
- Layout: HÖRZU-like print style – columns per channel (wide screens), stacked per channel (mobile); times, titles, descriptions, match mark per broadcast (text, not emoji: „Video“, „ähnliches Video“), link per broadcast to the TV deep link (F1).
- Header: `Fernsehprogramm vom Mittwoch, 13. März 1991`, source line + „erfasst von …“ (CLAUDE.md requires crediting the transcriber), completeness note for partial days.
- `@media print` stylesheet: black on white, no TV chrome, page breaks between channel groups.
- SEO: `generateMetadata` with title `Fernsehprogramm 13. März 1991 – ARD, ZDF, RTL, SAT.1 …`; canonical URL; `sitemap.ts` listing all day pages; JSON-LD optional (`BroadcastEvent` per broadcast is possible but large – start without).
- **Licence guard (important):** tvprogramme.net data has `license_status = unknown` (CLAUDE.md). A fully crawlable listing is effectively publishing the dataset. Add a config flag `PUBLISH_LISTINGS` (env) and a per-source check: render the page with `robots: noindex` and exclude it from the sitemap unless the day's source has `granted` or `not_required`. Days from own reconstructions (e.g. 20.11.1998) can be indexed.
- Data: reuse `getTvDay(date)`; no new tables.

## F3 – Teletext P300 „Jetzt / Danach“

Goal: see what's on everywhere without zapping (like ttttv's guide channel, but as teletext).

- Teletext gets a page model: `P300` = overview, `P301…P3nn` = channel pages (current behaviour). Default stays the tuned channel's page.
- P300 content: one row per channel on this day (registry order): number, short name, `JETZT` title (+ start time), `DANACH` time + title, match mark of the current broadcast. Click a row → tune that channel (in „Wie damals“ mode too – tuning is always allowed; only time-jumping is restricted).
- Navigation: tabs/links „Übersicht“ ↔ channel page in the teletext header; keyboard: **`T`** toggles Übersicht/Senderseite (digits stay reserved for dialing).
- Updates every minute from the shared clock; computed client-side from `day` with existing `findOnAir`/`nextBroadcast` (new core helper `nowAndNextByChannel(day, tvDayMin)` + test, incl. after-midnight broadcasts and simulcasts).
- Mobile: P300 is the default teletext view below the TV (more useful than a single channel list).

## F4 – Interstitials: idents, announcers, sign-off

Goal: the glue between programmes that made German TV feel like German TV – more authentic than ads alone.

### Data model
Generalise ad breaks instead of adding a parallel system:

```
interstitial(id, channel_id, kind enum[ad_break, ident, announcer, trailer, sign_off, sign_on, test_card],
             aired_on date null, aired_period text /* 1991-Q1 */, valid_from date null, valid_to date null,
             provider, url, provider_video_id, in_s real null, out_s real null, duration_s real null,
             rank int default 0, notes text, status media_status default 'proposed')
```
- Migration: create `interstitial`, copy `ad_break` rows as `kind = ad_break`, keep `ad_break` as a view or drop after the web app is switched (one migration, with test). `ad_spot` references `interstitial` afterwards.
- `in_s/out_s` allow using a segment of a longer recording (e.g. a 20-s announcer clip inside a 10-min VHS upload) – the players must support start *and* end (YouTube `start`/`end` params; HTML5 via `currentTime` + timeupdate stop).
- `valid_from/valid_to` because idents change with logo eras (e.g. ZDF ident designs, ARD „Das Erste“ from 1996/97).

### Playback rules (core, pure functions + tests)
- `interstitialsFor(day, channel, boundary)` returns an ordered list for a programme boundary:
  - private channels: `ad_break` (existing rules: ad window, min programme length) → optional `ident`.
  - ARD/ZDF/Dritte: `ident` and, before prime time (≈ 19:58–20:15 and the evening's main programme) an `announcer` clip; ads only in the pre-20:00 slots where they really existed (ARD/ZDF had ads until 20:00) – keep this as a configurable rule, not hard-coded.
  - End of broadcast day (last broadcast ends, „Sendeschluss“): `sign_off` (national anthem / Sendeschluss clip) → then `test_card` screen (existing `TestCard`) until the next `sign_on`.
- Selection: same channel, `valid_from/to` covering the date, else nearest `aired_on`/`aired_period` (reuse the nearest-year logic of ad breaks), `rank` as tie-breaker.
- Length budget: interstitials are short (seconds); they play *before* the programme's own video and do not shift the programme's seek offset (the programme still starts at the live position after the interstitial – accept the small drift, as with ad breaks today).
- UI chip on screen during playback: `WERBUNG` (existing), `ANSAGE`, `SENDESCHLUSS`; ident needs no chip. „Weiter zum Programm“ button for all kinds.

### Curation
- Admin: list/approve interstitials in the existing admin area (`/admin/beitraege` → add a tab „Zwischenspiele“), with kind, channel, period, in/out seconds.
- Seed: start with a small curated set in `seed/interstitials.json` for 1991 and 1997 (ZDF Mainzelmännchen, ARD idents, ARD/ZDF announcers, Sendeschluss with anthem). Only link existing uploads; never download/re-host.
- Contributions: classify links that mention „Ansage“, „Ansagerin“, „Sendeschluss“, „Ident“, „Senderkennung“ as interstitial suggestions (`contribution` `kind` stays `video_link`; add a `suggested_kind` text field).

## F5 – Keyboard & screen modes

Current keys: digits (two-digit dialing), ←/→, PageUp/PageDown, M, F. Extend:

| Key | Action | Notes |
|---|---|---|
| `H` / `?` | Help overlay (all shortcuts) | Esc closes; also a „?“ button on the TV panel |
| `L` | Last channel („Rückruf“) | store previous slot on every tune |
| `V` | Vollbild (fullscreen of the TV screen, picture only) | Fullscreen API on the `.screen` element; Esc exits; double-click on screen also toggles |
| digits + `Enter` | Dial immediately | today two-digit dialing waits 1 s; Enter commits at once |
| `T` | Teletext: Übersicht (P300) ↔ Senderseite | see F3 |
| `G` | Geräusche an/aus | see F7 |
| `↑` / `↓` | Same as →/← (zap) | common on remotes |

- Keep F = Röhre/CRT filter and M = Ton (do not reassign).
- Central keymap in one module (`apps/web/lib/keymap.ts`) used by both the handler and the help overlay/Info page, so docs never drift.
- Mobile: no keys; add swipe left/right on the screen to zap and a fullscreen button.

## F6 – „Video defekt melden“

Goal: dead or wrong videos are the biggest maintenance risk; let viewers flag them in one click.

- Button in the info strip and programme card: `⚠ Video defekt / falsch` → small inline form: reason radio (`Video nicht verfügbar`, `Falsche Sendung`, `Falsche Stelle/Zeit`, `Anderes`) + optional text. No name/e-mail, no attachments.
- Storage: new table
  ```
  media_report(id, media_candidate_id null, interstitial_id null, reason enum[unavailable, wrong_programme, wrong_offset, other],
               note text, created_at, ip_hash, handled_at null)
  ```
  Reuse the contribution spam protection (`lib/contribution-security.ts`: signed token, honeypot, per-IP-hash rate limit).
- Automatic signal: when a player reports an error (`onError` in `TvApp`), the client already skips the video; additionally send an anonymous `unavailable` report (throttled: max 1 per video per browser per day). The health worker (ARCHITECTURE §7.6) re-checks reported videos first.
- Admin: reports grouped per video with count; actions „Als defekt markieren“ (→ `media_candidate.status = dead`), „Ignorieren“, „Zur Prüfung“.
- Policy: reports never change what is shown automatically except: ≥ 3 `unavailable` reports within 7 days + failed health check → mark `dead`.

## F7 – TV sound effects

- Sounds: channel-switch click/relay, short static burst on tune (same 180 ms as the visual static), power-on „thunk“ + CRT whine fade, power-off. Self-made or CC0 sources only; files in `apps/web/public/sfx/` (small, < 30 KB each, `.mp3` + `.ogg`). Record licence + source in `apps/web/public/sfx/LICENSES.md`.
- Web Audio API, preloaded after the power-on gesture (autoplay rules). Independent from video volume.
- Setting „Geräusche: an/aus“ on the TV panel (next to Ton/Röhre), key `G`, persisted in localStorage (`*-sfx`). Default **on**, but muted whenever the TV sound (M) is muted.
- Respect `prefers-reduced-motion`? Not applicable; but respect a global mute.

## F8 – Weather of the day (M7, later)

Idea only; do not build in M6.
- Data: Open-Meteo historical archive (daily/hourly back decades) for a few German cities, fetched once per TV day at import time and stored (`tv_day_weather(tv_day_id, city, data jsonb, source)`), never at runtime per visitor.
- Presentation: teletext page `P171 Wetter` styled like 1990s teletext weather, optionally a „Wetterkarte“ screen on the ARD slot after the Tagesschau. Label clearly as reconstructed data with source.
- Check Open-Meteo licence (attribution) before building.

---

## Testing / definition of done (M6)
- Unit tests (core): share-param parsing incl. after-midnight times, `nowAndNextByChannel`, interstitial selection rules (validity window, nearest period, public vs private channel), report throttling.
- DB tests: migration `ad_break → interstitial` keeps all rows; `media_report` insert + rate limit.
- Manual check in the browser on 13.03.1991, 02.05.1997, 20.11.1998 (partial) and a day with after-midnight broadcasts: deep link opens the right channel/time; P300 rows correct; Sendeschluss → test card; fullscreen + keys; report flow end-to-end in admin.
- `pnpm test`, `pnpm typecheck`, `pnpm build` green. Update `CLAUDE.md` (keys, new tables, licence guard for F2) and the Info page (shortcuts from the keymap).
