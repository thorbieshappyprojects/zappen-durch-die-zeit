import { MINUTES_PER_DAY, TV_DAY_END_MIN, TV_DAY_START_MIN } from "./time";
import type { AdBreak, Broadcast, Channel, MatchLevel, MediaCandidate, TvDay } from "./types";

export function broadcastsOf(day: TvDay, channelId: string): Broadcast[] {
  return day.broadcasts.filter((b) => b.channelId === channelId);
}

/** The broadcast on air at `tvDayMin` (start inclusive, end exclusive), or null (Sendepause). */
export function findBroadcastAt(broadcasts: Broadcast[], tvDayMin: number): Broadcast | null {
  return broadcasts.find((b) => tvDayMin >= b.startMin && tvDayMin < b.endMin) ?? null;
}

/**
 * Like `findBroadcastAt`, but for a single curated day that is replayed every
 * day: in the morning (e.g. 06:10 = 370) the previous day's late-night
 * programme may still be running (stored as 1810), so check that overhang too.
 */
export function findOnAir(broadcasts: Broadcast[], tvDayMin: number): Broadcast | null {
  return findBroadcastAt(broadcasts, tvDayMin) ?? findBroadcastAt(broadcasts, tvDayMin + MINUTES_PER_DAY);
}

/** Position of `tvDayMin` relative to a broadcast found via `findOnAir` (undoes the overhang shift). */
export function positionIn(broadcast: Broadcast, tvDayMin: number): number {
  return tvDayMin < broadcast.startMin ? tvDayMin + MINUTES_PER_DAY : tvDayMin;
}

export function nextBroadcast(broadcasts: Broadcast[], current: Broadcast): Broadcast | null {
  const i = broadcasts.indexOf(current);
  return i >= 0 ? (broadcasts[i + 1] ?? null) : null;
}

/** First broadcast starting after `tvDayMin` (for the test card's "Programmbeginn"). */
export function upcomingBroadcast(broadcasts: Broadcast[], tvDayMin: number): Broadcast | null {
  return broadcasts.find((b) => b.startMin > tvDayMin) ?? null;
}

/** Progress through a broadcast, 0…1. */
export function progressOf(broadcast: Broadcast, tvDaySeconds: number): number {
  const pos = positionIn(broadcast, tvDaySeconds / 60);
  return Math.min(1, Math.max(0, (pos - broadcast.startMin) / (broadcast.endMin - broadcast.startMin)));
}

/**
 * Seek-in-progress: seconds into the recording when tuning in at
 * `tvDaySeconds` (now − broadcast start). Recordings shorter than the elapsed
 * time loop, so the offset wraps around the duration when it is known.
 */
export function seekOffsetSeconds(broadcast: Broadcast, tvDaySeconds: number, durationS?: number): number {
  const posS = positionIn(broadcast, tvDaySeconds / 60) * 60;
  const offset = Math.max(0, Math.floor(posS - broadcast.startMin * 60));
  return durationS && durationS >= 1 ? offset % Math.floor(durationS) : offset;
}

/** Whole minutes since the broadcast started (for "läuft seit … Min." hints). */
export function minutesSinceStart(broadcast: Broadcast, tvDaySeconds: number): number {
  return Math.floor(seekOffsetSeconds(broadcast, tvDaySeconds) / 60);
}

/**
 * The show to open when "any show" is fine (free choice): the one on air if it has a playable
 * video, else the next one with a video, else the last earlier one; null if the channel has none.
 * `playable` can rule out videos that failed in this visit.
 */
export function nearestVideoBroadcast(
  day: TvDay,
  broadcasts: readonly Broadcast[],
  tvDayMin: number,
  playable: (b: Broadcast) => boolean = (b) => Boolean(mediaFor(day, b)?.embeddable),
): Broadcast | null {
  const onAir = findOnAir([...broadcasts], tvDayMin);
  if (onAir && playable(onAir)) return onAir;
  const min = onAir ? positionIn(onAir, tvDayMin) : tvDayMin;
  const withVideo = broadcasts.filter(playable);
  return withVideo.find((b) => b.startMin > min) ?? withVideo.filter((b) => b.startMin <= min).at(-1) ?? null;
}

export function mediaFor(day: TvDay, broadcast: Broadcast): MediaCandidate | null {
  return day.media[broadcast.id] ?? null;
}

export function matchLevelOf(day: TvDay, broadcast: Broadcast): MatchLevel {
  return mediaFor(day, broadcast)?.matchLevel ?? "none";
}

/** Fallback YouTube search for unmatched slots: title without "(Wh.)" plus the year. */
export function searchUrlFor(broadcast: Broadcast, tvDate: string): string {
  const title = broadcast.title.replace(/\s*\(Wh\.\)\s*/g, " ").trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${tvDate.slice(0, 4)}`)}`;
}

/** Ad breaks are shown during the last minutes of a programme on private channels. */
export const AD_WINDOW_MIN = 3;
/** Short items (news flashes, trailers) get no break. */
export const AD_MIN_PROGRAMME_MIN = 20;

export function adBreakFor(day: TvDay, channel: Channel): AdBreak | null {
  if (!channel.isPrivate) return null;
  return day.adBreaks.find((a) => a.channelId === channel.id) ?? null;
}

