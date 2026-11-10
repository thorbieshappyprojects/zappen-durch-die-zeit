/**
 * Programme slots of the TV set and when each station was on air in Germany.
 * Day data (seed/DB) says what a channel broadcast; this registry says whether
 * a slot's station existed at all on a given date ("gab es noch nicht").
 */
import type { TvDay } from "./types";

export interface Station {
  slug: string;
  slot: number;
  /**
   * Display name on every day: the name the station carried for most of 1990–2000
   * (ProSieben from Oct 1994, Kabel 1 from Dec 1994, WDR Fernsehen from 1994, N3 1989–2001).
   * Sources' spellings ("PRO 7", "Kabelkanal") stay in the import data only.
   */
  name: string;
  /** On-air periods (inclusive ISO dates); `to` absent = still on air. */
  onAir: { from: string; to?: string }[];
}

export const STATIONS: readonly Station[] = [
  { slug: "ard", slot: 1, name: "ARD", onAir: [{ from: "1954-11-01" }] },
  { slug: "zdf", slot: 2, name: "ZDF", onAir: [{ from: "1963-04-01" }] },
  { slug: "sat-1", slot: 3, name: "SAT.1", onAir: [{ from: "1984-01-01" }] },
  { slug: "rtl-plus", slot: 4, name: "RTL", onAir: [{ from: "1984-01-02" }] },
  { slug: "rtl-2", slot: 5, name: "RTL II", onAir: [{ from: "1993-03-06" }] },
  { slug: "tele-5", slot: 6, name: "Tele 5", onAir: [{ from: "1988-01-11", to: "1992-12-31" }, { from: "2002-01-28" }] },
  { slug: "pro-7", slot: 7, name: "ProSieben", onAir: [{ from: "1989-01-01" }] },
  { slug: "super-rtl", slot: 8, name: "Super RTL", onAir: [{ from: "1995-04-28" }] },
  { slug: "nickelodeon", slot: 9, name: "Nickelodeon", onAir: [{ from: "1995-06-05", to: "1998-05-31" }, { from: "2005-09-01" }] },
  { slug: "vox", slot: 10, name: "VOX", onAir: [{ from: "1993-01-25" }] },
  // Started on 29.02.1992 as "Der Kabelkanal", renamed Kabel 1 in 1995.
  { slug: "kabel-1", slot: 11, name: "Kabel 1", onAir: [{ from: "1992-02-29" }] },
  // Public regional/cultural channels (data only where a source lists them).
  { slug: "3sat", slot: 12, name: "3sat", onAir: [{ from: "1984-12-01" }] },
  { slug: "n3", slot: 13, name: "N3", onAir: [{ from: "1965-01-04" }] },
  { slug: "wdr", slot: 14, name: "WDR Fernsehen", onAir: [{ from: "1965-12-17" }] },
  { slug: "mdr", slot: 15, name: "MDR", onAir: [{ from: "1992-01-01" }] },
  // Music TV: MTV Europe was on German cable from its launch; VIVA started on 1 December 1993.
  { slug: "mtv", slot: 16, name: "MTV", onAir: [{ from: "1987-08-01" }] },
  { slug: "viva", slot: 17, name: "VIVA", onAir: [{ from: "1993-12-01" }] },
];

export function stationBySlug(slug: string): Station | undefined {
  return STATIONS.find((s) => s.slug === slug);
}

/** The day with every channel named as in the registry (see `Station.name`). */
export function withStationNames(day: TvDay): TvDay {
  return { ...day, channels: day.channels.map((c) => ({ ...c, name: stationBySlug(c.id)?.name ?? c.name })) };
}

export function stationAtSlot(slot: number): Station | undefined {
  return STATIONS.find((s) => s.slot === slot);
}

export type StationStatus =
  | { kind: "on_air" }
  | { kind: "not_yet"; startsOn: string }
  | { kind: "paused"; endedOn: string; resumesOn: string }
  | { kind: "ended"; endedOn: string };

/** Whether a station was on air on `date` (ISO dates compare lexicographically). */
export function stationStatus(station: Station, date: string): StationStatus {
  const periods = station.onAir;
  if (periods.some((p) => p.from <= date && (!p.to || date <= p.to))) return { kind: "on_air" };
  const next = periods.find((p) => p.from > date);
  const previous = [...periods].reverse().find((p) => p.to && p.to < date);
  if (next && previous) return { kind: "paused", endedOn: previous.to!, resumesOn: next.from };
  if (next) return { kind: "not_yet", startsOn: next.from };
  return { kind: "ended", endedOn: previous!.to! };
}

function formatLongDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y!, m! - 1, d!)),
  );
}

/** German explanation for a station that was off air on `date`, or null if it was on air. */
export function offAirMessage(station: Station, date: string): { headline: string; detail: string } | null {
  const status = stationStatus(station, date);
  const day = formatLongDate(date);
  switch (status.kind) {
    case "on_air":
      return null;
    case "not_yet":
      return { headline: `${station.name} gab es am ${day} noch nicht.`, detail: `Sendestart: ${formatLongDate(status.startsOn)}` };
    case "paused":
      return {
        headline: `${station.name} war am ${day} nicht auf Sendung.`,
        detail: `Sendeschluss ${formatLongDate(status.endedOn)}, wieder ab ${formatLongDate(status.resumesOn)}`,
      };
    case "ended":
      return { headline: `${station.name} gab es am ${day} nicht mehr.`, detail: `Sendeschluss: ${formatLongDate(status.endedOn)}` };
  }
}
