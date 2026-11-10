import {
  broadcastFlags,
  normalizeTitle,
  providerOf,
  tvDayMinToInstant,
  isEmbeddable,
  videoIdOf,
  withoutEmailAddresses,
  type LicenseStatus,
  type MatchLevel,
  type SeedFile,
  licenseStatusOf,
  SEED_LEVELS,
  formatClock,
  pickCuratedMatch,
  tvDayFromSeed,
} from "@zdz/core";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { broadcast, channel, contribution, interstitial, mediaCandidate, programme, scheduleSource, tvDay, tvDayChannel } from "./schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type CandidateRow = typeof mediaCandidate.$inferSelect;
/** A community video of a day about to be replaced, with the slot it belongs to. */
interface SavedCommunityVideo {
  candidate: CandidateRow;
  channelSlug: string;
  startMin: number;
  contributionIds: number[];
}

/**
 * Community videos (approved from visitor contributions) hang on broadcasts, which a re-import deletes.
 * Collect them before the delete so they can be attached again.
 */
async function saveCommunityVideos(tx: Tx, tvDayIds: number[]): Promise<SavedCommunityVideo[]> {
  if (!tvDayIds.length) return [];
  const rows = await tx
    .select({ candidate: mediaCandidate, channelSlug: channel.slug, startMin: broadcast.startMin })
    .from(mediaCandidate)
    .innerJoin(broadcast, eq(mediaCandidate.broadcastId, broadcast.id))
    .innerJoin(channel, eq(broadcast.channelId, channel.id))
    .where(and(inArray(broadcast.tvDayId, tvDayIds), eq(mediaCandidate.foundBy, "community")));
  if (!rows.length) return [];
  const links = await tx
    .select({ id: contribution.id, mediaCandidateId: contribution.mediaCandidateId })
    .from(contribution)
    .where(inArray(contribution.mediaCandidateId, rows.map((r) => r.candidate.id)));
  return rows.map((r) => ({ ...r, contributionIds: links.filter((l) => l.mediaCandidateId === r.candidate.id).map((l) => l.id) }));
}

/** Note on a contribution whose broadcast is gone: back to the moderation queue. */
const ORPHANED_NOTE = "Beim Neuimport des Tages gab es diese Sendung (Sender und Anfangszeit) nicht mehr – bitte neu zuordnen.";

/**
 * Attaches saved community videos to the broadcast with the same channel and start; the contribution
 * points to the new row. Without such a broadcast the contribution goes back to „pending“ with a note.
 */
async function restoreCommunityVideos(
  tx: Tx,
  saved: SavedCommunityVideo[],
  broadcasts: { id: number; channelSlug: string; startMin: number }[],
): Promise<{ restored: number; orphaned: number }> {
  let restored = 0;
  let orphaned = 0;
  for (const s of saved) {
    const target = broadcasts.find((b) => b.channelSlug === s.channelSlug && b.startMin === s.startMin);
    if (!target) {
      orphaned++;
      if (s.contributionIds.length)
        await tx
          .update(contribution)
          .set({ status: "pending", mediaCandidateId: null, reviewNote: ORPHANED_NOTE })
          .where(inArray(contribution.id, s.contributionIds));
      continue;
    }
    const { id: _old, broadcastId: _b, programmeId: _p, ...rest } = s.candidate;
    const [row] = await tx.insert(mediaCandidate).values({ ...rest, broadcastId: target.id }).returning({ id: mediaCandidate.id });
    if (s.contributionIds.length)
      await tx.update(contribution).set({ mediaCandidateId: row!.id }).where(inArray(contribution.id, s.contributionIds));
    restored++;
  }
  return { restored, orphaned };
}

