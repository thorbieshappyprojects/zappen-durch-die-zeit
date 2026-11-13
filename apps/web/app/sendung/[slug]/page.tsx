import { formatClock, formatTvDayShort, isCalendarDate, shareUrl, showKeyFromSlug, stationBySlug, type ShowAiring } from "@zdz/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/LegalLinks";
import { getShow } from "@/lib/db";
import { MATCH_HINT, MATCH_MARK } from "@/lib/labels";

export const dynamic = "force-dynamic";

type Search = { sender?: string; video?: string; seite?: string; tag?: string };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Search> };

/** Airings per page (Tagesschau has thousands). */
const PAGE_SIZE = 100;

/** The show behind a slug, or null (unknown slug or no airing on a real day). */
async function showOf(slug: string) {
  const key = showKeyFromSlug(decodeURIComponent(slug));
  if (!key) return null;
  const show = await getShow(key);
  if (!show.airings.length) return null;
  // The spelling most airings use.
  const spellings = new Map<string, number>();
  for (const a of show.airings) spellings.set(a.title, (spellings.get(a.title) ?? 0) + 1);
  const title = [...spellings].sort((x, y) => y[1] - x[1])[0]![0];
  return { key, title, ...show };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const show = await showOf((await params).slug);
  if (!show) return { robots: { index: false } };
  const years = [...new Set(show.airings.map((a) => a.date.slice(0, 4)))];
  const range = years.length > 1 ? `${years[0]}–${years.at(-1)}` : years[0];
  return {
    title: `${show.title} – Sendetermine ${range} | Zappen durch die Zeit`,
    description: `Wann lief „${show.title}“ im Fernsehen? ${show.airings.length} Ausstrahlungen ${range}, mit Videos zum Ansehen.`,
    robots: process.env.PUBLISH_LISTINGS === "1" ? { index: true, follow: true } : { index: false, follow: true },
  };
}

const stationName = (slug: string) => stationBySlug(slug)?.name ?? slug;
const hasVideo = (a: ShowAiring | Omit<ShowAiring, "channelName">) => a.matchLevel !== "none";

/**
 * Teletext-style page of one show: how many airings we have, on which stations and in which years,
 * how many with video; every airing opens the TV on that station at that time on that day.
 */
