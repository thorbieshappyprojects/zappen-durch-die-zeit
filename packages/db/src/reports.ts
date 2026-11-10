import { and, count, desc, eq, gte, isNull, sql, type AnyColumn } from "drizzle-orm";
import type { Db } from "./client";
import { blockedVideo, mediaReport } from "./schema";

export type MediaReportRow = typeof mediaReport.$inferSelect;
export type MediaReportReason = MediaReportRow["reason"];

/** Unavailable reports within this window that trigger a health check (doc F6: ≥ 3 in 7 days). */
export const AUTO_BLOCK_REPORTS = 3;
export const AUTO_BLOCK_DAYS = 7;

export async function createMediaReport(
  db: Db,
  input: Omit<typeof mediaReport.$inferInsert, "id" | "createdAt" | "handledAt" | "handledAction">,
): Promise<MediaReportRow> {
  const [row] = await db.insert(mediaReport).values(input).returning();
  return row!;
}

export async function countRecentReportsByIp(db: Db, ipHash: string, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(mediaReport)
    .where(and(eq(mediaReport.ipHash, ipHash), gte(mediaReport.createdAt, since)));
  return r!.n;
}

/** Open "unavailable" reports for a video since a date (input for automatic blocking). */
export async function countUnavailableReports(db: Db, url: string, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(mediaReport)
    .where(and(eq(mediaReport.url, url), eq(mediaReport.reason, "unavailable"), gte(mediaReport.createdAt, since), isNull(mediaReport.handledAt)));
  return r!.n;
}

/** Takes a video out of the TV (survives re-imports). */
export async function blockVideo(db: Db, url: string, reason: string): Promise<void> {
  await db.insert(blockedVideo).values({ url, reason }).onConflictDoUpdate({ target: blockedVideo.url, set: { reason } });
}

/** Blocked videos, newest first, for the admin list (with "Entsperren"). */
export async function listBlockedVideos(db: Db): Promise<{ url: string; reason: string; createdAt: Date }[]> {
  return db.select().from(blockedVideo).orderBy(desc(blockedVideo.createdAt));
}

/** Takes a block back; the video shows again (after the coverage cache is cleared). */
export async function unblockVideo(db: Db, url: string): Promise<boolean> {
  return (await db.delete(blockedVideo).where(eq(blockedVideo.url, url)).returning({ url: blockedVideo.url })).length > 0;
}

export async function listBlockedUrls(db: Db): Promise<Set<string>> {
  return new Set((await db.select({ url: blockedVideo.url }).from(blockedVideo)).map((r) => r.url));
}

export interface ReportGroup {
  url: string;
  reports: number;
  automatic: number;
  reasons: Record<string, number>;
  /** Open "off_topic" reports per Chronik event id. */
  events: Record<string, number>;
  latest: MediaReportRow;
  notes: string[];
  blocked: boolean;
}

/** Open reports grouped per video, most reported first (admin view). */
export async function listOpenReportGroups(db: Db): Promise<ReportGroup[]> {
  const rows = await db.select().from(mediaReport).where(isNull(mediaReport.handledAt)).orderBy(desc(mediaReport.createdAt));
  const blocked = await listBlockedUrls(db);
  const groups = new Map<string, ReportGroup>();
  for (const r of rows) {
    const g = groups.get(r.url) ?? { url: r.url, reports: 0, automatic: 0, reasons: {}, events: {}, latest: r, notes: [], blocked: blocked.has(r.url) };
    g.reports++;
    if (r.automatic) g.automatic++;
    g.reasons[r.reason] = (g.reasons[r.reason] ?? 0) + 1;
    if (r.reason === "off_topic" && r.eventId) g.events[r.eventId] = (g.events[r.eventId] ?? 0) + 1;
    if (r.note) g.notes.push(r.note);
    groups.set(r.url, g);
  }
  return [...groups.values()].sort((a, b) => b.reports - a.reports);
}

/**
 * Moderator decision for all open reports of a video: "dead" blocks it, "ignored" closes the
 * reports, "review" keeps them open but marks them as seen.
 */
export async function handleReports(db: Db, url: string, action: "dead" | "ignored" | "review"): Promise<void> {
  await db.transaction(async (tx) => {
    if (action === "dead") await tx.insert(blockedVideo).values({ url, reason: "moderator" }).onConflictDoNothing();
    await tx
      .update(mediaReport)
      .set({ handledAction: action, ...(action === "review" ? {} : { handledAt: new Date() }) })
      .where(and(eq(mediaReport.url, url), isNull(mediaReport.handledAt)));
  });
}

/** SQL fragment: true when a URL column is not blocked. */
export const notBlocked = (urlColumn: AnyColumn) => sql`not exists (select 1 from blocked_video bv where bv.url = ${urlColumn})`;

/**
 * True if we link this URL ourselves (an approved video or interstitial). Reports for any other
 * URL are dropped, so the moderation list and the health check only ever see our own links.
 */
export async function isKnownVideoUrl(db: Db, url: string): Promise<boolean> {
  const result: unknown = await db.execute(sql`
    select exists (select 1 from media_candidate where url = ${url} and status = 'approved')
        or exists (select 1 from interstitial where url = ${url} and status = 'approved') as known`);
  const rows = (Array.isArray(result) ? result : (result as { rows: { known: boolean }[] }).rows) as { known: boolean }[];
  return Boolean(rows[0]?.known);
}