/** True if `tvDayMin` falls in the ad window at the end of `broadcast`. */
export function isInAdWindow(broadcast: Broadcast, tvDayMin: number): boolean {
  if (broadcast.endMin - broadcast.startMin < AD_MIN_PROGRAMME_MIN) return false;
  const pos = positionIn(broadcast, tvDayMin);
  return pos >= broadcast.endMin - AD_WINDOW_MIN && pos < broadcast.endMin;
}

export type Fallback =
  | { kind: "programme"; broadcast: Broadcast; media: MediaCandidate }
  | { kind: "ad"; adBreak: AdBreak };

/** Substitutes shorter than this are only used when nothing longer exists. */
export const FALLBACK_MIN_DURATION_S = 300;

/**
 * "Next best thing" for a slot without an embeddable video, so the screen is
 * never silent: the embeddable programme on the same channel closest in time
 * (earlier wins ties; recordings of at least 5 minutes preferred), else the
 * channel's ad break, else null. `skipVideoIds` excludes videos that failed to play.
 */
export function fallbackFor(
  day: TvDay,
  channel: Channel,
  broadcast: Broadcast,
  skipVideoIds: ReadonlySet<string> = new Set(),
): Fallback | null {
  return (
    nearestEmbeddable(day, channel, broadcast, skipVideoIds, FALLBACK_MIN_DURATION_S) ??
    nearestEmbeddable(day, channel, broadcast, skipVideoIds, 0) ??
    adFallback(day, channel, skipVideoIds)
  );
}

function adFallback(day: TvDay, channel: Channel, skipVideoIds: ReadonlySet<string>): Fallback | null {
  const ad = day.adBreaks.find(
    (a) => a.channelId === channel.id && a.providerVideoId && !skipVideoIds.has(a.providerVideoId),
  );
  return ad ? { kind: "ad", adBreak: ad } : null;
}

function nearestEmbeddable(
  day: TvDay,
  channel: Channel,
  broadcast: Broadcast,
  skipVideoIds: ReadonlySet<string>,
  minDurationS: number,
): Fallback | null {
  let best: { broadcast: Broadcast; media: MediaCandidate; distance: number } | null = null;
  for (const b of broadcastsOf(day, channel.id)) {
    if (b.id === broadcast.id) continue;
    const media = mediaFor(day, b);
    if (!media?.embeddable || !media.providerVideoId || skipVideoIds.has(media.providerVideoId)) continue;
    if (minDurationS && media.durationS !== null && media.durationS < minDurationS) continue;
    const distance = b.startMin < broadcast.startMin ? broadcast.startMin - b.endMin : b.startMin - broadcast.endMin;
    const better =
      !best ||
      distance < best.distance ||
      (distance === best.distance && b.startMin < broadcast.startMin && best.broadcast.startMin > broadcast.startMin);
    if (better) best = { broadcast: b, media, distance };
  }
  return best ? { kind: "programme", broadcast: best.broadcast, media: best.media } : null;
}

/**
 * The hole in a channel's schedule around `tvDayMin` (from the previous
 * broadcast's end to the next one's start), as a pseudo-broadcast. Used on
 * partial days, where a gap means "unknown" rather than "off air".
 */
export function gapAround(broadcasts: Broadcast[], channelId: string, tvDayMin: number): Broadcast {
  const pos = tvDayMin;
  let startMin = TV_DAY_START_MIN;
  let endMin = TV_DAY_END_MIN;
  for (const b of broadcasts) {
    if (b.endMin <= pos) startMin = Math.max(startMin, b.endMin);
    else if (b.startMin > pos) endMin = Math.min(endMin, b.startMin);
  }
  return { id: `${channelId}-gap-${startMin}`, channelId, startMin, endMin, title: "Programm unbekannt", description: null };
}

/**
 * Other channels airing the very same broadcast (same title, start and end),
 * e.g. the joint ARD/ZDF morning programme. Empty for normal broadcasts.
 */
export function simulcastChannels(day: TvDay, broadcast: Broadcast): Channel[] {
  return day.channels.filter(
    (c) =>
      c.id !== broadcast.channelId &&
      day.broadcasts.some(
        (b) =>
          b.channelId === c.id &&
          b.title === broadcast.title &&
          b.startMin === broadcast.startMin &&
          b.endMin === broadcast.endMin,
      ),
  );
}

/**
 * Teletext P300 "Jetzt / Danach": per channel of the day (by programme number) the broadcast on
 * air at `tvDayMin` and the one after it (or the next one coming up if nothing is on).
 */
export function nowAndNextByChannel(
  day: TvDay,
  tvDayMin: number,
): { channel: TvDay["channels"][number]; now: Broadcast | null; next: Broadcast | null }[] {
  return [...day.channels]
    .sort((a, b) => a.displayNumber - b.displayNumber)
    .map((channel) => {
      const list = broadcastsOf(day, channel.id);
      const now = findOnAir(list, tvDayMin);
      return { channel, now, next: now ? nextBroadcast(list, now) : upcomingBroadcast(list, tvDayMin) };
    });
}
