/**
 * "Chronik": events of the decade, each as a programme of its own. Every station that covered the
 * event gets a channel with its recordings from the days around it – news, specials, magazines,
 * talk shows – so zapping compares how ARD, RTL & Co. reported it.
 *
 * Selection is automatic: exact recordings (this very broadcast) aired in the event's window whose
 * title is of a reporting kind. Viewers flag unrelated videos ("Passt nicht zum Ereignis"); a
 * moderator takes them out of that event (table event_exclusion). The full list of candidate events,
 * with the ones not built yet for lack of material, is in docs/EVENTS.md.
 */
import type { PoolVideo } from "./seamless";
import { PUBLIC_STATIONS } from "./themes";
import { STATIONS } from "./stations";
import { addDays, formatClock, formatTvDayDate, TV_DAY_END_MIN, TV_DAY_START_MIN } from "./time";
import type { Broadcast, Channel, MediaCandidate, TvDay } from "./types";

export type EventKind = "politik" | "gesellschaft" | "pop";

export interface HistoryEvent {
  /** URL slug (?ereignis=…). */
  id: string;
  title: string;
  /** The day it happened (YYYY-MM-DD). */
  date: string;
  kind: EventKind;
  /** One sentence for the teletext page. */
  summary: string;
  /** Recordings from this many days before the date count (default 1: the run-up, e.g. an ultimatum). */
  daysBefore?: number;
  /** … and up to this many days after it (default 10). */
  daysAfter?: number;
  /** Further show titles that report on this event (e.g. sport or music shows for a match or a band). */
  extra?: RegExp;
}

/** The tab: label, icon, hover text. */
export const CHRONIK = {
  label: "Chronik",
  icon: "📰",
  description: "Ereignisse der 90er, wie das Fernsehen darüber berichtete – Nachrichten, Sondersendungen, Talk.",
} as const;

