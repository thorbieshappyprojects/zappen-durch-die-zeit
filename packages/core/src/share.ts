/** Shareable deep links: /tag/YYYY-MM-DD?sender=<slug>&zeit=HH:MM&programm=<theme>&ereignis=<event> (all optional). */
import { eventById } from "./events";
import { THEMES, type ThemeId } from "./themes";
import { clockToTvDayMin, formatClock } from "./time";

export interface ShareTarget {
  /** Station slug to tune (a channel of the day or a station without programme that day). */
  channelId?: string;
  /** TV-day minute (06:00 = 360 … 05:59 = 1799) to start at instead of the live time. */
  tvDayMin?: number;
  /** A theme programme (Kinderprogramm, Talk Shows) instead of the day's TV. */
  programme?: ThemeId;
  /** A Chronik event (core events.ts): the TV opens the Chronik with it. */
  event?: string;
}

/**
 * Reads `sender`, `zeit`, `programm` and `ereignis`. Unknown slugs, themes, events and malformed times are ignored.
 * Times 00:00–05:59 belong to the night after the date (the TV day runs 06:00 → 06:00).
 */
export function parseShareParams(
  params: { sender?: string | null; zeit?: string | null; programm?: string | null; ereignis?: string | null },
  knownSlugs: readonly string[],
): ShareTarget {
  const target: ShareTarget = {};
  if (params.sender && knownSlugs.includes(params.sender)) target.channelId = params.sender;
  const m = /^(\d{1,2}):(\d{2})$/.exec(params.zeit ?? "");
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) target.tvDayMin = clockToTvDayMin(Number(m[1]) * 60 + Number(m[2]));
  if (params.programm && params.programm in THEMES) target.programme = params.programm as ThemeId;
  else if (eventById(params.ereignis)) target.event = params.ereignis!;
  return target;
}

/** Path (with query) of a deep link; `origin` is prepended when given. */
export function shareUrl(date: string, target: ShareTarget = {}, origin = ""): string {
  const q = new URLSearchParams();
  if (target.channelId) q.set("sender", target.channelId);
  if (target.tvDayMin !== undefined) q.set("zeit", formatClock(target.tvDayMin));
  if (target.programme) q.set("programm", target.programme);
  else if (target.event) q.set("ereignis", target.event);
  const query = q.toString();
  return `${origin}/tag/${date}${query ? `?${query}` : ""}`;
}