export default async function ShowPage({ params, searchParams }: Props) {
  const show = await showOf((await params).slug);
  if (!show) notFound();
  const search = await searchParams;
  const backDate = search.tag && isCalendarDate(search.tag) ? search.tag : undefined;

  const withVideo = show.airings.filter(hasVideo);
  const exact = show.airings.filter((a) => a.matchLevel === "exact").length;
  const perStation = new Map<string, number>();
  for (const a of show.airings) perStation.set(a.channelId, (perStation.get(a.channelId) ?? 0) + 1);
  const station = search.sender && perStation.has(search.sender) ? search.sender : undefined;
  // With videos there, the list starts with the airings one can watch.
  const onlyVideo = search.video !== "alle" && withVideo.length > 0;

  const listed = show.airings.filter((a) => (!station || a.channelId === station) && (!onlyVideo || hasVideo(a)));
  const last = Math.max(1, Math.ceil(listed.length / PAGE_SIZE));
  const page = Math.min(last, Math.max(1, Number.parseInt(search.seite ?? "1", 10) || 1));
  const shown = listed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const years = [...new Set(show.airings.map((a) => a.date.slice(0, 4)))];
  const range = years.length > 1 ? `${years[0]}–${years.at(-1)}` : years[0];
  const href = (over: Partial<Record<keyof Search, string | undefined>>) => {
    const q = new URLSearchParams();
    const next = { sender: station, video: onlyVideo ? undefined : withVideo.length ? "alle" : undefined, tag: backDate, ...over };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return `?${s}`;
  };

  return (
    <main className="ttp">
      <div className="ttp-screen">
        <div className="tt-head">
          <span>P500</span>
          <span>Sendungen</span>
          <span>
            <Link href={backDate ? `/tag/${backDate}` : "/"}>◂ Zum Fernseher</Link>
          </span>
        </div>
        <h1 className="tt-title ttp-title">{show.title}</h1>

        <dl className="ttp-facts">
          <div>
            <dt>Ausstrahlungen</dt>
            <dd>
              {show.airings.length} an {new Set(show.airings.map((a) => a.date)).size} Tagen · {range}
            </dd>
          </div>
          <div>
            <dt>Mit Video</dt>
            <dd>
              {withVideo.length ? (
                <>
                  {withVideo.length}
                  {exact > 0 && <> · davon {exact} genau diese Sendung 🟢</>}
                </>
              ) : (
                "noch keins – vielleicht kennst du eins?"
              )}
            </dd>
          </div>
          {show.assumed > 0 && (
            <div>
              <dt>Angenommen</dt>
              <dd>außerdem {show.assumed} × auf ihrem regelmäßigen Sendeplatz an Tagen ohne überliefertes Programm</dd>
            </div>
          )}
        </dl>

        <nav className="ttp-filter" aria-label="Sender">
          <Link
            className={station ? "" : "on"}
            href={href({ sender: undefined, seite: undefined })}
            aria-current={station ? undefined : "true"}
          >
            Alle Sender
          </Link>
          {[...perStation]
            .sort((x, y) => y[1] - x[1])
            .map(([slug, n]) => (
              <Link
                key={slug}
                className={station === slug ? "on" : ""}
                href={href({ sender: slug, seite: undefined })}
                aria-current={station === slug ? "true" : undefined}
              >
                {stationName(slug)} <span>{n}</span>
              </Link>
            ))}
        </nav>
        {withVideo.length > 0 && (
          <nav className="ttp-filter" aria-label="Videos">
            <Link
              className={onlyVideo ? "on" : ""}
              href={href({ video: undefined, seite: undefined })}
              aria-current={onlyVideo ? "true" : undefined}
            >
              Nur mit Video
            </Link>
            <Link
              className={onlyVideo ? "" : "on"}
              href={href({ video: "alle", seite: undefined })}
              aria-current={onlyVideo ? undefined : "true"}
            >
              Alle Termine
            </Link>
          </nav>
        )}

        <ol className="ttp-list">
          {shown.map((a, i) => {
            const year = a.date.slice(0, 4);
            const newYear = i === 0 || shown[i - 1]!.date.slice(0, 4) !== year;
            return (
              <li key={`${a.date}-${a.channelId}-${a.startMin}`}>
                {newYear && <h2 className="ttp-year">{year}</h2>}
                <Link
                  className="tt-row ttp-row"
                  href={shareUrl(a.date, { channelId: a.channelId, tvDayMin: a.startMin })}
                  title={`${a.title} am ${formatTvDayShort(a.date)} um ${formatClock(a.startMin)} auf ${stationName(a.channelId)} einschalten`}
                >
                  <span className="ttp-date">{formatTvDayShort(a.date)}</span>
                  <span className="tm">{formatClock(a.startMin)}</span>
                  <span className="ttp-station">{stationName(a.channelId)}</span>
                  <span className={`m m-${a.matchLevel}`} title={MATCH_HINT[a.matchLevel]} aria-label={MATCH_HINT[a.matchLevel]}>
                    {MATCH_MARK[a.matchLevel]}
                  </span>
                  {(a.title !== show.title || a.description) && (
                    <span className="sub2">{[a.title !== show.title ? a.title : null, a.description].filter(Boolean).join(" · ")}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>

        {last > 1 && (
          <nav className="ttp-pager" aria-label="Seiten">
            {page > 1 ? <Link href={href({ seite: String(page - 1) })}>◂ zurück</Link> : <span />}
            <span>
              Seite {page}/{last} · {listed.length} Termine
            </span>
            {page < last ? <Link href={href({ seite: String(page + 1) })}>weiter ▸</Link> : <span />}
          </nav>
        )}

        <div className="tt-foot">
          <span>🟢 genau</span>
          <span>🟡 gleiches Jahr</span>
          <span>🔵 ähnlich</span>
          <span>❌ fehlt</span>
        </div>
        <p className="tt-note">Ein Klick auf einen Termin schaltet den Sender an diesem Tag zu dieser Uhrzeit ein.</p>
      </div>
      <SiteFooter />
    </main>
  );
}
