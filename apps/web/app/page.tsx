import { pickStartBroadcast, pickStartDay, shareUrl, tvDayDateOf, tvDaySecondsAt } from "@zdz/core";
import { redirect } from "next/navigation";
import { EmptyDatabase } from "@/components/EmptyDatabase";
import { getAssumedDates, getHiddenStations, getTvDay, getTvDayCoverage, getTvDayDates } from "@/lib/db";

/** The elements in random order (the page renders per request, so a random pick is fine on the server). */
const shuffled = <T,>(items: readonly T[]): T[] =>
  items
    .map((item) => ({ item, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(({ item }) => item);

export const dynamic = "force-dynamic";

/**
 * Opens today's date in an earlier year, live ("Wie damals"). Without one, one of the best-covered
 * days – and since that is another day anyway, in "Programm frei wählen" with a show we have exactly,
 * close to the current time of day (a deep link with sender and zeit). The TV says so
 * ("Vom 9. November haben wir kein Programm …").
 */
export default async function Home() {
  const [all, coverage, assumed, hiddenStations] = await Promise.all([
    getTvDayDates(),
    getTvDayCoverage(),
    getAssumedDates(),
    getHiddenStations(),
  ]);
  // Only real programme days: an assumed day (regular slots only) is a thin start.
  const skip = new Set(assumed);
  const dates = all.filter((d) => !skip.has(d));
  const now = new Date();
  const today = tvDayDateOf(now);
  const start = pickStartDay(dates, today, coverage.byDate);
  if (!start) return <EmptyDatabase />;
  if (start.exact) redirect(`/tag/${start.date}`);
  // No programme for today's date in any year: one of the best days (nearest date if there are none).
  const requested = `gesucht=${today.slice(5)}`;
  const nowMin = Math.floor(tvDaySecondsAt(now) / 60);
  const hidden = new Set(hiddenStations);
  for (const date of coverage.best.length ? shuffled(coverage.best.map((b) => b.date)) : [start.date]) {
    const day = await getTvDay(date);
    const show = day && pickStartBroadcast(day, nowMin, { hidden });
    if (show) redirect(`${shareUrl(date, show)}&${requested}`);
  }
  redirect(`/tag/${coverage.best[0]?.date ?? start.date}?${requested}`);
}