/** Events with material (docs/EVENTS.md, status ✅), oldest first. */
export const HISTORY_EVENTS: readonly HistoryEvent[] = [
  {
    id: "volkskammerwahl-1990",
    title: "Volkskammerwahl in der DDR",
    date: "1990-03-18",
    kind: "politik",
    summary: "Die erste freie Wahl in der DDR – die Allianz für Deutschland gewinnt deutlich.",
  },
  {
    id: "waehrungsunion-1990",
    title: "Währungsunion",
    date: "1990-07-01",
    kind: "politik",
    summary: "Die D-Mark wird Zahlungsmittel in der DDR.",
  },
  {
    id: "wm-finale-1990",
    title: "Deutschland wird Weltmeister",
    date: "1990-07-08",
    kind: "pop",
    summary: "1:0 gegen Argentinien in Rom – der dritte WM-Titel.",
    extra: /sportschau|sportstudio|sport-studio|fußball|wm 90|weltmeisterschaft/i,
  },
  {
    id: "kuwait-1990",
    title: "Irak besetzt Kuwait",
    date: "1990-08-02",
    kind: "politik",
    summary: "Der Einmarsch, der zum Golfkrieg führt.",
  },
  {
    id: "bundestagswahl-1990",
    title: "Erste gesamtdeutsche Bundestagswahl",
    date: "1990-12-02",
    kind: "politik",
    summary: "Helmut Kohl bleibt Kanzler, nun des vereinten Deutschlands.",
  },
  {
    id: "golfkrieg-1991",
    title: "Der Golfkrieg beginnt",
    date: "1991-01-17",
    kind: "politik",
    summary: "Operation Desert Storm: Luftangriffe auf den Irak.",
    daysAfter: 14,
  },
  {
    id: "rohwedder-1991",
    title: "Mord an Detlev Rohwedder",
    date: "1991-04-01",
    kind: "politik",
    summary: "Der Chef der Treuhandanstalt wird in Düsseldorf erschossen.",
  },
  {
    id: "putsch-moskau-1991",
    title: "Putsch in Moskau",
    date: "1991-08-19",
    kind: "politik",
    summary: "Hardliner setzen Gorbatschow fest – nach drei Tagen scheitert der Putsch.",
  },
  {
    id: "hoyerswerda-1991",
    title: "Ausschreitungen in Hoyerswerda",
    date: "1991-09-17",
    kind: "gesellschaft",
    summary: "Tagelange rassistische Angriffe auf ein Wohnheim in Sachsen.",
  },
  {
    id: "bosnien-1992",
    title: "Krieg in Bosnien",
    date: "1992-04-06",
    kind: "politik",
    summary: "Anerkennung Bosnien-Herzegowinas, Beginn der Belagerung Sarajevos.",
  },
  {
    id: "seles-1993",
    title: "Attentat auf Monica Seles",
    date: "1993-04-30",
    kind: "pop",
    summary: "Die Weltranglistenerste wird in Hamburg auf dem Tennisplatz niedergestochen.",
    extra: /sport|tennis/i,
  },
  {
    id: "take-that-1996",
    title: "Take That trennen sich",
    date: "1996-02-13",
    kind: "pop",
    summary: "Die Boyband gibt ihre Auflösung bekannt – Fans in Tränen, Sorgentelefone.",
    extra: /top of the pops|bravo|viva|mtv|exclusiv|explosiv|leute|boulevard|schreinemakers/i,
  },
  {
    id: "diana-1997",
    title: "Tod von Prinzessin Diana",
    date: "1997-08-31",
    kind: "gesellschaft",
    summary: "Unfall in Paris – die Welt trauert, die Beerdigung sehen Milliarden.",
    extra: /exclusiv|explosiv|leute|boulevard/i,
  },
  {
    id: "eschede-1998",
    title: "ICE-Unglück von Eschede",
    date: "1998-06-03",
    kind: "gesellschaft",
    summary: "Das schwerste Zugunglück der Bundesrepublik: 101 Tote.",
  },
  {
    id: "bundestagswahl-1998",
    title: "Regierungswechsel: Schröder gewinnt",
    date: "1998-09-27",
    kind: "politik",
    summary: "Nach 16 Jahren endet die Ära Kohl, Rot-Grün übernimmt.",
  },
  {
    id: "clinton-1998",
    title: "Impeachment gegen Bill Clinton",
    date: "1998-12-19",
    kind: "politik",
    summary: "Das Repräsentantenhaus erhebt Anklage – die Lewinsky-Affäre.",
  },
  {
    id: "sonnenfinsternis-1999",
    title: "Die totale Sonnenfinsternis",
    date: "1999-08-11",
    kind: "pop",
    summary: "Halb Deutschland mit Schutzbrille im Freien – Live-Sendungen den ganzen Tag.",
  },
  {
    id: "millennium-1999",
    title: "Millennium – und Jelzin tritt zurück",
    date: "1999-12-31",
    kind: "politik",
    summary: "Der Countdown ins Jahr 2000, am Mittag überraschend: Jelzin übergibt an Putin.",
    daysAfter: 1,
    extra: /2000|silvester|countdown|millennium/i,
  },
];

export const eventById = (id: string | null | undefined): HistoryEvent | undefined => HISTORY_EVENTS.find((e) => e.id === id);

/** First and last air date of recordings that belong to the event. */
export function eventWindow(event: HistoryEvent): { from: string; to: string } {
  return { from: addDays(event.date, -(event.daysBefore ?? 1)), to: addDays(event.date, event.daysAfter ?? 10) };
}

/** Events whose window includes a date (for the hint on that day's TV). */
export function eventsAround(date: string): HistoryEvent[] {
  return HISTORY_EVENTS.filter((e) => {
    const w = eventWindow(e);
    return date >= w.from && date <= w.to;
  });
}

/** The event nearest to a date (the Chronik tab opens with it). */
export function nearestEvent(date: string): HistoryEvent {
  const t = Date.parse(date);
  return HISTORY_EVENTS.reduce((best, e) => (Math.abs(Date.parse(e.date) - t) < Math.abs(Date.parse(best.date) - t) ? e : best));
}

