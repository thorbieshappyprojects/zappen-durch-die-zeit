# Change request – security & usability (10 Nov 2026)

> Handoff for Claude Code. Result of a code review of the working tree on 10 Nov 2026 (including the then-uncommitted changes in 28 files). Every item below is **confirmed by the owner**.
> UI text German; code, comments, commits English (see `CLAUDE.md`). Read `apps/web/AGENTS.md` first: check the Next.js docs in `node_modules/next/dist/docs/` before touching headers, proxy/middleware, metadata or server actions.

**Before you start:** commit the current uncommitted work on its own, so these changes are reviewable separately.

**Explicitly out of scope (owner decision, do not implement):**
- Changing the match marks 🟢🟡🔵❌ (they stay as they are).
- Per-viewer switches for CRT look and TV sounds (both stay admin-only site settings).

## Overview

| ID | Change | Prio |
|---|---|---|
| S1 | Trustworthy client IP, global login throttle, login state in the DB | High |
| S2 | Security headers (incl. CSP) and `robots.txt` | High |
| S3 | Fail fast on weak production config | Med |
| S4 | Limit upload abuse | Med |
| S5 | Harden "Video defekt melden" | Med |
| S6 | Cache the expensive public endpoints | Med |
| S7 | Retention and deletion for contributions | Med |
| S8 | Impressum, Datenschutzerklärung, takedown contact | Med (launch blocker) |
| S9 | Unblock action for blocked videos | Low |
| S10 | CI and supply chain before the first push | Low |
| S11 | Small hardening batch | Low |
| U1 | Contribution form keeps its content on errors | High |
| U2 | German 404, error and loading pages | High |
| U3 | Visible P−/P+ and a permanent sound button | High |
| U4 | Refresh form tokens on demand | Med |
| U5 | `metadataBase` from `SITE_URL` | Med |
| U8 | Dialog and screen-reader basics | Med |
| U9 | Fix the consent text | Low |
| U10 | Admin flow: confirmations, friendly errors, paging | Low |
| U11 | Small text ≥ 13 px | Low |
| U12 | Remove dead code, update docs | Low |

(U6 and U7 were rejected, hence the gap in the numbering.)

Suggested order: S1, S3, S5, S11 → S2 → U1, U4 → U2, U3, U9, U5 → S4, S6 → S7, S9, U10 → S8 → U8, U11 → S10, U12.
Run `pnpm test`, `pnpm typecheck`, `pnpm build` after each step.

---

## Security

### S1 – Trustworthy client IP, global login throttle, login state in the DB

**Finding.** `clientIp()` in `apps/web/lib/contribution-security.ts` returns the *first* value of `X-Forwarded-For`. That part is written by the caller unless the hosting platform overwrites the header. Every limit keys on its hash: admin lockout (`lib/admin-auth.ts`, 5 failures / 15 min), contributions (5/h, 20/day), video reports (20/h). A script that sends a new made-up address per request is never limited. In addition, `failures` and `lastUsedStep` in `admin-auth.ts` live in process memory: a restart clears them, several instances each have their own.

**Change.**
- `clientIp()`: configurable and explicit.
  - `CLIENT_IP_HEADER` (optional): name of a header the platform sets itself (e.g. `x-vercel-forwarded-for`, `cf-connecting-ip`, `fly-client-ip`). If set, use only this.
  - Otherwise `X-Forwarded-For` with `TRUSTED_PROXY_HOPS` (default `1`): take the value that many positions from the *right*. Never the leftmost value blindly.
  - Check how `next start` itself fills `x-forwarded-for` when no proxy is in front (Next docs) and document the right setting per hosting type in the README.
- Admin login: add a global throttle independent of the address (20 failed logins in 15 min → all logins refused until the window has passed; log it). Trade-off accepted: an attacker can lock the single admin out temporarily.
- Persist failed logins and the last used TOTP step in the database (small tables, e.g. `admin_login_attempt(ip_hash, at)` and a key/value row for the step). Migration via `pnpm --filter @wld/db generate`.

