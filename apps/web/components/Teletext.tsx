"use client";

import { formatClock, formatTvDayShort, HISTORY_EVENTS, matchLevelOf, nowAndNextByChannel, showPath, type Broadcast, type Channel, type HistoryEvent, type TvDay } from "@zdz/core";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { MATCH_HINT, MATCH_MARK } from "@/lib/labels";

interface Props {
  day: TvDay;
  channel: Channel;
  broadcasts: Broadcast[];
  current: Broadcast | null;
  /** Absent in linear mode: the guide is then read-only, like real teletext. */
  onSelect?: (b: Broadcast) => void;
  /** This channel's best-covered other day (⭐ link in the header) and where the link lands. */
  bestDay?: { date: string; score: number };
  bestDayHref?: string;
  /** Assumed day: only regular slots are known. */
  assumed?: boolean;
  /** Switch to the overview page P300. */
  onOverview?: () => void;
  /** Shown instead of the date (e.g. "Lückenlos": not the programme of a real day). */
  label?: string;
  /** Match dots and their legend; off where every slot was picked to fit its video ("Lückenlos"). */
  showMatch?: boolean;
  /** Share a show (time, channel, date): a button on each entry, shown on hover or focus. */
  onShare?: (b: Broadcast) => void;
  /** The day listing for reading and printing (its own row); absent for built programmes. */
  listingHref?: string;
  /** The TV modes (teletext buttons) below the day listing. */
  modes?: React.ReactNode;
  /** Bottom line, e.g. the day's "x % mit Video". */
  summary?: React.ReactNode;
}

