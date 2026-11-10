import { isEmbeddable, parseHHMM, providerOf, RETENTION_DAYS, videoIdOf, type ContributionInput } from "@zdz/core";
import { and, count, desc, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "./client";
import { broadcast, channel, contribution, contributionFile, mediaCandidate, mediaReport, tvDay } from "./schema";
import { removeUploadFiles } from "./upload-files";

/**
 * A Date as a parameter inside a raw `sql` expression. Without a column to map it, postgres-js would
 * send Date.toString() ("Wed Aug 12 2026 … (Coordinated Universal Time)"), which PostgreSQL rejects
 * (PGlite accepts it, so only production failed).
 */
const timestamp = (d: Date) => sql`${d.toISOString()}::timestamptz`;

export type ContributionRow = typeof contribution.$inferSelect;

/** Stores a submission. Spam-flagged ones are kept (status "spam") so the moderator can audit the filter. */
export async function createContribution(
  db: Db,
  input: ContributionInput,
  meta: { ipHash: string; spamReasons: string[] },
): Promise<ContributionRow> {
  const [row] = await db
    .insert(contribution)
    .values({
      kind: input.kind,
      status: meta.spamReasons.length ? "spam" : "pending",
      tvDate: input.tvDate ?? null,
      channel: input.channel ?? null,
      broadcastStart: input.start ?? null,
      broadcastTitle: input.title ?? null,
      url: input.url ?? null,
      body: input.body ?? null,
      sourceInfo: input.sourceInfo ?? null,
      contributorName: input.contributorName ?? null,
      contributorEmail: input.contributorEmail ?? null,
      ipHash: meta.ipHash,
      spamReasons: meta.spamReasons.length ? meta.spamReasons : null,
      suggestedKind: input.suggestedKind ?? null,
    })
    .returning();
  return row!;
}

/** Number of submissions from this IP hash since `since` (for rate limiting). */
export async function countRecentContributions(db: Db, ipHash: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(contribution)
    .where(and(eq(contribution.ipHash, ipHash), gte(contribution.createdAt, since)));
  return row?.n ?? 0;
}

export async function listContributions(db: Db, status?: ContributionRow["status"], limit = 200, offset = 0): Promise<ContributionRow[]> {
  const q = db.select().from(contribution);
  return (status ? q.where(eq(contribution.status, status)) : q).orderBy(desc(contribution.createdAt)).limit(limit).offset(offset);
}

/** Number of contributions per status (admin tabs and paging). */
export async function countContributionsByStatus(db: Db): Promise<Record<ContributionRow["status"], number>> {
  const rows = await db.select({ status: contribution.status, n: count() }).from(contribution).groupBy(contribution.status);
  const out: Record<ContributionRow["status"], number> = { pending: 0, approved: 0, rejected: 0, spam: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

export async function setContributionStatus(
  db: Db,
  id: number,
  status: ContributionRow["status"],
  reviewNote?: string,
): Promise<void> {
  await db
    .update(contribution)
    .set({ status, reviewedAt: new Date(), reviewNote: reviewNote ?? null })
    .where(eq(contribution.id, id));
}

/**
 * Approves a video-link contribution: finds the broadcast (date + channel slug + start time)
 * and attaches the link as an approved media candidate for it. Returns an error text if the
 * broadcast cannot be found.
 */
export async function approveVideoContribution(
  db: Db,
  id: number,
  matchLevel: "exact" | "same_show_period" | "same_show",
  /** Broadcast reference filled in by the moderator (free-form submissions often lack it). */
  overrides: { tvDate?: string; channel?: string; start?: string; url?: string } = {},
): Promise<{ ok: true; mediaCandidateId: number } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const [stored] = await tx.select().from(contribution).where(eq(contribution.id, id));
    const c = stored && {
      ...stored,
      tvDate: overrides.tvDate || stored.tvDate,
      channel: overrides.channel || stored.channel,
      broadcastStart: overrides.start || stored.broadcastStart,
      url: overrides.url || stored.url,
    };
    if (!c || !c.url || !c.tvDate || !c.channel || !c.broadcastStart)
      return { ok: false as const, error: "Für die Freigabe fehlen Link, Datum, Sender oder Anfangszeit." };
    let start: number;
    try {
      start = parseHHMM(c.broadcastStart);
    } catch {
      return { ok: false as const, error: `Ungültige Anfangszeit: ${c.broadcastStart}` };
    }
    const candidates = await tx
      .select({ id: broadcast.id, startMin: broadcast.startMin })
      .from(broadcast)
      .innerJoin(tvDay, eq(broadcast.tvDayId, tvDay.id))
      .innerJoin(channel, eq(broadcast.channelId, channel.id))
      .where(and(eq(tvDay.date, c.tvDate), eq(channel.slug, c.channel)));
    // Times after midnight are stored as ≥ 1440 within the TV day.
    const target = candidates.find((b) => b.startMin % 1440 === start % 1440);
    if (!target) return { ok: false as const, error: `Keine Sendung ${c.channel} ${c.tvDate} ${c.broadcastStart} gefunden.` };
    const [mc] = await tx
      .insert(mediaCandidate)
      .values({
        broadcastId: target.id,
        provider: providerOf(c.url),
        url: c.url,
        providerVideoId: videoIdOf(c.url),
        embeddable: isEmbeddable(c.url),
        matchLevel,
        // Above curated seed matches (1), so an approved community link wins.
        confidence: 1.5,
        status: "approved",
        foundBy: "community",
        verifiedAt: new Date(),
        notes: c.contributorName ? `Vorschlag von ${c.contributorName}` : "Vorschlag aus der Community",
      })
      .returning({ id: mediaCandidate.id });
    await tx
      .update(contribution)
      .set({
        kind: "video_link",
        status: "approved",
        reviewedAt: new Date(),
        mediaCandidateId: mc!.id,
        tvDate: c.tvDate,
        channel: c.channel,
        broadcastStart: c.broadcastStart,
        url: c.url,
      })
      .where(eq(contribution.id, id));
    return { ok: true as const, mediaCandidateId: mc!.id };
  });
}

