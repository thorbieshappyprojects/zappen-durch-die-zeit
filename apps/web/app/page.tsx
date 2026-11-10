import { pickStartDay, tvDayDateOf } from "@zdz/core";
import { redirect } from "next/navigation";
import { EmptyDatabase } from "@/components/EmptyDatabase";
import { getAssumedDates, getTvDayCoverage, getTvDayDates } from "@/lib/db";

/** Any one element (the page renders per request, so a random pick is fine on the server). */
const pickRandom = <T,>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];

export const dynamic = "force-dynamic";

/**
 * Opens today's date in an earlier year; without one, one of the best-covered days,
 * and the TV says so ("Vom 9. November haben wir kein Programm …").
 */
export default async function Home() {
  const [all, coverage, assumed] = await Promise.all([getTvDayDates(), getTvDayCoverage(), getAssumedDates()]);
  // Only real programme days: an assumed day (regular slots only) is a thin start.
  const skip = new Set(assumed);
  const dates = all.filter((d) => !skip.has(d));
  const today = tvDayDateOf(new Date());
  const start = pickStartDay(dates, today, coverage.byDate);
  if (!start) return <EmptyDatabase />;
  if (start.exact) redirect(`/tag/${start.date}`);
  // No programme for today's date in any year: one of the best days (nearest date if there are none).
  const best = coverage.best.length ? pickRandom(coverage.best)!.date : start.date;
  redirect(`/tag/${best}?gesucht=${today.slice(5)}`);
}