**Done when.** Unit tests cover: spoofed leftmost XFF value is ignored; `CLIENT_IP_HEADER` wins; global throttle triggers with rotating addresses; a used TOTP step stays rejected after a simulated restart.

### S2 – Security headers and robots.txt

**Finding.** `apps/web/next.config.ts` sets no response headers. No CSP, no clickjacking protection for `/admin`, no HSTS, no Referrer-Policy. There is no `robots.ts`.

**Change.**
- Site-wide headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (not `no-referrer`: YouTube embeds need a referrer), `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security` in production only.
- Content-Security-Policy, nonce-based as the Next docs describe. Starting point (verify each source in the browser console, first as `Content-Security-Policy-Report-Only`, then enforce):
  - `default-src 'self'`; `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`; `frame-ancestors 'none'`
  - `script-src 'self' 'nonce-…' https://www.youtube.com` (IFrame API loader and widget script)
  - `frame-src https://www.youtube-nocookie.com https://geo.dailymotion.com https://player.vimeo.com`
  - `media-src https://archive.org https://*.archive.org` (downloads redirect to storage hosts)
  - `img-src 'self' data:`; `style-src 'self' 'unsafe-inline'` (inline `style` attributes are used widely); `connect-src 'self'`
- Keep the stricter per-response CSP of `app/admin/beitraege/datei/[id]/route.ts`.
- `app/robots.ts`: disallow `/admin` and `/og`; reference the sitemap (`SITE_URL`).

**Done when.** All four players (YouTube, archive.org, Dailymotion, Vimeo) still play with the CSP enforced and the console shows no violations on TV, Programm, Info, Mitmachen and admin pages.

### S3 – Fail fast on weak production config

**Finding.** With `ADMIN_TOKEN` set but no `ADMIN_TOTP_SECRET`, the admin login works with the password alone (only a hint is shown). `CONTRIBUTION_SECRET` silently falls back to a random per-process value, which breaks form tokens and IP hashes across restarts and instances.

**Change.** One config check that runs at server start when `NODE_ENV=production`:
- `CONTRIBUTION_SECRET` missing or shorter than 32 characters → refuse to start with a clear message.
- `ADMIN_TOKEN` shorter than 20 characters, or `ADMIN_TOTP_SECRET` missing → admin login disabled (`adminConfigured()` false) and a log line saying why.
- `SITE_URL` missing → refuse to start (needed for U5, sitemap, robots).
- Development behaviour unchanged.
- Add `apps/web/.env.example` listing every variable (names and a one-line purpose, no values).

### S4 – Limit upload abuse

**Finding.** `experimental.serverActions.bodySizeLimit: "30mb"` applies to every server action, including login and video reports. `submitContribution` (`app/mitmachen/actions.ts`) reads all files into memory before it checks the rate limit. There is no overall quota for `.data/uploads`.

**Change.**
- Order in `submitContribution`: consent → rate limit → size check → read files.
- Global quota: refuse attachments (German message, text is still accepted) when more than `UPLOAD_DAILY_QUOTA_MB` (default 500) arrived in the last 24 h or the store exceeds `UPLOAD_TOTAL_QUOTA_MB` (default 5000). Sum from `contribution_file.size_bytes`.
- Preferred: move file upload to its own route handler that checks `Content-Length` and stops reading at the cap, then set the server-action body limit back to the default. If that turns out too invasive, keep the action, apply the two points above and note the reason in `CLAUDE.md`.

### S5 – Harden "Video defekt melden"

**Finding.** `reportVideo` (`app/melden/actions.ts`) is a server action with an object argument. Its TypeScript types are not checked at runtime (a non-string `note` throws a 500). It accepts any http(s) URL, stores it, shows it to the moderator as a link and may fetch it in `lib/video-health.ts`.

