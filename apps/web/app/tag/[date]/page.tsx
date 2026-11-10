import { broadcastsOf, findOnAir, isCalendarDate, formatClock, formatTvDayDate, parseShareParams, shareUrl, STATIONS, type TvDay } from "@zdz/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusPage } from "@/components/StatusPage";
import { TvApp } from "@/components/TvApp";
import { issueFormToken } from "@/lib/contribution-security";
import { getAssumedDates, getChannelDayHints, getHiddenStations, getSiteSettings, getTvDay, getTvDayCoverage, getTvDayDates } from "@/lib/db";

/** Any one element (the page renders per request, so a random pick is fine on the server). */
const pickRandom = <T,>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];

export const dynamic = "force-dynamic";

type Search = { gesucht?: string; sender?: string; zeit?: string; programm?: string; ereignis?: string };
type Props = { params: Promise<{ date: string }>; searchParams: Promise<Search> };

const SITE = "Zappen durch die Zeit";

const stationSlugs = STATIONS.map((s) => s.slug);

/** The broadcast a deep link points at (channel + time), if any. */
function sharedBroadcast(day: TvDay, search: Search) {
  const target = parseShareParams(search, stationSlugs);
  const channel = target.channelId ? day.channels.find((c) => c.id === target.channelId) : undefined;
  const broadcast = channel && target.tvDayMin !== undefined ? findOnAir(broadcastsOf(day, channel.id), target.tvDayMin) : null;
  return { target, channel, broadcast };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { date } = await params;
  if (!isCalendarDate(date)) return {};
  const search = await searchParams;
  const day = await getTvDay(date);
  const dateLabel = formatTvDayDate(date);
  if (!day) return { title: `Kein Programm am ${dateLabel.replace(/^\S+, /, "")} – ${SITE}`, robots: { index: false } };
  const og = `/og?${new URLSearchParams({ tag: date, ...(search.sender ? { sender: search.sender } : {}), ...(search.zeit ? { zeit: search.zeit } : {}) })}`;
  const shared = day ? sharedBroadcast(day, search) : null;
  if (shared?.broadcast && shared.channel) {
    // "20:15 RTL – Medicopter 117 · 9. November 1999 | Zappen durch die Zeit"
    const title = `${formatClock(shared.broadcast.startMin)} ${shared.channel.name} – ${shared.broadcast.title} · ${dateLabel.replace(/^\S+, /, "")}`;
    const description = shared.broadcast.description ?? `Was lief damals? ${title}`;
    return {
      title: `${title} | ${SITE}`,
      description,
      openGraph: { title, description, images: [og], url: shareUrl(date, shared.target) },
    };
  }
  return { title: `${dateLabel} – ${SITE}`, openGraph: { title: `${dateLabel} – ${SITE}`, images: [og] } };
}

export default async function DayPage({ params, searchParams }: Props) {
  const { date } = await params;
  const search = await searchParams;
  // Set by the start page when today's date isn't in the database ("MM-DD").
  const requested = search.gesucht && /^\d{2}-\d{2}$/.test(search.gesucht) ? search.gesucht : undefined;
  const [day, days, coverage, channelHints, assumedDates, hiddenStations, settings] = await Promise.all([
    getTvDay(date),
    getTvDayDates(),
    getTvDayCoverage(),
    getChannelDayHints(date),
    getAssumedDates(),
    getHiddenStations(),
    getSiteSettings(),
  ]);
  if (!isCalendarDate(date)) notFound();
  if (!day) return <NoProgramme date={date} days={days} assumed={assumedDates} />;
  return (
    <TvApp
      day={day}
      days={days}
      coverage={coverage.byDate}
      bestDays={coverage.best}
      requested={requested}
      channelHints={channelHints}
      assumedDates={assumedDates}
      share={parseShareParams(search, stationSlugs)}
      reportToken={issueFormToken()}
      hiddenStations={hiddenStations}
      settings={settings}
    />
  );
}

/** A real date we have no programme for: the nearest days around it, a random day, Mitmachen. */
function NoProgramme({ date, days, assumed }: { date: string; days: string[]; assumed: string[] }) {
  const earlier = days.filter((d) => d < date).at(-1);
  const later = days.find((d) => d > date);
  const skip = new Set(assumed);
  const real = days.filter((d) => !skip.has(d));
  const random = pickRandom(real);
  const short = (d: string) => formatTvDayDate(d).replace(/^\S+, /, "");
  return (
    <StatusPage
      label="KEIN PROGRAMM"
      title={`Für den ${short(date)} haben wir kein Programm`}
      links={[
        ...(earlier ? [{ href: `/tag/${earlier}`, label: `◀ ${short(earlier)}` }] : []),
        ...(later ? [{ href: `/tag/${later}`, label: `${short(later)} ▶` }] : []),
        ...(random ? [{ href: `/tag/${random}`, label: "🎲 Zufälliger Tag" }] : []),
        { href: `/mitmachen?tag=${date}`, label: "Programm schicken" },
      ]}
    >
      <p>Hast du eine Fernsehzeitschrift von diesem Tag? Über „Mitmachen“ kannst du uns das Programm schicken.</p>
    </StatusPage>
  );
}
