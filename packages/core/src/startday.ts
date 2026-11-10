/** Which day the TV opens with: today's date in an earlier year, else the nearest calendar date we have. */

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