**Change.**
- Validate the input at runtime (plain object, every field `typeof` string/boolean, lengths) before use; invalid → `{ ok: true }` as today.
- Accept a report only if the URL exists as an approved `media_candidate` or as an `interstitial` (new helper in `packages/db`). Unknown URLs are dropped silently. The health check then only ever fetches known URLs.
- Tests for both.

### S6 – Cache the expensive public endpoints

**Finding.** `/og` renders an image and queries the DB on every request with no cache headers. `/tag/[date]/lueckenlos` builds a whole programme per request and answers `Cache-Control: private`.

**Change.**
- `/og`: `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`.
- `lueckenlos`: memoise per `date|theme` in the server process with the same lifetime and invalidation as the coverage cache in `lib/db.ts` (`invalidateCoverage`), cap the number of cached entries, and answer `Cache-Control: public, max-age=600` (the response is not viewer-specific).

### S7 – Retention and deletion for contributions

**Finding.** Spam and rejected contributions, optional e-mail addresses and uploaded files are kept forever. There is no delete action and no purge.

**Change.**
- `deleteContribution(id)` in `packages/db` plus file removal in `lib/upload-store.ts`; admin button „Endgültig löschen“ at `/admin/beitraege` (with confirmation, see U10).
- `pnpm ingest purge` (and call it from the snapshot run): delete spam older than 30 days and rejected contributions older than 90 days including their files; clear `contributor_email` 90 days after a contribution was approved or rejected; delete handled `media_report` rows older than 180 days.
- State the retention in the form's consent text and in the Datenschutzerklärung (S8).
- Tests for the purge rules.

### S8 – Impressum, Datenschutzerklärung, takedown contact

**Finding.** No Impressum, no Datenschutzerklärung. Rights holders can only use the Mitmachen form, which is rate-limited and spam-filtered.

**Change.**
- Routes `/impressum` and `/datenschutz` (German, same page style as `/info`), reachable with one click from every page without breaking the one-screen TV layout.
- Owner details from one place (`OWNER_NAME`, `OWNER_ADDRESS`, `OWNER_EMAIL` in the environment). Until they are set, the pages show a clearly marked placeholder; in production the config check (S3) warns.
- Datenschutzerklärung covers what the code actually does: hosting/server logs; embedded videos per provider only after consent (stored in `localStorage`); contribution form (optional name and e-mail, files, daily rotating hash instead of the IP address, retention per S7); video reports; no tracking, the only cookie is the admin session; rights of the person; contact.
- Show the takedown e-mail address on `/info` (section „Videos & Datenschutz“) and in the README, next to the form.
- The owner has the texts checked legally before the public launch; mark that in the PR/commit message.

### S9 – Unblock action for blocked videos

**Finding.** `blocked_video` is written by moderators and by the automatic rule; the dashboard only shows the count. Undoing a block needs SQL.

**Change.** Admin list of blocked videos (URL, reason, date) with „Entsperren“ (`requireAdmin()`, removes the row, `invalidateCoverage()`), linked from `/admin/meldungen`.

### S10 – CI and supply chain before the first push

**Finding.** No CI, no dependency audit, no remote yet. Checked on 10 Nov: no `.env`, `.data` or `.DS_Store` files are tracked, and no API-key patterns appear in the git history.

