import { formatClock, parseHHMM, TV_DAY_START_MIN } from "./time";
import { isEmbeddable, providerOf, videoIdOf } from "./providers";
import type { AdBreak, Broadcast, Channel, Completeness, LicenseStatus, MatchLevel, MediaCandidate, TvDay } from "./types";

/** Shape of `seed/*.json` (see ARCHITECTURE.md, Appendix A). */
export interface SeedFile {
  date: string;
  /** Defaults to "full". Reconstructed days are "partial". */
  completeness?: Completeness;
  tvDayStart: string;
  timezone: string;
  source: { name: string; url: string; license: string };
  channels: { id: string; name: string; displayNumber: number; isPrivate: boolean }[];
  broadcasts: {
    channel: string;
    start: string;
    end: string;
    startMinOfTvDay: number;
    endMinOfTvDay: number;
    title: string;
    description: string | null;
    /** Provenance for reconstructed days. */
    confidence?: "high" | "medium" | "low";
    sources?: string[];
  }[];
  media: {
    matchTitle: string;
    /** Optional: restrict the match to one broadcast (e.g. only the 20:00 Tagesschau on "ard"). */
    channel?: string;
    start?: string;
    level: "exact" | "same" | "sim";
    url: string;
    note: string;
    alt: { url: string; label: string } | null;
    /** Measured length of the video in seconds. */
    durationS?: number;
  }[];
  adBreaks: { channel: string; url: string; note: string; alternatives?: string[]; airedPeriod?: string }[];
}

export const SEED_LEVELS: Record<SeedFile["media"][number]["level"], Exclude<MatchLevel, "none">> = {
  exact: "exact",
  same: "same_show_period",
  sim: "same_show",
};

/** Validates a seed file and converts it into the domain model. Throws on inconsistencies. */
export function tvDayFromSeed(seed: SeedFile): TvDay {
  if (seed.timezone !== "Europe/Berlin") throw new Error(`Unsupported timezone ${seed.timezone}`);
  if (parseHHMM(seed.tvDayStart) !== TV_DAY_START_MIN) throw new Error(`Unsupported TV day start ${seed.tvDayStart}`);

  const channels: Channel[] = [...seed.channels].sort((a, b) => a.displayNumber - b.displayNumber);
  const channelIds = new Set(channels.map((c) => c.id));
  const channelOrder = new Map(channels.map((c, i) => [c.id, i]));

  const broadcasts: Broadcast[] = seed.broadcasts.map((b) => {
    if (!channelIds.has(b.channel)) throw new Error(`Unknown channel ${b.channel}`);
    if (b.endMinOfTvDay <= b.startMinOfTvDay) throw new Error(`Empty broadcast ${b.channel} ${b.start} ${b.title}`);
    if (b.startMinOfTvDay % 1440 !== parseHHMM(b.start)) throw new Error(`Start mismatch ${b.channel} ${b.start} ${b.title}`);
    return {
      id: `${b.channel}-${b.startMinOfTvDay}`,
      channelId: b.channel,
      startMin: b.startMinOfTvDay,
      endMin: b.endMinOfTvDay,
      title: b.title,
      description: b.description,
    };
  });
  broadcasts.sort((a, b) => channelOrder.get(a.channelId)! - channelOrder.get(b.channelId)! || a.startMin - b.startMin);

  const media: Record<string, MediaCandidate> = {};
  for (const b of broadcasts) {
    const m = pickCuratedMatch(seed.media, { title: b.title, channel: b.channelId, start: formatClock(b.startMin) });
    if (!m) continue;
    const provider = providerOf(m.url);
    const providerVideoId = videoIdOf(m.url);
    media[b.id] = {
      provider,
      url: m.url,
      providerVideoId,
      embeddable: isEmbeddable(m.url),
      durationS: m.durationS ?? null,
      matchLevel: SEED_LEVELS[m.level],
      note: m.note,
      alt: m.alt,
    };
  }

  const adBreaks: AdBreak[] = seed.adBreaks.map((a) => ({
    channelId: a.channel,
    url: a.url,
    provider: providerOf(a.url),
    providerVideoId: videoIdOf(a.url),
    note: a.note,
    alternatives: a.alternatives ?? [],
  }));

  return {
    date: seed.date,
    completeness: seed.completeness ?? "full",
    source: { name: seed.source.name, url: seed.source.url, licenseStatus: licenseStatusOf(seed.source.license) },
    channels,
    broadcasts,
    media,
    adBreaks,
    // Seed files don't carry interstitials (seed/interstitials.json is imported separately).
    interstitials: [],
  };
}

/** Maps the free-text licence note of a seed file ("permission pending") to a status. */
export function licenseStatusOf(note: string): LicenseStatus {
  const n = note.toLowerCase();
  if (/not required|nicht erforderlich|public domain/.test(n)) return "not_required";
  if (/denied|abgelehnt/.test(n)) return "denied";
  if (/granted|erteilt/.test(n)) return "granted";
  if (/pending|ausstehend/.test(n)) return "pending";
  if (/requested|angefragt/.test(n)) return "requested";
  return "unknown";
}

/**
 * The curated match for a broadcast: entries are matched by exact title and,
 * if given, channel and start time; the most specific entry wins.
 */
export function pickCuratedMatch<T extends { matchTitle: string; channel?: string; start?: string }>(
  entries: readonly T[],
  broadcast: { title: string; channel: string; start: string },
): T | undefined {
  let best: T | undefined;
  let bestSpecificity = -1;
  for (const e of entries) {
    if (e.matchTitle !== broadcast.title) continue;
    if (e.channel && e.channel !== broadcast.channel) continue;
    if (e.start && e.start !== broadcast.start) continue;
    const specificity = (e.channel ? 1 : 0) + (e.start ? 1 : 0);
    if (specificity > bestSpecificity) [best, bestSpecificity] = [e, specificity];
  }
  return best;
}
