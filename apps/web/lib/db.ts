import { cache } from "react";
import { bestDays, channelDayHints, dayCoverageScore, eventDay, eventWindow, seamlessDay, STATIONS, themeDay, tvDayDateOf, withStationNames, type ChannelDayHint, type HistoryEvent, type PoolVideo, type ThemeId } from "@zdz/core";
import { bestVideoStarts, computeStats, createDb, getSiteSettings as loadSiteSettings, listChannelDayCoverage, listEventExclusions, listEventPool, listStationVideoCounts, recordSnapshot, type DbStats, listHiddenStations, listDaySources, listSeamlessPool, listTvDayCoverage, listTvDays, loadTvDay, loadShow, searchShows, type DbHandle } from "@zdz/db";
import type { TvDay } from "@zdz/core";
import { canEmbed, withPlayableMedia } from "./providers";

// One connection per server process; survives dev hot reloads.
const globalForDb = globalThis as unknown as { zdzDb?: Promise<DbHandle> };

export function db(): Promise<DbHandle> {
  globalForDb.zdzDb ??= createDb().catch((err) => {
    globalForDb.zdzDb = undefined;
    throw err;
  });
  return globalForDb.zdzDb;
}

/**
 * Coverage over all days takes seconds to compute and changes only when videos are approved,
 * reported or blocked, or on an import: cached per server process, cleared by `invalidateCoverage`
 * (and at the latest after COVERAGE_TTL_MS, e.g. for an import into a shared Postgres).
 */
const COVERAGE_TTL_MS = 10 * 60_000;
const globalForCoverage = globalThis as unknown as {
  zdzCoverage?: { at: number; days: ReturnType<typeof listTvDayCoverage>; channels: ReturnType<typeof listChannelDayCoverage> };
  /** All stations' videos of the decade, for the theme channels (same lifetime as the coverage). */
  zdzThemePool?: { at: number; pool: Promise<PoolVideo[]> };
  /**
   * Per-date data and built programmes ("date|day", "date|seamless", "date|kinder", "dates" …): same
   * lifetime, at most BUILT_CACHE_MAX entries. Day pages only change on import or moderation.
   */
  zdzBuilt?: Map<string, { at: number; day: Promise<unknown> }>;
  /** The admin dashboard's figures (key figures, per-station video counts): same lifetime. */
  zdzDashboard?: { at: number; data: Promise<{ stats: DbStats; videoCounts: { slug: string; videos: number; shows: number }[] }> };
};
const BUILT_CACHE_MAX = 400;

function coverageRows() {
  const c = globalForCoverage.zdzCoverage;
  if (c && Date.now() - c.at < COVERAGE_TTL_MS) return c;
  const fresh = {
    at: Date.now(),
    days: db().then((h) => listTvDayCoverage(h.db)),
    channels: db().then((h) => listChannelDayCoverage(h.db)),
  };
  // A failed query isn't cached.
  Promise.all([fresh.days, fresh.channels]).catch(() => {
    if (globalForCoverage.zdzCoverage === fresh) globalForCoverage.zdzCoverage = undefined;
  });
  return (globalForCoverage.zdzCoverage = fresh);
}

/** Call after anything that changes which videos are approved or blocked. */
export function invalidateCoverage(): void {
  globalForCoverage.zdzCoverage = undefined;
  globalForCoverage.zdzThemePool = undefined;
  globalForCoverage.zdzBuilt = undefined;
  globalForCoverage.zdzDashboard = undefined;
}

/**
 * Admin dashboard figures: computing them over all days takes seconds (it made "Anmelden" slow, as
 * the login answers with the dashboard). Cached like the coverage; a fresh computation also stores
 * today's snapshot for the growth trend.
 */
export function getDashboardFigures() {
  const c = globalForCoverage.zdzDashboard;
  if (c && Date.now() - c.at < COVERAGE_TTL_MS) return { ...c, channels: coverageRows().channels };
  const data = db().then(async (h) => {
    const stats = await computeStats(h.db);
    await recordSnapshot(h.db, tvDayDateOf(new Date()), stats);
    return { stats, videoCounts: await listStationVideoCounts(h.db) };
  });
  const fresh = { at: Date.now(), data };
  data.catch(() => {
    if (globalForCoverage.zdzDashboard === fresh) globalForCoverage.zdzDashboard = undefined;
  });
  globalForCoverage.zdzDashboard = fresh;
  return { ...fresh, channels: coverageRows().channels };
}

/** One value per key (a day, a built programme, the date lists), cached like the coverage (oldest entries dropped first). */
function cachedBuilt<T>(key: string, build: () => Promise<T>): Promise<T> {
  const cache = (globalForCoverage.zdzBuilt ??= new Map());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < COVERAGE_TTL_MS) return hit.day as Promise<T>;
  const entry = { at: Date.now(), day: build() };
  entry.day.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > BUILT_CACHE_MAX) cache.delete(cache.keys().next().value!);
  return entry.day;
}