/** Kinds of reporting, by show title. Order matters only for the label. */
const REPORTING: Record<string, RegExp> = {
  news: /tagesschau|tagesthemen|^heute\b|heute[- ]?journal|heute nacht|nachrichten|news|rtl[- ]?aktuell|aktuell\b|nachtjournal|journal|deutschland heute|morgenmagazin|punkt (5|6|9|12)|sat\.?1[- ]?blick|wochenspiegel/i,
  special: /brennpunkt|spezial|special|sondersendung|extra|live|wahl|hochrechnung|bericht|reportage|dokumentation/i,
  magazine:
    /spiegel ?tv|stern ?tv|report|monitor|panorama|frontal|kennzeichen d|weltspiegel|auslandsjournal|presseclub|talk im turm|zur sache|was nun|focus ?tv|akte|kontraste|fakt|plusminus|exclusiv|explosiv|taff|zak/i,
  talk: /talk|schreinemakers|boulevard bio|nach 9|kerner|beckmann|christiansen|maischberger|fliege|hans meiser|ilona christen|arabella|bärbel schäfer|vera am mittag|kiesbauer|ricky/i,
};
/** Matches a reporting pattern by accident, but never reports on current events. */
const NOT_REPORTING = /aktenzeichen|sesamstraße|sendung mit der maus|tigerenten(?! club spezial)|lotto|wetterkarte|börse/i;

/** The reporting kind of a show title for this event, or null if it isn't a reporting show. */
export function eventGenreOf(event: HistoryEvent, title: string): string | null {
  if (NOT_REPORTING.test(title)) return null;
  for (const [genre, rx] of Object.entries(REPORTING)) if (rx.test(title)) return genre;
  return event.extra?.test(title) ? "extra" : null;
}

/** Recordings of the event: exact ones aired in its window, of a reporting kind, not taken out by a moderator. */
export function eventVideos(event: HistoryEvent, pool: readonly PoolVideo[], excluded: ReadonlySet<string> = new Set()): PoolVideo[] {
  const { from, to } = eventWindow(event);
  return pool
    .filter(
      (v) =>
        v.media.matchLevel === "exact" &&
        v.media.embeddable &&
        v.date >= from &&
        v.date <= to &&
        !excluded.has(v.media.url) &&
        eventGenreOf(event, v.title) !== null,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}

/** A recording without a known length fills this many minutes (a typical news slot). */
const DEFAULT_LENGTH_MIN = 15;

/**
 * The event's programme on `day` (only its date and source are kept): one channel per station with
 * recordings, each playing them in the order they aired, again and again from 06:00 to 06:00.
 * Every slot says when it really ran ("Gesendet: Mittwoch, 16. Januar 1991, 22:30 Uhr").
 */
export function eventDay(day: TvDay, event: HistoryEvent, pool: readonly PoolVideo[], excluded?: ReadonlySet<string>): TvDay {
  const videos = eventVideos(event, pool, excluded);
  const channels: Channel[] = STATIONS.filter((st) => videos.some((v) => v.channelId === st.slug)).map((st) => ({
    id: st.slug,
    name: st.name,
    displayNumber: st.slot,
    isPrivate: !PUBLIC_STATIONS.has(st.slug),
  }));
  const broadcasts: Broadcast[] = [];
  const media: Record<string, MediaCandidate> = {};
  for (const ch of channels) {
    const own = videos.filter((v) => v.channelId === ch.id);
    for (let t = TV_DAY_START_MIN, i = 0; t < TV_DAY_END_MIN; i++) {
      const v = own[i % own.length]!;
      const len = Math.max(1, Math.round((v.media.durationS ?? DEFAULT_LENGTH_MIN * 60) / 60));
      const end = Math.min(t + len, TV_DAY_END_MIN);
      const id = `${ch.id}-${t}`;
      broadcasts.push({
        id,
        channelId: ch.id,
        startMin: t,
        endMin: end,
        title: v.title,
        description: `Gesendet: ${formatTvDayDate(v.date)}, ${formatClock(v.startMin)} Uhr`,
      });
      media[id] = v.media;
      t = end;
    }
  }
  return { ...day, channels, broadcasts, media };
}
