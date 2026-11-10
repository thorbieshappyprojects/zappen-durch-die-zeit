import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { siteSetting, stationSetting, statsSnapshot } from "./schema";

/** Key figures of the database (admin dashboard and daily snapshots). Keys are stable: they are stored. */
export interface DbStats {
  daysReal: number;
  daysAssumed: number;
  broadcastsReal: number;
  broadcastsWithVideo: number;
  broadcastsExact: number;
  /** Distinct approved video URLs linked to broadcasts. */
  videos: number;
  interstitials: number;
  contributionsPending: number;
  reportsOpen: number;
  blockedVideos: number;
}

const rowsOf = <T>(result: unknown): T[] => (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];

export async function computeStats(db: Db): Promise<DbStats> {
  const [r] = rowsOf<Record<string, number>>(
    await db.execute(sql`
    with real_days as (select id from tv_day where completeness <> 'series_only'),
         best as (
           select b.id, b.tv_day_id,
             max(case mc.match_level when 'exact' then 3 when 'same_show_period' then 2 when 'same_show' then 1 else 0 end) as lvl
           from broadcast b
           left join media_candidate mc on mc.broadcast_id = b.id and mc.status = 'approved'
             and not exists (select 1 from blocked_video bv where bv.url = mc.url)
           group by b.id, b.tv_day_id)
    select
      (select count(distinct date)::int from tv_day where completeness <> 'series_only') as "daysReal",
      (select count(distinct d.date)::int from tv_day d where d.completeness = 'series_only'
         and not exists (select 1 from tv_day r where r.date = d.date and r.completeness <> 'series_only')) as "daysAssumed",
      (select count(*)::int from best where tv_day_id in (select id from real_days)) as "broadcastsReal",
      (select count(*)::int from best where tv_day_id in (select id from real_days) and lvl > 0) as "broadcastsWithVideo",
      (select count(*)::int from best where tv_day_id in (select id from real_days) and lvl = 3) as "broadcastsExact",
      (select count(distinct url)::int from media_candidate where status = 'approved') as "videos",
      (select count(*)::int from interstitial where status = 'approved') as "interstitials",
      (select count(*)::int from contribution where status = 'pending') as "contributionsPending",
      (select count(distinct url)::int from media_report where handled_at is null) as "reportsOpen",
      (select count(*)::int from blocked_video) as "blockedVideos"`),
  );
  return Object.fromEntries(Object.entries(r!).map(([k, v]) => [k, Number(v)])) as unknown as DbStats;
}

/** Stores today's figures (one snapshot per day; a later call the same day overwrites it). */
export async function recordSnapshot(db: Db, day: string, stats: DbStats): Promise<void> {
  const data = { ...stats } as unknown as Record<string, number>;
  await db.insert(statsSnapshot).values({ day, data }).onConflictDoUpdate({ target: statsSnapshot.day, set: { data, takenAt: new Date() } });
}

export async function listSnapshots(db: Db): Promise<{ day: string; data: DbStats }[]> {
  const rows = await db.select().from(statsSnapshot).orderBy(statsSnapshot.day);
  return rows.map((r) => ({ day: String(r.day).slice(0, 10), data: r.data as unknown as DbStats }));
}

/** Station slugs hidden from the channel list by an admin. */
export async function listHiddenStations(db: Db): Promise<string[]> {
  return (await db.select({ slug: stationSetting.slug }).from(stationSetting).where(eq(stationSetting.hidden, true))).map((r) => r.slug);
}

export async function setStationHidden(db: Db, slug: string, hidden: boolean): Promise<void> {
  await db
    .insert(stationSetting)
    .values({ slug, hidden })
    .onConflictDoUpdate({ target: stationSetting.slug, set: { hidden, updatedAt: new Date() } });
}

/** Per station: distinct approved, unblocked videos and the shows (broadcast titles) they belong to. */
export async function listStationVideoCounts(db: Db): Promise<{ slug: string; videos: number; shows: number }[]> {
  type Row = { slug: string; videos: number; shows: number };
  const result: unknown = await db.execute(sql`
    select c.slug, count(distinct mc.url)::int as videos, count(distinct lower(b.title))::int as shows
    from media_candidate mc
    join broadcast b on b.id = mc.broadcast_id
    join channel c on c.id = b.channel_id
    where mc.status = 'approved' and mc.confidence >= 1
      and not exists (select 1 from blocked_video bv where bv.url = mc.url)
    group by c.slug`);
  // PGlite returns { rows }, postgres-js an array.
  const rows = (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
  return rows.map((r) => ({ slug: r.slug, videos: Number(r.videos), shows: Number(r.shows) }));
}

/** Site-wide switches set on the admin dashboard (the TV has no switches for them). */
export interface SiteSettings {
  /** CRT look (scanlines, vignette) on the screen. */
  crtFilter: boolean;
  /** Synthesized TV sounds (switching, power on). */
  sounds: boolean;
}
export const SITE_SETTING_DEFAULTS: SiteSettings = { crtFilter: true, sounds: true };

export async function getSiteSettings(db: Db): Promise<SiteSettings> {
  const rows = await db.select().from(siteSetting);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(
    Object.entries(SITE_SETTING_DEFAULTS).map(([k, v]) => [k, typeof stored[k] === typeof v ? stored[k] : v]),
  ) as unknown as SiteSettings;
}

export async function setSiteSetting<K extends keyof SiteSettings>(db: Db, key: K, value: SiteSettings[K]): Promise<void> {
  await db
    .insert(siteSetting)
    .values({ key, value })
    .onConflictDoUpdate({ target: siteSetting.key, set: { value, updatedAt: new Date() } });
}

/** Small counts for the admin navigation: new contributions, videos with open reports, blocked videos. */
export async function adminCounts(db: Db): Promise<{ contributionsPending: number; reportsOpen: number; blocked: number }> {
  type Row = { contributionsPending: number; reportsOpen: number; blocked: number };
  const result: unknown = await db.execute(sql`
    select
      (select count(*)::int from contribution where status = 'pending') as "contributionsPending",
      (select count(distinct url)::int from media_report where handled_at is null) as "reportsOpen",
      (select count(*)::int from blocked_video) as blocked`);
  // PGlite returns { rows }, postgres-js an array.
  const row = ((Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[])[0];
  return { contributionsPending: Number(row?.contributionsPending ?? 0), reportsOpen: Number(row?.reportsOpen ?? 0), blocked: Number(row?.blocked ?? 0) };
}