function themePool(): Promise<PoolVideo[]> {
  const c = globalForCoverage.zdzThemePool;
  if (c && Date.now() - c.at < COVERAGE_TTL_MS) return c.pool;
  // Every station, the whole decade (centre 1995, ±10 years), every video once.
  const pool = db()
    .then((h) => listSeamlessPool(h.db, "1995-01-01", STATIONS.map((s) => s.slug), 3660, 100_000))
    .then((all) => all.filter((v) => canEmbed(v.media.provider)));
  const fresh = { at: Date.now(), pool };
  pool.catch(() => {
    if (globalForCoverage.zdzThemePool === fresh) globalForCoverage.zdzThemePool = undefined;
  });
  globalForCoverage.zdzThemePool = fresh;
  return pool;
}

/** A day with its media, cached per process (it changes only on import or moderation). */
export const getTvDay = cache(async (date: string): Promise<TvDay | null> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return cachedBuilt(`${date}|day`, async () => {
    const day = await loadTvDay((await db()).db, date);
    // Channel names always from the station registry (review §2), never the source's spelling.
    return day && withPlayableMedia(withStationNames(day));
  });
});

export async function getTvDayDates(): Promise<string[]> {
  return cachedBuilt("dates", async () => listTvDays((await db()).db));
}

/** A theme channel programme (Kinderprogramm, Talk Shows) for a date: see core `themeDay`. */
export function getThemeDay(date: string, theme: ThemeId): Promise<TvDay | null> {
  return cachedBuilt(`${date}|${theme}`, async () => {
    const day = await getTvDay(date);
    return day && themeDay(day, await themePool(), theme);
  });
}

/**
 * A Chronik event's programme (core `eventDay`) on the date the TV shows: the event decides the
 * content, the date only the frame. Cached like the theme programmes; moderation clears it.
 */
export function getEventDay(date: string, event: HistoryEvent): Promise<TvDay | null> {
  return cachedBuilt(`${date}|event:${event.id}`, async () => {
    const day = await getTvDay(date);
    if (!day) return null;
    const { from, to } = eventWindow(event);
    const h = await db();
    const [pool, excluded] = await Promise.all([listEventPool(h.db, from, to), listEventExclusions(h.db, event.id)]);
    return eventDay(day, event, pool.filter((v) => canEmbed(v.media.provider)), excluded);
  });
}

/** The "Lückenlos" programme for a date: every channel filled with the station's videos from nearby days. */
export function getSeamlessDay(date: string): Promise<TvDay | null> {
  return cachedBuilt(`${date}|seamless`, async () => {
    const day = await getTvDay(date);
    if (!day) return null;
    const pool = await listSeamlessPool((await db()).db, date, day.channels.map((c) => c.id));
    return seamlessDay(day, pool.filter((v) => canEmbed(v.media.provider)));
  });
}

/** Video coverage per date (0…1, see core `coverageScore`), for the calendar. */
/** Dates that only have an assumed programme (regular slots derived from other days, completeness "series_only"). */
export function getAssumedDates(): Promise<string[]> {
  return cachedBuilt("assumed", async () => {
    const real = new Set<string>();
    const all = new Set<string>();
    for (const s of await listDaySources((await db()).db)) {
      all.add(s.date);
      if (s.completeness !== "series_only") real.add(s.date);
    }
    return [...all].filter((d) => !real.has(d));
  });
}

/** Per channel: nearest and best other day with a programme (for empty or poorly covered channels). */
export function getChannelDayHints(date: string): Promise<Record<string, ChannelDayHint>> {
  return cachedBuilt(`${date}|hints`, () => channelHints(date));
}

async function channelHints(date: string): Promise<Record<string, ChannelDayHint>> {
  const hints = channelDayHints(await coverageRows().channels, date);
  // Where each hint should land: the show with the best playable video on that day.
  const pairs = Object.entries(hints).flatMap(([channel, h]) =>
    [h.nearest, h.best?.date].filter((d): d is string => Boolean(d)).map((d) => ({ date: d, channel })),
  );
  const starts = await bestVideoStarts((await db()).db, pairs, canEmbed("dailymotion") ? [] : ["dailymotion"]);
  for (const [channel, h] of Object.entries(hints)) {
    const at: Record<string, number> = {};
    for (const d of [h.nearest, h.best?.date]) {
      const start = d ? starts.get(`${d}|${channel}`) : undefined;
      if (d && start !== undefined) at[d] = start;
    }
    h.videoAt = at;
  }
  return hints;
}

export async function getTvDayCoverage(): Promise<{ byDate: Record<string, number>; best: { date: string; score: number }[] }> {
  const rows = await coverageRows().days;
  return {
    byDate: Object.fromEntries(rows.map((r) => [r.date, dayCoverageScore(r.points, r.broadcasts)])),
    best: bestDays(rows, 5),
  };
}

/** Every TV day with its source (licence, completeness) – for the sitemap. */
export async function getDaySources() {
  return listDaySources((await db()).db);
}

/** Station slugs an admin took out of the channel list (low coverage). */
/** Admin switches for the TV (CRT look, sounds). */
export async function getSiteSettings() {
  return loadSiteSettings((await db()).db);
}

export async function getHiddenStations(): Promise<string[]> {
  return listHiddenStations((await db()).db);
}

/** Shows matching a search (core `rankShowHits`); `near` picks the airing to open among equally good ones. */
export async function findShows(query: string, near?: string) {
  return searchShows((await db()).db, query, 8, near);
}

/** Every airing of a show (normalised title) on real days, cached like a day. */
export function getShow(key: string) {
  return cachedBuilt(`show|${key}`, async () => loadShow((await db()).db, key));
}