/** Normalized output of a schedule adapter (one TV day from one source). */
export interface ImportedDay {
  date: string;
  completeness: "full" | "partial" | "series_only";
  source: { name: string; url: string | null; licenseStatus: LicenseStatus };
  channels: { slug: string; name: string; displayNumber: number; isPrivate: boolean }[];
  broadcasts: {
    channel: string;
    startMin: number;
    endMin: number;
    title: string;
    subtitle?: string | null;
    description: string | null;
    raw?: unknown;
  }[];
  curatedMedia?: CuratedMatch[];
  /** `airedPeriod` (e.g. "1991" or "1991-Q1") picks the break closest to a day; defaults to the day's year. */
  adBreaks?: { channel: string; url: string; note: string; alternatives: string[]; airedPeriod?: string }[];
}

/** Hand-curated match (seed files only): by exact title, optionally restricted to a channel/start time. */
export interface CuratedMatch {
  matchTitle: string;
  channel?: string;
  start?: string;
  matchLevel: Exclude<MatchLevel, "none">;
  url: string;
  note: string;
  alt: { url: string; label: string } | null;
    durationS?: number | null;
}

/**
 * `local`: curated files already in the repo. `remote`: fetches from a third-party
 * site; only allowed once permission is recorded in schedule_source.license_status.
 */
export type ImportKind = "local" | "remote";

const PERMITTED: LicenseStatus[] = ["granted", "not_required"];

export class ImportNotPermittedError extends Error {
  constructor(sourceName: string, status: LicenseStatus) {
    super(
      `Import from "${sourceName}" is not permitted (license_status = ${status}). ` +
        `Record the permission in schedule_source.license_status first (see CLAUDE.md).`,
    );
  }
}

/** Throws unless a remote source has a recorded permission. Call before fetching anything. */
export async function assertImportAllowed(db: Db, sourceName: string, kind: ImportKind): Promise<void> {
  if (kind === "local") return;
  const [row] = await db
    .select({ status: scheduleSource.licenseStatus })
    .from(scheduleSource)
    .where(eq(scheduleSource.name, sourceName));
  const status = row?.status ?? "unknown";
  if (!PERMITTED.includes(status)) throw new ImportNotPermittedError(sourceName, status);
}

export interface ImportStats {
  tvDayId: number;
  broadcasts: number;
  programmesLinked: number;
  mediaCandidates: number;
  adBreaks: number;
  /** Community videos attached again after the re-import. */
  communityVideos: number;
  /** Community videos whose broadcast is gone: their contributions are back in the queue. */
  communityOrphaned: number;
}

/**
 * Imports one TV day. Idempotent: re-importing replaces that day's broadcasts
 * for the source and upserts channels, programmes, candidates and ad breaks.
 * An existing source's license_status is never overwritten by import data.
 */
