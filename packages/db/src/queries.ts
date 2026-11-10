import { providerOf, SEAMLESS_MAX_MIN, SEAMLESS_MIN_MIN, type AdBreak, type Interstitial, type Broadcast, type Channel, type MediaCandidate, type PoolVideo, type TvDay } from "@zdz/core";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "./client";
import { notBlocked } from "./reports";
import { broadcast, channel, interstitial, mediaCandidate, scheduleSource, tvDay, tvDayChannel } from "./schema";

/** Dates that have a TV day in the database, ascending. */
export async function listTvDays(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ date: tvDay.date }).from(tvDay).orderBy(asc(tvDay.date));
  return rows.map((r) => r.date);
}

/**
 * Video coverage per date: broadcasts and points of their best approved match
 * (core MATCH_POINTS: exact 10, same show/year 3, similar 1). With several sources for a date, the larger day counts.
 */
export async function listTvDayCoverage(
  db: Db,
): Promise<{ date: string; broadcasts: number; points: number; accuratePoints: number; exact: number }[]> {
  type Row = { date: string; broadcasts: number; points: number; accuratePoints: number; exact: number };
  const result: unknown = await db.execute(sql`
    select d.date as date, count(*)::int as broadcasts, coalesce(sum(best.pts), 0)::int as points,
      coalesce(sum(best.acc), 0)::int as "accuratePoints", count(*) filter (where best.pts = 10)::int as exact
    from (
      select b.id, b.tv_day_id,
        max(case mc.match_level when 'exact' then 10 when 'same_show_period' then 3 when 'same_show' then 1 else 0 end) as pts,
        -- "Accurate": exact / same-year matches whose video is on at most 3 days. One clip reused
        -- on many days says little about how well this particular day is covered.
        max(case when u.days > 3 then 0 when mc.match_level = 'exact' then 10 when mc.match_level = 'same_show_period' then 3 else 0 end) as acc
      from broadcast b
      left join media_candidate mc on mc.broadcast_id = b.id and mc.status = 'approved'
        and not exists (select 1 from blocked_video bv where bv.url = mc.url)
      left join (
        select mc2.url, count(distinct b2.tv_day_id) as days
        from media_candidate mc2 join broadcast b2 on b2.id = mc2.broadcast_id
        where mc2.status = 'approved' and not exists (select 1 from blocked_video bv where bv.url = mc2.url)
        group by mc2.url
      ) u on u.url = mc.url
      group by b.id, b.tv_day_id
    ) best
    join tv_day d on d.id = best.tv_day_id
    group by d.id, d.date
    order by d.date`);
  const byDate = new Map<string, Row>();
  // PGlite returns { rows }, postgres-js an array.
  const rows = (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
  for (const r of rows) {
    const date = String(r.date).slice(0, 10);
    const prev = byDate.get(date);
    if (!prev || r.broadcasts > prev.broadcasts)
      byDate.set(date, { date, broadcasts: Number(r.broadcasts), points: Number(r.points), accuratePoints: Number(r.accuratePoints), exact: Number(r.exact) });
  }
  return [...byDate.values()];
}

/** Like `listTvDayCoverage`, per channel and day: which days have a programme for a channel, and how well covered. */
export async function listChannelDayCoverage(
  db: Db,
): Promise<{ date: string; channel: string; broadcasts: number; points: number; exact: number; assumed: boolean }[]> {
  type Row = { date: string; channel: string; broadcasts: number; points: number; exact: number; assumed: boolean };
  const result: unknown = await db.execute(sql`
    select d.date as date, c.slug as channel, count(*)::int as broadcasts, coalesce(sum(best.pts), 0)::int as points,
      count(*) filter (where best.pts = 10)::int as exact, bool_and(d.completeness = 'series_only') as assumed
    from (
      select b.id, b.tv_day_id, b.channel_id,
        max(case mc.match_level when 'exact' then 10 when 'same_show_period' then 3 when 'same_show' then 1 else 0 end) as pts
      from broadcast b
      left join media_candidate mc on mc.broadcast_id = b.id and mc.status = 'approved'
        and not exists (select 1 from blocked_video bv where bv.url = mc.url)
      group by b.id, b.tv_day_id, b.channel_id
    ) best
    join tv_day d on d.id = best.tv_day_id
    join channel c on c.id = best.channel_id
    group by d.date, c.slug
    order by d.date`);
  const rows = (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
  return rows.map((r) => ({
    date: String(r.date).slice(0, 10),
    channel: r.channel,
    broadcasts: Number(r.broadcasts),
    points: Number(r.points),
    exact: Number(r.exact),
    assumed: Boolean(r.assumed),
  }));
}

/**
 * Loads a TV day in the same shape as `tvDayFromSeed`, or null if missing.
 * With several sources for one date, the most complete one wins.
 */
export async function loadTvDay(db: Db, date: string): Promise<TvDay | null> {
  const [day] = await db
    .select({ id: tvDay.id, completeness: tvDay.completeness, source: scheduleSource })
    .from(tvDay)
    .innerJoin(scheduleSource, eq(tvDay.sourceId, scheduleSource.id))
    .where(eq(tvDay.date, date))
    .orderBy(sql`case ${tvDay.completeness} when 'full' then 0 when 'partial' then 1 else 2 end`, asc(tvDay.id))
    .limit(1);
  if (!day) return null;

  // Names and numbers as they were on that day (tv_day_channel), identity from channel.
  const lineup = await db
    .select({ id: channel.id, slug: channel.slug, isPrivate: channel.isPrivate, name: tvDayChannel.name, displayNumber: tvDayChannel.displayNumber })
    .from(tvDayChannel)
    .innerJoin(channel, eq(tvDayChannel.channelId, channel.id))
    .where(eq(tvDayChannel.tvDayId, day.id))
    .orderBy(asc(tvDayChannel.displayNumber));
  const channels = new Map<number, Channel>(
    lineup.map((c) => [c.id, { id: c.slug, name: c.name, displayNumber: c.displayNumber, isPrivate: c.isPrivate }]),
  );

  const rows = await db
    .select({ b: broadcast, c: channel })
    .from(broadcast)
    .innerJoin(channel, eq(broadcast.channelId, channel.id))
    .innerJoin(tvDayChannel, and(eq(tvDayChannel.tvDayId, broadcast.tvDayId), eq(tvDayChannel.channelId, channel.id)))
    .where(eq(broadcast.tvDayId, day.id))
    .orderBy(asc(tvDayChannel.displayNumber), asc(broadcast.startMin));

  const broadcasts: Broadcast[] = rows.map(({ b, c }) => {
    return {
      id: `${c.slug}-${b.startMin}`,
      channelId: c.slug,
      startMin: b.startMin,
      endMin: b.endMin,
      title: b.title,
      description: b.description,
    };
  });

  const media = await loadMedia(db, rows.map(({ b }) => b));
  const adBreaks = await loadAdBreaks(db, [...channels.keys()], Number(date.slice(0, 4)));
  const interstitials = await loadInterstitials(db, [...channels.keys()]);

  return {
    date,
    completeness: day.completeness,
    source: { name: day.source.name, url: day.source.url ?? "", licenseStatus: day.source.licenseStatus },
    channels: [...channels.values()],
    broadcasts,
    media,
    adBreaks,
    interstitials,
  };
}

/**
 * Videos of the given stations from TV days within `windowDays` of `date`, for the "Lückenlos"
 * programme (core `seamlessDay`): approved, embeddable, with a known length; each video once, from
 * its date nearest to `date`; at most `perChannel` per station, nearest dates first.
 */
export async function listSeamlessPool(db: Db, date: string, channelSlugs: string[], windowDays = 5 * 366, perChannel = 250): Promise<PoolVideo[]> {
  if (!channelSlugs.length) return [];
  type Row = {
    slug: string; date: string; title: string; start_min: number; url: string; provider: MediaCandidate["provider"];
    provider_video_id: string | null; duration_s: number; match_level: MediaCandidate["matchLevel"]; notes: string | null; title_v: string | null;
  };
  const result: unknown = await db.execute(sql`
    select * from (
      select distinct on (mc.url) c.slug, d.date::text as date, b.title, b.start_min, mc.url, mc.provider, mc.provider_video_id,
        mc.duration_s, mc.match_level, mc.notes, mc.title as title_v, abs(d.date - ${date}::date) as dist
      from media_candidate mc
      join broadcast b on b.id = mc.broadcast_id
      join tv_day d on d.id = b.tv_day_id
      join channel c on c.id = b.channel_id
      where mc.status = 'approved' and mc.embeddable and mc.confidence >= 1
        and mc.duration_s between ${SEAMLESS_MIN_MIN * 60} and ${SEAMLESS_MAX_MIN * 60 + 59}
        and c.slug in (${sql.join(channelSlugs.map((s) => sql`${s}`), sql`, `)})
        and d.date between ${date}::date - ${windowDays}::int and ${date}::date + ${windowDays}::int
        and not exists (select 1 from blocked_video bv where bv.url = mc.url)
      order by mc.url, abs(d.date - ${date}::date), b.start_min
    ) v
    order by v.dist, v.url`);
  // PGlite returns { rows }, postgres-js an array.
  const rows = (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
  const perStation = new Map<string, number>();
  return rows.flatMap((r) => {
    const n = perStation.get(r.slug) ?? 0;
    if (n >= perChannel) return [];
    perStation.set(r.slug, n + 1);
    return [{
      channelId: r.slug,
      date: String(r.date).slice(0, 10),
      title: r.title,
      startMin: Number(r.start_min),
      media: {
        provider: r.provider,
        url: r.url,
        providerVideoId: r.provider_video_id,
        embeddable: true,
        durationS: Number(r.duration_s),
        matchLevel: r.match_level,
        note: r.notes ?? r.title_v ?? "",
        alt: null,
      },
    }];
  });
}

/**
 * For each (date, channel): the start minute of that day's show with the best playable video
 * (approved, embeddable, not blocked; exact before same year before similar, then the earliest).
 * Pairs without such a show are missing from the result ("<date>|<channel>" → start minute).
 */
export async function bestVideoStarts(
  db: Db,
  pairs: readonly { date: string; channel: string }[],
  excludeProviders: readonly string[] = [],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!pairs.length) return out;
  type Row = { date: string; slug: string; start_min: number };
  const result: unknown = await db.execute(sql`
    select distinct on (d.date, c.slug) d.date::text as date, c.slug, b.start_min
    from broadcast b
    join tv_day d on d.id = b.tv_day_id
    join channel c on c.id = b.channel_id
    join media_candidate mc on mc.broadcast_id = b.id and mc.status = 'approved' and mc.embeddable
    where (d.date::text, c.slug) in (${sql.join(pairs.map((p) => sql`(${p.date}, ${p.channel})`), sql`, `)})
      and not exists (select 1 from blocked_video bv where bv.url = mc.url)
      ${excludeProviders.length ? sql`and mc.provider::text not in (${sql.join(excludeProviders.map((x) => sql`${x}`), sql`, `)})` : sql``}
    order by d.date, c.slug, case mc.match_level when 'exact' then 0 when 'same_show_period' then 1 else 2 end, b.start_min`);
  // PGlite returns { rows }, postgres-js an array.
  const rows = (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
  for (const r of rows) out.set(`${String(r.date).slice(0, 10)}|${r.slug}`, Number(r.start_min));
  return out;
}

/**
 * Idents, announcers, sign-off etc. for the day's channels, plus pool items without a channel
 * (e.g. single ad spots). Channel ad breaks come via loadAdBreaks; the choice per date is made
 * in core (pickInterstitial).
 */
async function loadInterstitials(db: Db, channelIds: number[]): Promise<Interstitial[]> {
  const rows = await db
    .select({ i: interstitial, slug: channel.slug })
    .from(interstitial)
    .leftJoin(channel, eq(interstitial.channelId, channel.id))
    .where(
      and(
        eq(interstitial.status, "approved"),
        notBlocked(interstitial.url),
        or(
          isNull(interstitial.channelId),
          and(channelIds.length ? inArray(interstitial.channelId, channelIds) : sql`false`, ne(interstitial.kind, "ad_break")),
        ),
      ),
    );
  return rows.map(({ i, slug }) => ({
    id: i.id,
    channelId: slug ?? null,
    kind: i.kind,
    url: i.url,
    provider: providerOf(i.url),
    providerVideoId: i.providerVideoId,
    inS: i.inS,
    outS: i.outS,
    durationS: i.durationS,
    airedOn: i.airedOn,
    airedPeriod: i.airedPeriod,
    validFrom: i.validFrom,
    validTo: i.validTo,
    rank: i.rank,
    note: i.notes ?? "",
  }));
}

type BroadcastRow = typeof broadcast.$inferSelect;

/** Best approved candidate per broadcast (by confidence); the runner-up becomes the alt link. */
async function loadMedia(db: Db, rows: BroadcastRow[]): Promise<Record<string, MediaCandidate>> {
  const programmeIds = [...new Set(rows.flatMap((b) => (b.programmeId ? [b.programmeId] : [])))];
  const broadcastIds = rows.map((b) => b.id);
  if (!broadcastIds.length) return {};
  const candidates = await db
    .select()
    .from(mediaCandidate)
    .where(
      and(
        eq(mediaCandidate.status, "approved"),
        notBlocked(mediaCandidate.url),
        or(
          inArray(mediaCandidate.broadcastId, broadcastIds),
          programmeIds.length ? inArray(mediaCandidate.programmeId, programmeIds) : sql`false`,
        ),
      ),
    )
    .orderBy(desc(mediaCandidate.confidence), asc(mediaCandidate.id));

  const slugOf = new Map((await db.select({ id: channel.id, slug: channel.slug }).from(channel)).map((c) => [c.id, c.slug]));
  const media: Record<string, MediaCandidate> = {};
  for (const b of rows) {
    // Broadcast-specific candidates outrank programme-wide ones.
    const own = candidates.filter((c) => c.broadcastId === b.id);
    const shared = candidates.filter((c) => c.broadcastId === null && c.programmeId !== null && c.programmeId === b.programmeId);
    const [best, alt] = [...own, ...shared];
    if (!best) continue;
    media[`${slugOf.get(b.channelId)}-${b.startMin}`] = {
      provider: best.provider,
      url: best.url,
      providerVideoId: best.providerVideoId,
      embeddable: best.embeddable,
      durationS: best.durationS,
      matchLevel: best.matchLevel,
      note: best.notes ?? best.title ?? "",
      alt: alt ? { url: alt.url, label: alt.title ?? "Alternative" } : null,
    };
  }
  return media;
}

/**
 * One ad break per channel from the period closest to `year` (by aired_period,
 * e.g. "1991-Q1"): the best-ranked recording, others as alternatives.
 */
async function loadAdBreaks(db: Db, channelIds: number[], year: number): Promise<AdBreak[]> {
  if (!channelIds.length) return [];
  const rows = await db
    .select({ a: interstitial, slug: channel.slug })
    .from(interstitial)
    .innerJoin(channel, eq(interstitial.channelId, channel.id))
    .where(
      and(
        inArray(interstitial.channelId, channelIds),
        eq(interstitial.kind, "ad_break"),
        eq(interstitial.status, "approved"),
        notBlocked(interstitial.url),
      ),
    )
    .orderBy(asc(interstitial.id));
  const byChannel = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) byChannel.set(r.slug, [...(byChannel.get(r.slug) ?? []), r]);
  const distance = (r: (typeof rows)[number]) => {
    const y = Number(r.a.airedPeriod?.slice(0, 4));
    return Number.isFinite(y) && y > 0 ? Math.abs(y - year) : 100;
  };
  return [...byChannel.entries()].map(([slug, all]) => {
    const nearest = Math.min(...all.map(distance));
    const list = all.filter((r) => distance(r) === nearest);
    const [first, ...rest] = [...list].sort((x, y) => x.a.rank - y.a.rank || x.a.id - y.a.id);
    return {
      channelId: slug,
      provider: providerOf(first!.a.url),
      url: first!.a.url,
      providerVideoId: first!.a.providerVideoId,
      note: first!.a.notes ?? "",
      alternatives: rest.map((r) => r.a.url),
    };
  });
}

/** All TV days with their source (for the info page's credits). */
export async function listDaySources(
  db: Db,
): Promise<{ date: string; completeness: string; sourceName: string; sourceUrl: string | null; licenseStatus: string }[]> {
  return db
    .select({
      date: tvDay.date,
      completeness: tvDay.completeness,
      sourceName: scheduleSource.name,
      sourceUrl: scheduleSource.url,
      licenseStatus: scheduleSource.licenseStatus,
    })
    .from(tvDay)
    .innerJoin(scheduleSource, eq(tvDay.sourceId, scheduleSource.id))
    .orderBy(asc(tvDay.date));
}
