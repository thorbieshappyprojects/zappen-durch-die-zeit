/** Chronik (core events.ts): the recordings around an event, and moderators taking unrelated ones out. */
import type { MediaCandidate, PoolVideo } from "@zdz/core";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { eventExclusion, mediaReport } from "./schema";

/**
 * Exact recordings that aired between two dates (inclusive), every station, each video once.
 * Core `eventVideos` picks the reporting ones for an event.
 */
export async function listEventPool(db: Db, from: string, to: string): Promise<PoolVideo[]> {
  type Row = {
    slug: string;
    date: string;
    title: string;
    start_min: number;
    url: string;
    provider: MediaCandidate["provider"];
    provider_video_id: string | null;
    duration_s: number | null;
    notes: string | null;
    title_v: string | null;
  };
  const result: unknown = await db.execute(sql`
    select distinct on (mc.url) c.slug, d.date::text as date, b.title, b.start_min, mc.url, mc.provider, mc.provider_video_id,
      mc.duration_s, mc.notes, mc.title as title_v
    from media_candidate mc
    join broadcast b on b.id = mc.broadcast_id
    join tv_day d on d.id = b.tv_day_id
    join channel c on c.id = b.channel_id
    where mc.status = 'approved' and mc.embeddable and mc.match_level = 'exact'
      and d.date between ${from}::date and ${to}::date
      and not exists (select 1 from blocked_video bv where bv.url = mc.url)
    order by mc.url, d.date, b.start_min`);
  // PGlite returns { rows }, postgres-js an array.
  const rows = (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
  return rows.map((r) => ({
    channelId: r.slug,
    date: String(r.date).slice(0, 10),
    title: r.title,
    startMin: Number(r.start_min),
    media: {
      provider: r.provider,
      url: r.url,
      providerVideoId: r.provider_video_id,
      embeddable: true,
      durationS: r.duration_s === null ? null : Number(r.duration_s),
      matchLevel: "exact",
      note: r.notes ?? r.title_v ?? "",
      alt: null,
    },
  }));
}

/** URLs a moderator took out of an event. */
export async function listEventExclusions(db: Db, eventId: string): Promise<Set<string>> {
  const rows = await db.select({ url: eventExclusion.url }).from(eventExclusion).where(eq(eventExclusion.eventId, eventId));
  return new Set(rows.map((r) => r.url));
}

/** Takes a video out of one event and closes the open "off_topic" reports for it there. */
export async function excludeFromEvent(db: Db, eventId: string, url: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(eventExclusion).values({ eventId, url }).onConflictDoNothing();
    await tx
      .update(mediaReport)
      .set({ handledAt: new Date(), handledAction: "excluded" })
      .where(
        and(eq(mediaReport.url, url), eq(mediaReport.eventId, eventId), eq(mediaReport.reason, "off_topic"), isNull(mediaReport.handledAt)),
      );
  });
}

/** Puts a video back into an event. */
export async function includeInEvent(db: Db, eventId: string, url: string): Promise<boolean> {
  const rows = await db
    .delete(eventExclusion)
    .where(and(eq(eventExclusion.eventId, eventId), eq(eventExclusion.url, url)))
    .returning({ url: eventExclusion.url });
  return rows.length > 0;
}
