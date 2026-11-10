/**
 * Admin hints: when has a hidden station gathered enough material to be shown again?
 * "Critical mass" means all three: enough videos, from enough different shows (as "Lückenlos"
 * needs to fill a day), and coverage of its real days at least as good as the weakest shown station.
 */
import { SEAMLESS_MIN_TITLES } from "./seamless";

export const SHOW_STATION_MIN_VIDEOS = 50;
export const SHOW_STATION_MIN_SHOWS = SEAMLESS_MIN_TITLES;

export interface StationFigures {
  slug: string;
  name: string;
  hidden: boolean;
  /** Coverage of its real days (core `coverageScore`). */
  score: number;
  videos: number;
  shows: number;
}

export interface StationRecommendation {
  slug: string;
  name: string;
  /** All criteria met: show the station again. */
  ready: boolean;
  checks: { label: string; met: boolean; value: string }[];
}

/** One entry per hidden station, ready ones first. */
export function stationRecommendations(stations: readonly StationFigures[]): StationRecommendation[] {
  const shown = stations.filter((s) => !s.hidden && s.videos > 0);
  const weakest = shown.length ? Math.min(...shown.map((s) => s.score)) : 0;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  return stations
    .filter((s) => s.hidden)
    .map((s) => {
      const checks = [
        { label: `mind. ${SHOW_STATION_MIN_VIDEOS} Videos`, met: s.videos >= SHOW_STATION_MIN_VIDEOS, value: `${s.videos}` },
        { label: `aus mind. ${SHOW_STATION_MIN_SHOWS} Sendungen`, met: s.shows >= SHOW_STATION_MIN_SHOWS, value: `${s.shows}` },
        {
          label: `Abdeckung wie der schwächste eingeblendete Sender (${pct(weakest)})`,
          met: s.score >= weakest,
          value: pct(s.score),
        },
      ];
      return { slug: s.slug, name: s.name, ready: checks.every((c) => c.met), checks };
    })
    .sort((a, b) => Number(b.ready) - Number(a.ready) || b.checks.filter((c) => c.met).length - a.checks.filter((c) => c.met).length);
}