export type ContributionFileRow = typeof contributionFile.$inferSelect;

export async function addContributionFile(
  db: Db,
  file: Omit<ContributionFileRow, "id" | "createdAt">,
): Promise<ContributionFileRow> {
  const [row] = await db.insert(contributionFile).values(file).returning();
  return row!;
}

/** Deletes a contribution with its attachments (rows and files). False if it didn't exist. */
export async function deleteContribution(db: Db, id: number): Promise<boolean> {
  const files = await db.select({ key: contributionFile.storageKey }).from(contributionFile).where(eq(contributionFile.contributionId, id));
  const deleted = await db.delete(contribution).where(eq(contribution.id, id)).returning({ id: contribution.id });
  await removeUploadFiles(files.map((f) => f.key));
  return deleted.length > 0;
}

/**
 * Retention (core RETENTION_DAYS): spam and rejected submissions are deleted with their files, the
 * e-mail address is cleared after review, handled video reports are deleted.
 */
export async function purgeContributions(
  db: Db,
  now = new Date(),
): Promise<{ spam: number; rejected: number; emails: number; reports: number }> {
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const reviewed = sql`coalesce(${contribution.reviewedAt}, ${contribution.createdAt})`;
  const doomed = await db
    .select({ id: contribution.id, status: contribution.status })
    .from(contribution)
    .where(
      or(
        and(eq(contribution.status, "spam"), lt(contribution.createdAt, ago(RETENTION_DAYS.spam))),
        and(eq(contribution.status, "rejected"), lt(reviewed, timestamp(ago(RETENTION_DAYS.rejected)))),
      ),
    );
  for (const c of doomed) await deleteContribution(db, c.id);
  const emails = await db
    .update(contribution)
    .set({ contributorEmail: null })
    .where(
      and(
        inArray(contribution.status, ["approved", "rejected"]),
        isNotNull(contribution.contributorEmail),
        lt(reviewed, timestamp(ago(RETENTION_DAYS.email))),
      ),
    )
    .returning({ id: contribution.id });
  const reports = await db
    .delete(mediaReport)
    .where(and(isNotNull(mediaReport.handledAt), lt(mediaReport.handledAt, ago(RETENTION_DAYS.reports))))
    .returning({ id: mediaReport.id });
  return {
    spam: doomed.filter((c) => c.status === "spam").length,
    rejected: doomed.filter((c) => c.status === "rejected").length,
    emails: emails.length,
    reports: reports.length,
  };
}

/** Bytes of stored attachments: all of them, and those added since `since` (global upload quota). */
export async function uploadedBytes(db: Db, since: Date): Promise<{ total: number; recent: number }> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${contributionFile.sizeBytes}), 0)::bigint`,
      recent: sql<number>`coalesce(sum(${contributionFile.sizeBytes}) filter (where ${contributionFile.createdAt} >= ${timestamp(since)}), 0)::bigint`,
    })
    .from(contributionFile);
  return { total: Number(row?.total ?? 0), recent: Number(row?.recent ?? 0) };
}

export async function listContributionFiles(db: Db, contributionIds: number[]): Promise<ContributionFileRow[]> {
  if (!contributionIds.length) return [];
  return db.select().from(contributionFile).where(inArray(contributionFile.contributionId, contributionIds));
}

export async function getContributionFile(db: Db, id: number): Promise<ContributionFileRow | null> {
  const [row] = await db.select().from(contributionFile).where(eq(contributionFile.id, id));
  return row ?? null;
}