**Change.**
- `.github/workflows/ci.yml`: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit --prod --audit-level=high`.
- `.github/dependabot.yml` (npm weekly, GitHub Actions monthly).
- Run `pnpm audit` now and report the findings to the owner before fixing anything major.
- Note for the owner in the README: enable GitHub secret scanning with push protection on the repository.
- Repeat the tracked-files check right before the first push.

### S11 – Small hardening batch

- `app/mitmachen/page.tsx`: the `tag` parameter goes unvalidated into the back link `/tag/${tag}`. Validate with the date pattern as `/info` does; on `/info`, build the Mitmachen link from the validated value.
- `isAdminToken()`: compare SHA-256 digests with `timingSafeEqual` instead of returning early on a length mismatch.
- `auth-actions.ts`: accept `next` only if it equals `/admin` or starts with `/admin/`.
- `components/IframePlayer.tsx`: add `referrerPolicy="strict-origin-when-cross-origin"`; try a `sandbox` attribute (`allow-scripts allow-same-origin allow-presentation`) and keep it only if Dailymotion and Vimeo still play.
- `approveVideoContribution()`: `parseHHMM` throws on an impossible time; return the error result instead.
- `reportFailedVideo()` writes one `localStorage` key per video URL without limit; keep one small map and drop entries from earlier days.

---

## Usability

### U1 – Contribution form keeps its content on errors

**Finding.** `ContributionForm` uses uncontrolled fields with a form action. React resets such a form when the action returns, also when it returns errors. A rejected file type or the rate-limit message therefore wipes the text, which may be a whole typed-in day. Files are only checked on the server after the upload. Reproduce first (attach a `.zip`), then fix.

**Change.**
- Text, name, e-mail and the broadcast reference survive an error (controlled fields, or values returned in `SubmitState`).
- Check attachments in the browser before sending, with the shared `UPLOAD_LIMITS` from `@wld/core`: count, size per file, total size, allowed types. Same German messages as the server.
- If the request itself fails (too large, network), show a German message in the form instead of an error page.
- After a server-side error, say that attachments must be selected again.

### U2 – German 404, error and loading pages

**Finding.** No `not-found.tsx`, `error.tsx` or `loading.tsx` anywhere under `apps/web/app`. A date without data or a mistyped address shows Next's English default page; a database error shows a raw error.

**Change.**
- `app/not-found.tsx`: German, in the look of the test card, link to the start page.
- `/tag/[date]` for a valid date without programme: „Für den 5. Mai 2001 haben wir kein Programm“ with links to the nearest earlier and later day, „Zufälliger Tag“ and Mitmachen. Invalid dates get the general 404.
- `app/error.tsx` and `app/global-error.tsx`: „Bildstörung“ with a retry button; no technical details.
- `app/tag/[date]/loading.tsx`: keeps the page frame and shows a short „Sender wird eingestellt …“; must not flash on fast navigation.
- `app/admin/error.tsx`: shows the error message to the moderator.

### U3 – Visible P−/P+ and a permanent sound button

**Finding.** On phones the only ways to zap are a swipe that is mentioned only in the help overlay, and the channel list below the TV. A sound button appears only after the browser muted the TV; otherwise mute exists only as the M key.

**Change.**
- TV panel: `P−` and `P+` buttons (same as ←/→) and a permanent sound toggle with `aria-pressed`, replacing the conditional „Ton einschalten“. Touch targets at least 44 px.
- One-time swipe hint on touch devices after the first power-on („◀ wischen zum Umschalten ▶“, a few seconds, remembered in `localStorage`).
- Check the panel at 360, 390 and 768 px width and the one-screen fit on desktop (1280×720, 1440×900).

### U4 – Refresh form tokens on demand

**Finding.** The signed form token is issued when the page is rendered and rejected after 24 h. A TV left open for a day silently drops manual and automatic reports; a contribution sent from an old tab is filed as spam (`stale-form`). Both still answer „Danke“.

**Change.**
- Small endpoint that issues a fresh token. The TV page and the Mitmachen form fetch a new one when theirs is older than 6 h (timer and `visibilitychange`). The minimum fill time keeps working because the token is not fetched at submit time.
- A correctly signed but expired token is not spam: `reportVideo` answers with an "expired" result and the client retries once with a fresh token; the contribution form shows „Das Formular war zu lange offen – bitte noch einmal abschicken“ and keeps the content (U1).
- Forged or missing tokens behave as today.

### U5 – `metadataBase` from `SITE_URL`

**Finding.** `app/layout.tsx` sets no `metadataBase`, while `/tag/[date]` uses the relative image path `/og?…`. Link previews then point to the wrong host in production.

**Change.** `metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000")` in the root layout; a default Open Graph image (`/og`) for start, Info and Mitmachen; check the generated tags of a shared link (`/tag/1991-03-13?sender=rtl&zeit=20:15`).