export async function importDay(db: Db, day: ImportedDay, kind: ImportKind): Promise<ImportStats> {
  await assertImportAllowed(db, day.source.name, kind);
  return db.transaction(async (tx) => {
    await tx
      .insert(scheduleSource)
      .values({ name: day.source.name, url: day.source.url, licenseStatus: day.source.licenseStatus })
      .onConflictDoNothing({ target: scheduleSource.name });
    const [source] = await tx.select().from(scheduleSource).where(eq(scheduleSource.name, day.source.name));

    // Channels are identified by slug; their name/number of the time lives in tv_day_channel.
    await tx.insert(channel).values(day.channels).onConflictDoNothing({ target: channel.slug });
    const channelRows = await tx
      .select({ id: channel.id, slug: channel.slug })
      .from(channel)
      .where(inArray(channel.slug, day.channels.map((c) => c.slug)));
    const channelId = new Map(channelRows.map((c) => [c.slug, c.id]));

    const oldDays = await tx
      .select({ id: tvDay.id })
      .from(tvDay)
      .where(and(eq(tvDay.date, day.date), eq(tvDay.sourceId, source!.id)));
    const community = await saveCommunityVideos(tx, oldDays.map((d) => d.id));
    await tx.delete(tvDay).where(and(eq(tvDay.date, day.date), eq(tvDay.sourceId, source!.id)));
    const [dayRow] = await tx
      .insert(tvDay)
      .values({ date: day.date, sourceId: source!.id, completeness: day.completeness })
      .returning({ id: tvDay.id });
    const tvDayId = dayRow!.id;
    await tx.insert(tvDayChannel).values(
      day.channels.map((c) => ({ tvDayId, channelId: channelId.get(c.slug)!, name: c.name, displayNumber: c.displayNumber })),
    );

    if (day.broadcasts.length) {
      await tx.insert(broadcast).values(
        day.broadcasts.map((b) => {
          const id = channelId.get(b.channel);
          if (id === undefined) throw new Error(`Broadcast on unknown channel ${b.channel}`);
          return {
            tvDayId,
            channelId: id,
            startMin: b.startMin,
            endMin: b.endMin,
            startsAt: tvDayMinToInstant(day.date, b.startMin),
            endsAt: tvDayMinToInstant(day.date, b.endMin),
            title: b.title,
            normalizedTitle: normalizeTitle(b.title),
            subtitle: b.subtitle ?? null,
            description: b.description,
            flags: { ...broadcastFlags(b.title, b.description) },
            raw: b.raw ?? null,
          };
        }),
      );
    }

    // Curated matches are judged against this day's broadcast (a 1991 clip is
    // "same period" for 1991, not for 1999), so they attach to the broadcasts.
    const slugOf = new Map([...channelId].map(([slug, id]) => [id, slug]));
    const dayBroadcasts = await tx
      .select({ id: broadcast.id, title: broadcast.title, channelId: broadcast.channelId, startMin: broadcast.startMin })
      .from(broadcast)
      .where(eq(broadcast.tvDayId, tvDayId));
    const broadcastsByMatch = new Map<CuratedMatch, number[]>();
    for (const b of dayBroadcasts) {
      const m = pickCuratedMatch(day.curatedMedia ?? [], {
        title: b.title,
        channel: slugOf.get(b.channelId)!,
        start: formatClock(b.startMin),
      });
      if (m) broadcastsByMatch.set(m, [...(broadcastsByMatch.get(m) ?? []), b.id]);
    }

    let mediaCandidates = 0;
    for (const [m, broadcastIds] of broadcastsByMatch) {
      let [prog] = await tx.select({ id: programme.id }).from(programme).where(eq(programme.title, m.matchTitle));
      if (!prog) {
        [prog] = await tx
          .insert(programme)
          .values({ title: m.matchTitle, normalizedTitle: normalizeTitle(m.matchTitle) })
          .returning({ id: programme.id });
      }
      await tx.update(broadcast).set({ programmeId: prog!.id }).where(inArray(broadcast.id, broadcastIds));

      const candidates = [
        { url: m.url, title: null, notes: withoutEmailAddresses(m.note), confidence: 1, durationS: m.durationS ?? null },
        ...(m.alt ? [{ url: m.alt.url, title: m.alt.label, notes: null, confidence: 0.5, durationS: null }] : []),
      ].map((c) => ({
        ...c,
        provider: providerOf(c.url),
        providerVideoId: videoIdOf(c.url),
        embeddable: isEmbeddable(c.url),
        matchLevel: m.matchLevel,
        status: "approved" as const,
        foundBy: "seed",
      }));
      const rows = broadcastIds.flatMap((broadcastId) => candidates.map((c) => ({ ...c, broadcastId })));
      await tx.insert(mediaCandidate).values(rows);
      mediaCandidates += rows.length;
    }
    const programmesLinked = broadcastsByMatch.size;
    const { restored: communityVideos, orphaned: communityOrphaned } = await restoreCommunityVideos(
      tx,
      community,
      dayBroadcasts.map((b) => ({ id: b.id, channelSlug: slugOf.get(b.channelId)!, startMin: b.startMin })),
    );

    let adBreaks = 0;
    for (const a of day.adBreaks ?? []) {
      const id = channelId.get(a.channel);
      if (id === undefined) throw new Error(`Ad break on unknown channel ${a.channel}`);
      const urls = [a.url, ...a.alternatives];
      for (const [rank, url] of urls.entries()) {
        const values = {
          channelId: id,
          kind: "ad_break" as const,
          status: "approved" as const,
          url,
          providerVideoId: videoIdOf(url),
          airedPeriod: a.airedPeriod ?? day.date.slice(0, 4),
          rank,
          notes: rank === 0 ? withoutEmailAddresses(a.note) : null,
        };
        await tx
          .insert(interstitial)
          .values(values)
          .onConflictDoUpdate({ target: [interstitial.channelId, interstitial.kind, interstitial.url, interstitial.inS], set: values });
        adBreaks++;
      }
    }

    return { tvDayId, broadcasts: day.broadcasts.length, programmesLinked, mediaCandidates, adBreaks, communityVideos, communityOrphaned };
  });
}

