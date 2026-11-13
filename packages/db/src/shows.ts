/** Shows (all broadcasts with one normalised title) for the search and /sendung/<slug> (core shows.ts). */
import { normalizeTitle, rankShowHits, SHOW_SEARCH_MIN_CHARS, type MatchLevel, type ShowAiring, type ShowHit } from "@zdz/core";
import { sql } from "drizzle-orm";
import type { Db } from "./client";

const LEVELS: MatchLevel[] = ["exact", "same_show_period", "same_show", "none"];

/** Best approved, unblocked video per broadcast as a rank (0 exact … 3 none) – a lateral subquery on `b`. */
const bestLevel = sql`left join lateral (
    select min(case mc.match_level when 'exact' then 0 when 'same_show_period' then 1 else 2 end) as lvl,
      (array_agg(mc.provider::text order by case mc.match_level when 'exact' then 0 when 'same_show_period' then 1 else 2 end, mc.confidence desc, mc.id))[1] as provider
    from media_candidate mc
    where mc.broadcast_id = b.id and mc.status = 'approved' and not exists (select 1 from blocked_video bv where bv.url = mc.url)
  ) m on true`;

function rowsOf<T>(result: unknown): T[] {
  // PGlite returns { rows }, postgres-js an array.
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

/**
 * Shows whose normalised title contains the query, on real days only, best first (core
 * `rankShowHits`). Each hit names the airing a click opens: best video, then nearest to `near`.
 */
export async function searchShows(db: Db, query: string, limit = 8, near?: string): Promise<ShowHit[]> {
  const q = normalizeTitle(query);
  if (q.length < SHOW_SEARCH_MIN_CHARS) return [];
  // Normalised titles hold only letters, digits and spaces: no LIKE wildcards to escape.
  type Row = {
    key: string;
    title: string;
    airings: number;
    with_video: number;
    exact: number;
    first: string;
    last: string;
    channels: string[];
  };
  const rows = rowsOf<Row>(
    await db.execute(sql`
      select b.normalized_title as key, mode() within group (order by b.title) as title, count(*)::int as airings,
        count(*) filter (where m.lvl is not null)::int as with_video, count(*) filter (where m.lvl = 0)::int as exact,
        min(d.date)::text as first, max(d.date)::text as last, array_agg(distinct c.slug) as channels
      from broadcast b
      join tv_day d on d.id = b.tv_day_id and d.completeness <> 'series_only'
      join channel c on c.id = b.channel_id
      ${bestLevel}
      where b.normalized_title like ${`%${q}%`}
      group by b.normalized_title
      order by count(*) filter (where m.lvl is not null) desc, count(*) desc
      limit 300`),
  );
  const top = rankShowHits(
    rows.map((r) => ({ ...r, withVideo: Number(r.with_video) })),
    q,
  ).slice(0, limit);
  if (!top.length) return [];
  type Open = { key: string; date: string; slug: string; start_min: number };
  const opens = rowsOf<Open>(
    await db.execute(sql`
      select distinct on (b.normalized_title) b.normalized_title as key, d.date::text as date, c.slug, b.start_min
      from broadcast b
      join tv_day d on d.id = b.tv_day_id and d.completeness <> 'series_only'
      join channel c on c.id = b.channel_id
      ${bestLevel}
      where b.normalized_title in (${sql.join(
        top.map((t) => sql`${t.key}`),
        sql`, `,
      )})
      order by b.normalized_title, coalesce(m.lvl, 3), ${near ? sql`abs(d.date - ${near}::date),` : sql``} d.date, b.start_min`),
  );
  const openOf = new Map(opens.map((o) => [o.key, o]));
  return top.flatMap((r) => {
    const o = openOf.get(r.key);
    if (!o) return [];
    return [
      {
        key: r.key,
        title: r.title,
        airings: Number(r.airings),
        withVideo: r.withVideo,
        exact: Number(r.exact),
        firstDate: String(r.first).slice(0, 10),
        lastDate: String(r.last).slice(0, 10),
        channels: r.channels,
        open: { date: String(o.date).slice(0, 10), channelId: o.slug, startMin: Number(o.start_min) },
      },
    ];
  });
}

/** Every airing of a show on real days, in order, with its best video; plus how often it sits in assumed programmes. */
export async function loadShow(db: Db, key: string): Promise<{ airings: Omit<ShowAiring, "channelName">[]; assumed: number }> {
  type Row = {
    date: string;
    slug: string;
    start_min: number;
    title: string;
    description: string | null;
    lvl: number | null;
    provider: string | null;
    assumed: boolean;
  };
  const rows = rowsOf<Row>(
    await db.execute(sql`
      select d.date::text as date, c.slug, b.start_min, b.title, b.description, m.lvl, m.provider, d.completeness = 'series_only' as assumed
      from broadcast b
      join tv_day d on d.id = b.tv_day_id
      join channel c on c.id = b.channel_id
      ${bestLevel}
      where b.normalized_title = ${key}
      order by d.date, b.start_min, c.slug`),
  );
  const airings = rows
    .filter((r) => !r.assumed)
    .map((r) => ({
      date: String(r.date).slice(0, 10),
      channelId: r.slug,
      startMin: Number(r.start_min),
      title: r.title,
      description: r.description,
      matchLevel: LEVELS[r.lvl ?? 3]!,
      provider: r.provider,
    }));
  return { airings, assumed: rows.length - airings.length };
}
