import { broadcastsOf, formatClock, formatTvDayDate, LISTING_MATCH_TEXT, listingIndexable, matchLevelOf, mediaFor, PROVIDER_LABELS, shareUrl } from "@zdz/core";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/LegalLinks";
import { notFound } from "next/navigation";
import { getTvDay } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ date: string }> };

const publish = () => process.env.PUBLISH_LISTINGS === "1";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  const day = await getTvDay(date);
  if (!day) return {};
  const longDate = formatTvDayDate(date).replace(/^\S+, /, "");
  const channels = day.channels.map((c) => c.name).join(", ");
  const indexable = listingIndexable({ licenseStatus: day.source.licenseStatus, completeness: day.completeness }, publish());
  return {
    title: `Fernsehprogramm ${longDate} – ${channels}`,
    description: `Was lief am ${formatTvDayDate(date)} im Fernsehen? Das Programm von ${channels}.`,
    alternates: { canonical: `/tag/${date}/programm` },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

/** Printable, server-rendered day listing in the style of a TV guide (no client JS). */
export default async function DayListing({ params }: Props) {
  const { date } = await params;
  const day = await getTvDay(date);
  if (!day) notFound();
  const assumed = day.completeness === "series_only";
  return (
    <div className="listing">
      <header className="listing-head">
        <p className="listing-brand">
          <Link href={`/tag/${date}`}>Zappen durch die Zeit</Link>
        </p>
        <h1>Fernsehprogramm vom {formatTvDayDate(date)}</h1>
        <p className="listing-note">
          {assumed
            ? "Angenommenes Programm: nur Sendungen, die zu dieser Zeit regelmäßig liefen."
            : day.completeness !== "full"
              ? "Nicht für alle Sender und Uhrzeiten überliefert."
              : null}{" "}
          Programmtag 06:00 bis 06:00 Uhr. <Link href={`/tag/${date}`}>Im Fernseher ansehen ▸</Link>
        </p>
      </header>
      <div className="listing-grid">
        {[...day.channels]
          .sort((a, b) => a.displayNumber - b.displayNumber)
          .map((channel) => (
            <section key={channel.id} className="listing-channel">
              <h2>
                <span>{channel.displayNumber}</span> {channel.name}
              </h2>
              <ol>
                {broadcastsOf(day, channel.id).map((b) => {
                  const match = LISTING_MATCH_TEXT[matchLevelOf(day, b)];
                  const media = mediaFor(day, b);
                  // Time and title open the TV on this station at this time; a found video links to its source.
                  const tv = shareUrl(date, { channelId: channel.id, tvDayMin: b.startMin });
                  return (
                    <li key={b.id}>
                      <Link className="listing-time" href={tv} title="Im Fernseher einschalten">
                        {formatClock(b.startMin)}
                      </Link>
                      <div>
                        <Link className="listing-title" href={tv} title="Im Fernseher einschalten">
                          <strong>{b.title}</strong>
                        </Link>
                        {match && media && (
                          <a className="listing-match" href={media.url} target="_blank" rel="noopener noreferrer" title={media.note}>
                            {" "}
                            · {match} · {PROVIDER_LABELS[media.provider]} ↗
                          </a>
                        )}
                        {b.description && <p>{b.description}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
      </div>
      <footer className="listing-foot">
        Quellen und Hinweise: <Link href={`/info?tag=${date}`}>Info</Link>. Videos sind nur verlinkt; wir hosten keine.
      </footer>
      <SiteFooter />
    </div>
  );
}