/** Converts a curated seed file (ARCHITECTURE.md Appendix A) into an import. */
export function importedDayFromSeed(seed: SeedFile): ImportedDay {
  tvDayFromSeed(seed); // validates layout, channels and times; throws on inconsistencies
  return {
    date: seed.date,
    completeness: seed.completeness ?? "full",
    source: { name: seed.source.name, url: seed.source.url, licenseStatus: licenseStatusOf(seed.source.license) },
    channels: seed.channels.map((c) => ({
      slug: c.id,
      name: c.name,
      displayNumber: c.displayNumber,
      isPrivate: c.isPrivate,
    })),
    broadcasts: seed.broadcasts.map((b) => ({
      channel: b.channel,
      startMin: b.startMinOfTvDay,
      endMin: b.endMinOfTvDay,
      title: b.title,
      description: b.description,
      raw: b,
    })),
    curatedMedia: seed.media.map((m) => ({
      matchTitle: m.matchTitle,
      channel: m.channel,
      start: m.start,
      matchLevel: SEED_LEVELS[m.level],
      url: m.url,
      note: m.note,
      alt: m.alt,
      durationS: m.durationS ?? null,
    })),
    adBreaks: seed.adBreaks.map((a) => ({
      channel: a.channel,
      url: a.url,
      note: a.note,
      alternatives: a.alternatives ?? [],
      airedPeriod: a.airedPeriod,
    })),
  };
}


/**
 * Deletes a schedule source and all its TV days (broadcasts, lineups and
 * per-broadcast matches cascade). For sources that were renamed or replaced.
 * Community videos on those days lose their broadcast: their contributions go back to „pending“.
 */
export async function removeSource(db: Db, sourceName: string): Promise<{ removedDays: string[]; communityOrphaned: number } | null> {
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(scheduleSource).where(eq(scheduleSource.name, sourceName));
    if (!source) return null;
    const dayIds = (await tx.select({ id: tvDay.id }).from(tvDay).where(eq(tvDay.sourceId, source.id))).map((d) => d.id);
    const { orphaned } = await restoreCommunityVideos(tx, await saveCommunityVideos(tx, dayIds), []);
    const days = await tx.delete(tvDay).where(eq(tvDay.sourceId, source.id)).returning({ date: tvDay.date });
    await tx.delete(scheduleSource).where(eq(scheduleSource.id, source.id));
    return { removedDays: days.map((d) => d.date), communityOrphaned: orphaned };
  });
}

/** Records a source's license status (imports never overwrite it). */
export async function setLicenseStatus(db: Db, sourceName: string, status: LicenseStatus, notes?: string): Promise<boolean> {
  const rows = await db
    .update(scheduleSource)
    .set({ licenseStatus: status, ...(notes !== undefined ? { notes } : {}) })
    .where(eq(scheduleSource.name, sourceName))
    .returning({ id: scheduleSource.id });
  return rows.length > 0;
}
