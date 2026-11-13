/**
 * Shows ("Sendungen"): all broadcasts with the same normalised title. Used by the search above the
 * guide and the show page /sendung/<slug>. Only real days count as airings (assumed days are derived).
 */
import { normalizeTitle } from "./titles";
import type { MatchLevel } from "./types";

/** URL slug of a show: its normalised title with dashes ("Die Simpsons" → "die-simpsons"). */
export function showSlug(title: string): string {
  return normalizeTitle(title).replace(/ /g, "-");
}

/** The normalised title a slug stands for (normalised titles contain no dashes), or null if malformed. */
export function showKeyFromSlug(slug: string): string | null {
  const key = slug.replace(/-/g, " ").trim();
  return key && normalizeTitle(key) === key ? key : null;
}

/** Path of a show's page. */
export const showPath = (title: string) => `/sendung/${encodeURIComponent(showSlug(title))}`;

/** Shortest query the search answers (shorter ones match half the database). */
export const SHOW_SEARCH_MIN_CHARS = 2;

/** One airing of a show, with the best video we have for it. */
export interface ShowAiring {
  date: string;
  channelId: string;
  channelName: string;
  startMin: number;
  title: string;
  description: string | null;
  matchLevel: MatchLevel;
  provider: string | null;
}

/** A search result: the show and the airing a click opens. */
export interface ShowHit {
  key: string;
  title: string;
  airings: number;
  withVideo: number;
  exact: number;
  firstDate: string;
  lastDate: string;
  channels: string[];
  open: { date: string; channelId: string; startMin: number };
}

/**
 * Search order: exact title first, then titles starting with the query, then word starts, then
 * the rest; within each, more airings with video first, then more airings.
 */
export function rankShowHits<T extends Pick<ShowHit, "key" | "withVideo" | "airings">>(hits: readonly T[], query: string): T[] {
  const q = normalizeTitle(query);
  const tier = (key: string) => (key === q ? 0 : key.startsWith(q) ? 1 : ` ${key}`.includes(` ${q}`) ? 2 : 3);
  return [...hits].sort(
    (a, b) => tier(a.key) - tier(b.key) || b.withVideo - a.withVideo || b.airings - a.airings || a.key.localeCompare(b.key, "de"),
  );
}
