/**
 * "Lückenlos" mode: a programme built from the recordings we have, not the one that aired.
 * Every channel's TV day is filled back to back with videos of that station from nearby days,
 * so there's a picture on every channel at any time. Ad breaks, idents etc. still come from
 * `interstitialsFor` at the programme boundaries.
 */
import { MINUTES_PER_DAY, TV_DAY_END_MIN, TV_DAY_START_MIN } from "./time";
import type { Broadcast, MediaCandidate, TvDay } from "./types";

/** A station's recording from another (or the same) day, as a candidate for the programme. */
export interface PoolVideo {
  channelId: string;
  /** Date of the TV day the recording is linked to. */
  date: string;
  title: string;
  /** Where it ran on that day (minutes of its TV day): shows go to a similar time of day. */
  startMin: number;
  media: MediaCandidate;
}

/** Shorter recordings are clips, not programmes; longer ones are rare all-day blocks. */
export const SEAMLESS_MIN_MIN = 5;
export const SEAMLESS_MAX_MIN = 4 * 60;
/** Fewer different shows than this would loop all day: such a channel is left out. */
export const SEAMLESS_MIN_TITLES = 10;
/** A gap shorter than this is closed by stretching the programme before it. */
const MIN_GAP_MIN = SEAMLESS_MIN_MIN;
/** Score penalties (≈ minutes off the time of day): a title used before, right before, the very video again. */
const TITLE_REPEAT_PENALTY = 240;
const TITLE_BACK_TO_BACK_PENALTY = 900;
const VIDEO_REPEAT_PENALTY = 2000;

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const lengthMin = (m: MediaCandidate) => Math.floor((m.durationS ?? 0) / 60);
const yearOf = (date: string) => Number(date.slice(0, 4));
/** Distance between two times of day, around the clock. */
const clockDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % MINUTES_PER_DAY;
  return Math.min(d, MINUTES_PER_DAY - d);
};

/**
 * The day with every channel filled from 06:00 to 06:00. Broadcasts of the day that have a
 * playable video keep their slot (as long as the recording runs); the gaps get pool videos of the
 * same station, preferring a similar time of day, then nearby dates. Deterministic per date, so
 * every viewer zaps through the same programme. Channels with too few different shows are left out.
 */
export interface SeamlessOptions {
  /** Fewer different shows: the channel is left out (default SEAMLESS_MIN_TITLES). */
  minTitles?: number;
  /** Weight of the time-of-day fit (default 1; 0 = shows run at any time). */
  timeOfDay?: number;
  /** A kind per video (e.g. talk / court): the next slot prefers another kind than the last. */
  kindOf?: (v: PoolVideo) => string;
}

/** Score penalty for the same kind as the slot before (when the channel has another kind). */
const KIND_REPEAT_PENALTY = 400;

export function seamlessDay(day: TvDay, pool: readonly PoolVideo[], options: SeamlessOptions = {}): TvDay {
  const { minTitles = SEAMLESS_MIN_TITLES, timeOfDay = 1, kindOf } = options;
  const broadcasts: Broadcast[] = [];
  const media: Record<string, MediaCandidate> = {};
  const filled: TvDay["channels"] = [];
  const dayYear = yearOf(day.date);

  for (const channel of day.channels) {
    const own = day.broadcasts.filter((b) => b.channelId === channel.id);
    const candidates = pool.filter(
      (v) => v.channelId === channel.id && v.media.embeddable && lengthMin(v.media) >= SEAMLESS_MIN_MIN && lengthMin(v.media) <= SEAMLESS_MAX_MIN,
    );
    // Real broadcasts with a playable video stay where they were, cut to the recording's length.
    const anchors = own.flatMap((b) => {
      const m = day.media[b.id];
      if (!m?.embeddable) return [];
      const start = Math.max(b.startMin, TV_DAY_START_MIN);
      const len = m.durationS ? Math.max(SEAMLESS_MIN_MIN, lengthMin(m)) : b.endMin - b.startMin;
      const end = Math.min(b.endMin, start + len, TV_DAY_END_MIN);
      return end > start ? [{ b, m, start, end }] : [];
    });
    if (new Set([...anchors.map((a) => a.b.title), ...candidates.map((v) => v.title)]).size < minTitles) continue;
    const kinds = kindOf ? new Set(candidates.map(kindOf)) : new Set<string>();
    let lastKind: string | null = null;
    filled.push(channel);

    const uses = new Map<string, number>();
    const titleUses = new Map<string, number>();
    const used = (url: string, title: string) => {
      uses.set(url, (uses.get(url) ?? 0) + 1);
      titleUses.set(title, (titleUses.get(title) ?? 0) + 1);
    };
    const out: Broadcast[] = [];
    const place = (title: string, description: string | null, start: number, end: number, m: MediaCandidate) => {
      const id = `${channel.id}-${start}`;
      out.push({ id, channelId: channel.id, startMin: start, endMin: end, title, description });
      media[id] = m;
    };
    for (const a of anchors) used(a.m.url, a.b.title);

    /** Fills [from, to) with pool videos. */
    const fill = (from: number, to: number) => {
      let t = from;
      while (to - t >= MIN_GAP_MIN && candidates.length) {
        const room = to - t;
        const score = (v: PoolVideo) =>
          timeOfDay * clockDistance(v.startMin, t) +
          (kinds.size > 1 && kindOf!(v) === lastKind ? KIND_REPEAT_PENALTY : 0) +
          10 * Math.abs(yearOf(v.date) - dayYear) +
          TITLE_REPEAT_PENALTY * (titleUses.get(v.title) ?? 0) +
          (out[out.length - 1]?.title === v.title ? TITLE_BACK_TO_BACK_PENALTY : 0) +
          VIDEO_REPEAT_PENALTY * (uses.get(v.media.url) ?? 0) +
          // Stable tie-breaker per date and slot, so equal candidates vary between days.
          (hash(`${day.date}|${channel.id}|${t}|${v.media.url}`) % 30);
        const fitting = candidates.filter((v) => lengthMin(v.media) <= room);
        // Nothing fits the rest of the gap: the best video is cut at the gap's end.
        const pick = (fitting.length ? fitting : candidates).reduce((best, v) => (score(v) < score(best) ? v : best));
        const end = Math.min(to, t + lengthMin(pick.media));
        place(pick.title, `Aufnahme vom ${pick.date.split("-").reverse().join(".")}`, t, end, {
          ...pick.media,
          // Relative to the real show on its own day: same year, or another time.
          matchLevel: pick.date === day.date ? pick.media.matchLevel : yearOf(pick.date) === dayYear ? "same_show_period" : "same_show",
        });
        used(pick.media.url, pick.title);
        if (kindOf) lastKind = kindOf(pick);
        t = end;
      }
      // A few minutes left (or no pool at all): the previous programme runs on.
      const last = out[out.length - 1];
      if (to - t > 0 && last && last.endMin === t) last.endMin = to;
    };

    let t = TV_DAY_START_MIN;
    for (const a of anchors) {
      if (a.start < t) continue; // overlaps the previous anchor (shouldn't happen with a clean listing)
      fill(t, a.start);
      place(a.b.title, a.b.description, a.start, a.end, a.m);
      t = a.end;
    }
    fill(t, TV_DAY_END_MIN);
    broadcasts.push(...out.sort((x, y) => x.startMin - y.startMin));
  }

  return { ...day, channels: filled, broadcasts, media };
}