/** Teletext-style programme guide for the tuned channel (pages P301…). */
export function Teletext({
  day,
  channel,
  broadcasts,
  current,
  onSelect,
  bestDay,
  bestDayHref,
  assumed,
  onOverview,
  label,
  showMatch = true,
  onShare,
  listingHref,
  modes,
  summary,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(".tt-row.cur");
    if (!list || !row) return;
    // Relative to the list (offsetTop would be relative to the positioned entry, i.e. 0).
    const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 60;
    if (Math.abs(list.scrollTop - top) > 120) list.scrollTop = top;
  }, [channel.id, current?.id]);

  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${day.date}T00:00:00Z`),
  );

  return (
    <section className="tt" aria-label="Videotext Programmübersicht">
      <div className="tt-head">
        <span>P{300 + channel.displayNumber}</span>
        <span>{channel.name}</span>
        <span>
          {bestDay && !label && (
            <Link
              className="tt-best"
              href={bestDayHref ?? `/tag/${bestDay.date}`}
              title={`Bester ${channel.name}-Tag: ${formatTvDayShort(bestDay.date)} (${Math.round(bestDay.score * 100)} % mit Video)`}
              aria-label={`Bester ${channel.name}-Tag`}
            >
              ⭐
            </Link>
          )}
          {label ?? formatTvDayShort(day.date)}
        </span>
      </div>
      <div className="tt-title">
        {channel.name} · {label ?? weekday}
        {onOverview && (
          <button type="button" className="tt-tab" onClick={onOverview} title="Übersicht aller Sender (Taste T)">
            P300 Übersicht ▸
          </button>
        )}
      </div>
      {assumed && !label && <div className="tt-assumed">Angenommen: nur regelmäßige Sendeplätze</div>}
      <ul className="tt-list" ref={listRef}>
        {broadcasts.map((b) => {
          const isCurrent = b.id === current?.id;
          const content = (
            <>
              <span className="tm">{formatClock(b.startMin)}</span>
              <span>{b.title}</span>
              {showMatch && (
                <span
                  className={`m m-${matchLevelOf(day, b)}`}
                  title={MATCH_HINT[matchLevelOf(day, b)]}
                  aria-label={MATCH_HINT[matchLevelOf(day, b)]}
                >
                  {MATCH_MARK[matchLevelOf(day, b)]}
                </span>
              )}
              {b.description && <span className="sub2">{b.description}</span>}
            </>
          );
          return (
            <li key={b.id} className="tt-entry">
              {onSelect ? (
                <button
                  className={`tt-row${isCurrent ? " cur" : ""}`}
                  onClick={() => onSelect(b)}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  {content}
                </button>
              ) : (
                <div className={`tt-row readonly${isCurrent ? " cur" : ""}`} aria-current={isCurrent ? "true" : undefined}>
                  {content}
                </div>
              )}
              {/* Next to the entry, not inside it: a button can't contain a button. */}
              <span className="tt-actions">
                <Link className="tt-share" href={`${showPath(b.title)}?tag=${day.date}`} title={`Alle Termine von „${b.title}“`} aria-label={`Alle Termine von „${b.title}“`}>
                  Termine
                </Link>
                {onShare && (
                  <button type="button" className="tt-share" onClick={() => onShare(b)} title={`${formatClock(b.startMin)} ${b.title} teilen`} aria-label={`„${b.title}“ um ${formatClock(b.startMin)} teilen`}>
                    Teilen
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {showMatch && (
        <div className="tt-foot">
          <span>🟢 genau</span>
          <span>🟡 gleiches Jahr</span>
          <span>🔵 ähnlich</span>
          <span>❌ fehlt</span>
        </div>
      )}
      {listingHref && (
        <Link className="tt-listing" href={listingHref} title="Das ganze Programm des Tages zum Lesen und Drucken">
          ▸ Programm des Tages
        </Link>
      )}
      {modes}
      {summary && <div className="tt-summary">{summary}</div>}
    </section>
  );
}

/**
 * Teletext P300 "Jetzt / Danach": what's on everywhere, one row per channel. A click tunes that
 * channel (always allowed – only jumping in time is restricted in "Wie damals" mode).
 */
export function TeletextOverview({
  day,
  tvMin,
  tunedSlot,
  onTune,
  onChannelPage,
  label,
  showMatch = true,
  listingHref,
  modes,
}: {
  day: TvDay;
  tvMin: number | null;
  tunedSlot: number;
  onTune: (slot: number) => void;
  onChannelPage: () => void;
  /** Shown instead of the date. */
  label?: string;
  showMatch?: boolean;
  /** The day listing for reading and printing; absent for built programmes. */
  listingHref?: string;
  modes?: React.ReactNode;
}) {
  // Recomputed once a minute, not every second.
  const minute = tvMin ?? 360;
  const rows = useMemo(() => nowAndNextByChannel(day, minute), [day, minute]);
  return (
    <section className="tt" aria-label="Videotext Übersicht: Jetzt und Danach">
      <div className="tt-head">
        <span>P300</span>
        <span>Übersicht</span>
        <span>{label ?? formatTvDayShort(day.date)}</span>
      </div>
      <div className="tt-title">
        Jetzt · {formatClock(minute)} Uhr
        <button type="button" className="tt-tab" onClick={onChannelPage} title="Programm des eingestellten Senders (Taste T)">
          ◂ Sender
        </button>
      </div>
      <ul className="tt-list tt-overview">
        {rows.map(({ channel, now, next }) => {
          const level = now && showMatch ? matchLevelOf(day, now) : null;
          const tuned = channel.displayNumber === tunedSlot;
          // Number and name tune the channel; a show's title opens its page with all airings.
          const show = (b: Broadcast) => (
            <Link href={`${showPath(b.title)}?tag=${day.date}`} title={`Alle Termine von „${b.title}“`}>
              {b.title}
            </Link>
          );
          return (
            <li key={channel.id} className={`tt-row tt-ov${tuned ? " cur" : ""}`}>
              <button
                type="button"
                className="ov-tune"
                onClick={() => onTune(channel.displayNumber)}
                title={`${channel.displayNumber} ${channel.name} einschalten`}
                aria-pressed={tuned}
              >
                <span className="tm">{channel.displayNumber}</span>
                <span className="ov-name">{channel.name}</span>
                {level && (
                  <span className={`m m-${level}`} title={MATCH_HINT[level]} aria-label={MATCH_HINT[level]}>
                    {MATCH_MARK[level]}
                  </span>
                )}
              </button>
              <span className="ov-now">
                {now ? (
                  <>
                    <b>JETZT</b> {formatClock(now.startMin)} {show(now)}
                  </>
                ) : (
                  <b>–</b>
                )}
              </span>
              {next && (
                <span className="ov-next">
                  <b>DANACH</b> {formatClock(next.startMin)} {show(next)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {listingHref && (
        <Link className="tt-listing" href={listingHref} title="Das ganze Programm des Tages zum Lesen und Drucken">
          ▸ Programm des Tages
        </Link>
      )}
      {modes}
    </section>
  );
}

/** "1991-01-17" → "17.01.91" (teletext is short on room). */
const shortDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}`;
const KIND_MARK: Record<HistoryEvent["kind"], string> = { politik: "", gesellschaft: "", pop: "♪" };

/**
 * Teletext P400 "Chronik": the events of the decade. A click opens the event's programme (every
 * station with its reports); the current one is highlighted. Pop-culture events carry a ♪.
 */
export function TeletextChronik({ current, onPick, onChannelPage }: { current: string; onPick: (id: string) => void; onChannelPage: () => void }) {
  return (
    <section className="tt" aria-label="Videotext Chronik: Ereignisse der 90er">
      <div className="tt-head">
        <span>P400</span>
        <span>Chronik</span>
        <span>1990–1999</span>
      </div>
      <div className="tt-title">
        Ereignisse
        <button type="button" className="tt-tab" onClick={onChannelPage} title="Programm des eingestellten Senders">
          ◂ Sender
        </button>
      </div>
      <ul className="tt-list">
        {HISTORY_EVENTS.map((e) => (
          <li key={e.id}>
            <button type="button" className={`tt-row tt-event${e.id === current ? " cur" : ""}`} onClick={() => onPick(e.id)} aria-pressed={e.id === current} title={e.summary}>
              <span className="tm">{shortDate(e.date)}</span>
              <span>
                {e.title} {KIND_MARK[e.kind] && <span aria-label="Popkultur">{KIND_MARK[e.kind]}</span>}
              </span>
              <span className="sub2">{e.summary}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="tt-note">Berichte aus den Tagen um das Ereignis – jeder Sender mit seinen Aufnahmen.</p>
    </section>
  );
}