### U8 – Dialog and screen-reader basics

**Finding.** Help overlay (`HelpOverlay.tsx`) and calendar (`YearTimeline.tsx`) are `role="dialog"` without `aria-modal`, focus trap or returning focus. The key handler in `TvApp.tsx` only ignores `INPUT` and `TEXTAREA`. A channel change is only visible (OSD), not announced. The programme tabs use `role="tablist"` without tab panels.

**Change.**
- Help overlay and calendar: `aria-modal`, focus stays inside, Escape closes, focus returns to the opening button; the calendar focuses the current day when it opens.
- Key handler: also ignore `SELECT`, and ignore TV shortcuts (except Escape) while a dialog or the report form is open.
- A visually hidden `aria-live="polite"` region announces a channel change once („3 RTL – jetzt: Der Preis ist heiß“), not every second.
- Report form: Escape closes, focus moves to the first option.
- Programme tabs: either a complete tabs pattern or plain buttons with `aria-pressed`.

### U9 – Fix the consent text

**Finding.** `PowerScreen` says the decision „lässt sich unten widerrufen“, but the revoke button exists only on `/info`.

**Change.** Text: „… lässt sich auf der Info-Seite widerrufen“, with „Info-Seite“ as a link to that section.

### U10 – Admin flow: confirmations, friendly errors, paging

**Finding.** „Als defekt markieren“, „Spam“, „Ablehnen“ and „Ausblenden“ act immediately. Invalid input makes the actions `throw`, which ends on an error page. `listContributions` stops at 200 rows without paging. The admin navigation is repeated in every page.

**Change.**
- Two-step buttons („Wirklich?“) for destructive actions, including the new delete (S7) and unblock (S9). No browser `confirm()` dialogs.
- Actions return an error state that the page shows inline in German.
- Paging (`?seite=`) and a count per tab at `/admin/beitraege` and `/admin/meldungen`.
- One shared admin navigation component with the current page marked.

### U11 – Small text ≥ 13 px

**Finding.** Several texts are 10–12 px, some at reduced opacity: `.mode-hint` (11), `.tt-foot span` (12), `.cal-wd` (10), `.tt-row .m-none` (11), `.report-btn` (12), `.cov-chip` (12), `.share-note` (12), `.tt-tab` (12), `.badge` (12), `.admin-kind-auto` (11).

**Change.** Minimum 13 px for readable text, contrast at least 4.5:1 (check the texts with `opacity` .6–.7). Re-check the one-screen fit (1280×720, 1440×900) and a phone (390×844).

### U12 – Remove dead code, update docs

- `components/TimeBar.tsx` and the `.timebar*` rules in `globals.css` are unused: remove.
- `ARCHITECTURE.md`: bring up to date (station names per the naming rule, `interstitial` instead of `ad_break`, `media_report`, `blocked_video`, admin login, modes „Lückenlos“ / „Wie damals“ / „Programm frei wählen“, theme programmes).
- `README.md`: environment variables (S1, S3, S4, S8), hosting notes for the client IP, takedown contact.
- `CLAUDE.md`: add the new rules from this document once implemented.

---

## Verification at the end

- `pnpm test`, `pnpm typecheck`, `pnpm build` green.
- Browser check on 13.03.1991, 02.05.1997 (11 channels) and 20.11.1998 (partial day): power on, zap with keys and P−/P+, all three modes, a theme programme, share link, report a video, send a contribution with and without an invalid file, admin login with 2FA, approve/reject/delete a contribution, block and unblock a video.
- Same on a phone-sized viewport.
- Response headers present on every route; CSP enforced without console violations.
