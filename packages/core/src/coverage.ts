/** How well a TV day is covered with videos: points per broadcast for its best match. */
import { matchLevelOf } from "./schedule";
import type { MatchLevel, TvDay } from "./types";

/** The very broadcast is worth far more than any number of stand-ins (same year, other episodes). */
export const MATCH_POINTS: Record<MatchLevel, number> = { exact: 10, same_show_period: 3, same_show: 1, none: 0 };
const MAX_POINTS = MATCH_POINTS.exact;
/** Day score at which the colour scale reaches full green: about the best-covered real days. */
export const COVERAGE_FULL_GREEN = 0.15;
/**
 * A full programme day has at least this many broadcasts (most real days: 160–290). Shorter days are
 * scored against it, so an assumed day with a handful of slots, all with video, isn't "green".
 */
export const FULL_DAY_BROADCASTS = 150;

/** Share of the possible points (0…1): every broadcast an exact match = 1. */
export function coverageScore(points: number, broadcasts: number): number {
  return broadcasts > 0 ? points / (broadcasts * MAX_POINTS) : 0;
}

/** Like `coverageScore`, for a whole TV day: measured against at least a full programme day. */
export function dayCoverageScore(points: number, broadcasts: number): number {
  return broadcasts > 0 ? coverageScore(points, Math.max(broadcasts, FULL_DAY_BROADCASTS)) : 0;
}

export function dayCoverage(day: TvDay): { points: number; broadcasts: number; score: number } {
  const points = day.broadcasts.reduce((sum, b) => sum + MATCH_POINTS[matchLevelOf(day, b)], 0);
  return { points, broadcasts: day.broadcasts.length, score: dayCoverageScore(points, day.broadcasts.length) };
}

/** Hue for a score on a red (0) → yellow → green (120) scale. */
export function coverageHue(score: number): number {
  return Math.round(120 * Math.min(1, Math.max(0, score) / COVERAGE_FULL_GREEN));
}

/** Days with fewer broadcasts don't compete for "best day": a short day scores high too easily. */
export const BEST_DAY_MIN_BROADCASTS = 100;

/**
 * The best days for the ⭐ button: the best-covered day of each year, at most one per year, so the
 * picks don't all show the same reused clips (reuse stays within ±2 years, mostly within a year).
 * Days with more exact matches come first, then the score; ties go to more `accuratePoints`
 * (exact / same-year matches whose video is on few days).
 */
export function bestDays(
  rows: readonly { date: string; points: number; accuratePoints: number; broadcasts: number; exact?: number }[],
  count = 5,
): { date: string; score: number }[] {
  return rows
    .filter((r) => r.broadcasts >= BEST_DAY_MIN_BROADCASTS)
    .map((r) => ({ date: r.date, exact: r.exact ?? 0, accurate: coverageScore(r.accuratePoints, r.broadcasts), score: dayCoverageScore(r.points, r.broadcasts) }))
    .sort((a, b) => b.exact - a.exact || b.score - a.score || b.accurate - a.accurate || a.date.localeCompare(b.date))
    .filter((d, i, all) => all.findIndex((x) => x.date.slice(0, 4) === d.date.slice(0, 4)) === i)
    .slice(0, count)
    .map(({ date, score }) => ({ date, score }));
}

/** A channel-day needs this many broadcasts to count as a channel's "best day". */
export const BEST_CHANNEL_DAY_MIN_BROADCASTS = 15;

export interface ChannelDayHint {
  /** Nearest other day (by date) on which we have a programme for the channel. */
  nearest?: string;
  /** The channel's best-covered other day: most exact matches first, then the score. */
  best?: { date: string; score: number; exact: number };
  /**
   * Per hint date: the start (TV-day minute) of that day's show with the best playable video, so a
   * link lands on something to watch instead of whatever runs at the current time.
   */
  videoAt?: Record<string, number>;
}

/**
 * For each channel: where to go from `current` when the channel is empty or poorly covered
 * ("Nächster Tag mit 3sat", "Bester 3sat-Tag").
 */
export function channelDayHints(
  rows: readonly { date: string; channel: string; broadcasts: number; points: number; exact?: number; assumed?: boolean }[],
  current: string,
): Record<string, ChannelDayHint> {
  const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const hints: Record<string, ChannelDayHint> = {};
  for (const r of rows) {
    if (r.date === current) continue;
    const h = (hints[r.channel] ??= {});
    if (!h.nearest || Math.abs(at(r.date) - at(current)) < Math.abs(at(h.nearest) - at(current))) h.nearest = r.date;
    // "Best day" only among real programme days; assumed days (regular slots only) can be "nearest".
    if (r.broadcasts < BEST_CHANNEL_DAY_MIN_BROADCASTS || r.assumed) continue;
    const score = coverageScore(r.points, r.broadcasts);
    const exact = r.exact ?? 0;
    if (!h.best || exact > h.best.exact || (exact === h.best.exact && score > h.best.score)) h.best = { date: r.date, score, exact };
  }
  return hints;
}
