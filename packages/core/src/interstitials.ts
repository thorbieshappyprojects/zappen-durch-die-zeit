/**
 * Interstitials: what plays between programmes – ad breaks and single spots, station idents,
 * announcers, sign-off. Pure rules; data comes from the `interstitial` table (see packages/db).
 */
import { adBreakFor, broadcastsOf, isInAdWindow } from "./schedule";
import type { Broadcast, Channel, Provider, TvDay } from "./types";

export type InterstitialKind = "ad_break" | "ident" | "announcer" | "trailer" | "sign_off" | "sign_on" | "test_card";

export interface Interstitial {
  id: number;
  /** null = not tied to one channel (e.g. the pool of single 90s ad spots). */
  channelId: string | null;
  kind: InterstitialKind;
  url: string;
  provider: Provider;
  providerVideoId: string | null;
  /** Segment of a longer recording, seconds. */
  inS: number | null;
  outS: number | null;
  durationS: number | null;
  airedOn: string | null;
  airedPeriod: string | null;
  validFrom: string | null;
  validTo: string | null;
  rank: number;
  note: string;
}

/** One clip to play: an interstitial, or the channel's ad break from the day data. */
export interface Segment {
  kind: InterstitialKind;
  url: string;
  provider: Provider;
  providerVideoId: string;
  inS: number | null;
  outS: number | null;
  note: string;
}

// Configurable rules (doc M6 F4), not hard-coded in the UI.
/** ARD/ZDF had advertising only in the early evening, until 20:00. */
export const PUBLIC_ADS_FROM_MIN = 17 * 60;
export const PUBLIC_ADS_UNTIL_MIN = 20 * 60;
/** Announcer clip before the evening's main programme starts in this window. */
export const ANNOUNCER_FROM_MIN = 19 * 60 + 58;
export const ANNOUNCER_UNTIL_MIN = 20 * 60 + 15;
/** Sign-off plays during these minutes after the last broadcast of the day. */
export const SIGN_OFF_WINDOW_MIN = 10;
/** A channel's list that ends earlier is incomplete data, not a real "Sendeschluss". */
export const SIGN_OFF_EARLIEST_MIN = 22 * 60;
/** Pool items (no channel) must be recorded within this many years of the day. */
export const POOL_MAX_YEARS_APART = 2;

const yearOf = (i: Interstitial) => Number((i.airedOn ?? i.airedPeriod ?? "").slice(0, 4)) || null;

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * The interstitial of a kind for a channel and date: one recorded on that very day wins, then an
 * item whose validity window covers the date; otherwise the nearest year (pool items: at most 2 years apart); then rank; among
 * equals a stable pick by `seed`, so a pool varies between slots but not between renders.
 */
export function pickInterstitial(
  list: readonly Interstitial[],
  opts: { kind: InterstitialKind; channelId: string; date: string; pool?: boolean; seed: string },
): Interstitial | null {
  const year = Number(opts.date.slice(0, 4));
  const candidates = list.filter(
    (i) => i.kind === opts.kind && i.providerVideoId && (i.channelId === opts.channelId || (opts.pool && i.channelId === null)),
  );
  const valid = candidates.filter((i) => i.validFrom || i.validTo);
  const covering = valid.filter((i) => (!i.validFrom || i.validFrom <= opts.date) && (!i.validTo || opts.date <= i.validTo));
  // A recording from this very day beats everything else (the channel's own item first).
  const sameDay = candidates.filter((i) => i.airedOn === opts.date);
  const ownSameDay = sameDay.filter((i) => i.channelId === opts.channelId);
  let pickFrom = ownSameDay.length ? ownSameDay : sameDay.length ? sameDay : covering;
  if (!pickFrom.length) {
    const undated = candidates.filter((i) => !i.validFrom && !i.validTo);
    const distance = (i: Interstitial) => {
      const y = yearOf(i);
      return y === null ? 100 : Math.abs(y - year);
    };
    const usable = undated.filter((i) => i.channelId !== null || distance(i) <= POOL_MAX_YEARS_APART);
    if (!usable.length) return null;
    const nearest = Math.min(...usable.map(distance));
    pickFrom = usable.filter((i) => distance(i) === nearest);
  }
  const bestRank = Math.min(...pickFrom.map((i) => i.rank));
  const top = pickFrom.filter((i) => i.rank === bestRank).sort((a, b) => a.id - b.id);
  return top[hash(opts.seed) % top.length] ?? null;
}

const segment = (i: Interstitial): Segment => ({
  kind: i.kind,
  url: i.url,
  provider: i.provider,
  providerVideoId: i.providerVideoId!,
  inS: i.inS,
  outS: i.outS,
  note: i.note,
});

/**
 * What plays at the end of `broadcast` (in its ad window: the last minutes of a programme of
 * 20+ minutes), in order:
 * - private channels: the channel's ad break, else a single spot from the pool → ident
 * - ARD/ZDF/Dritte: a spot from the pool only before 20:00 (17:00–20:00) → ident → announcer
 *   when the next programme starts 19:58–20:15
 */
export function interstitialsFor(day: TvDay, channel: Channel, broadcast: Broadcast, tvDayMin: number): Segment[] {
  if (!isInAdWindow(broadcast, tvDayMin)) return [];
  const list = day.interstitials ?? [];
  const seed = `${day.date}|${channel.id}|${broadcast.id}`;
  const pick = (kind: InterstitialKind, pool = false) => pickInterstitial(list, { kind, channelId: channel.id, date: day.date, pool, seed });
  const out: Segment[] = [];
  if (channel.isPrivate) {
    const own = adBreakFor(day, channel);
    if (own?.providerVideoId)
      out.push({ kind: "ad_break", url: own.url, provider: own.provider, providerVideoId: own.providerVideoId, inS: null, outS: null, note: own.note });
    else {
      const spot = pick("ad_break", true);
      if (spot) out.push(segment(spot));
    }
  } else if (broadcast.endMin > PUBLIC_ADS_FROM_MIN && broadcast.endMin <= PUBLIC_ADS_UNTIL_MIN) {
    const spot = pick("ad_break", true);
    if (spot) out.push(segment(spot));
  }
  const ident = pick("ident");
  if (ident) out.push(segment(ident));
  if (!channel.isPrivate) {
    const next = broadcastsOf(day, channel.id).find((b) => b.startMin >= broadcast.endMin);
    if (next && next.startMin >= ANNOUNCER_FROM_MIN && next.startMin <= ANNOUNCER_UNTIL_MIN) {
      const announcer = pick("announcer");
      if (announcer) out.push(segment(announcer));
    }
  }
  return out;
}

/** "Sendeschluss": the sign-off clip in the first minutes after the channel's last broadcast. */
export function signOffFor(day: TvDay, channel: Channel, tvDayMin: number): Segment | null {
  const list = broadcastsOf(day, channel.id);
  const last = list[list.length - 1];
  if (!last || last.endMin < SIGN_OFF_EARLIEST_MIN) return null;
  if (tvDayMin < last.endMin || tvDayMin >= last.endMin + SIGN_OFF_WINDOW_MIN) return null;
  const item = pickInterstitial(day.interstitials ?? [], { kind: "sign_off", channelId: channel.id, date: day.date, seed: `${day.date}|${channel.id}|end` });
  return item ? segment(item) : null;
}
