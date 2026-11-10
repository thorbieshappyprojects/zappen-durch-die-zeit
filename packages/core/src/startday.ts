/** Which day the TV opens with: today's date in an earlier year, else the nearest calendar date we have. */
import type { Broadcast, MatchLevel, TvDay } from "./types";

/** Day of the year in a non-leap reference year (29 Feb counts as 28 Feb). */
function dayOfYear(date: string): number {
  const month = Number(date.slice(5, 7));
  const day = Math.min(Number(date.slice(8, 10)), month === 2 ? 28 : 31);
  return (Date.UTC(2001, month - 1, day) - Date.UTC(2001, 0, 1)) / 86_400_000;
}

/** Days between two calendar dates ignoring the year, across New Year (31.12. ↔ 1.1. = 1). */
export function calendarDistance(a: string, b: string): number {
  const d = Math.abs(dayOfYear(a) - dayOfYear(b));
  return Math.min(d, 365 - d);
}

/**
 * The start day for `today` (a TV-day date): same day and month in an earlier year if we
 * have it (`exact`), otherwise the nearest calendar date. Ties go to the better-covered day.
 */
export function pickStartDay(
  dates: readonly string[],
  today: string,
  coverage: Record<string, number> = {},
): { date: string; exact: boolean } | null {
  let best: { date: string; distance: number; score: number } | null = null;
  for (const date of dates) {
    const distance = calendarDistance(date, today);
    const score = coverage[date] ?? 0;
    if (!best || distance < best.distance || (distance === best.distance && score > best.score)) best = { date, distance, score };
  }
  return best && { date: best.date, exact: best.distance === 0 };
}

/** Preference of the start show: the very broadcast first, then the same show from that year. */
const START_LEVELS: readonly MatchLevel[] = ["exact", "same_show_period"];

/**
 * The show a fallback start opens with (another day than today's date anyway, so the TV starts in
 * "Programm frei wählen"): a broadcast we have exactly, the one on air at `tvDayMin` or else the one
 * starting nearest to it, on a station that isn't hidden. Without an exact match the same show from
 * that year will do; null when the day has neither.
 */
export function pickStartBroadcast(
  day: TvDay,
  tvDayMin: number,
  options: { hidden?: ReadonlySet<string>; playable?: (b: Broadcast) => boolean } = {},
): { channelId: string; tvDayMin: number } | null {
  const playable = options.playable ?? (() => true);
  for (const level of START_LEVELS) {
    const candidates = day.broadcasts.filter((b) => {
      const m = day.media[b.id];
      return m?.matchLevel === level && m.embeddable && m.providerVideoId && !options.hidden?.has(b.channelId) && playable(b);
    });
    if (!candidates.length) continue;
    const onAir = candidates.filter((b) => b.startMin <= tvDayMin && tvDayMin < b.endMin);
    const pick = onAir.length
      ? onAir[Math.floor(Math.random() * onAir.length)]!
      : candidates.reduce((a, b) => (Math.abs(b.startMin - tvDayMin) < Math.abs(a.startMin - tvDayMin) ? b : a));
    return { channelId: pick.channelId, tvDayMin: pick.startMin };
  }
  return null;
}
