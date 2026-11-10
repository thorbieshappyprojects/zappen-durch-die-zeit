/**
 * TV-day time math. All wall-clock values are Europe/Berlin.
 *
 * A TV day runs 06:00 → 06:00. Positions within a TV day are expressed as
 * minutes (or seconds) from 00:00 of the TV day's calendar date, so 06:00 is
 * 360 and 01:30 after midnight is 1530. Values ≥ 1440 are broadcasts after
 * midnight that still belong to the previous TV day.
 */

export const TIMEZONE = "Europe/Berlin";
export const MINUTES_PER_DAY = 1440;
export const TV_DAY_START_MIN = 6 * 60;
export const TV_DAY_END_MIN = TV_DAY_START_MIN + MINUTES_PER_DAY;

const berlinParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockOf(instant: Date): WallClock {
  const parts: Record<string, number> = {};
  for (const p of berlinParts.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** Parses "HH:MM" (hours may exceed 23, e.g. "25:15") into minutes. */
export function parseHHMM(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid time "${value}"`);
  const minutes = Number(match[2]);
  if (minutes > 59) throw new Error(`Invalid time "${value}"`);
  return Number(match[1]) * 60 + minutes;
}

/** Formats minutes as wall-clock "HH:MM", wrapping past midnight (1530 → "01:30"). */
export function formatClock(minutes: number): string {
  const m = ((Math.floor(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Seconds since Berlin midnight for a real instant (0 … 86399). */
export function berlinClockSeconds(instant: Date): number {
  const w = wallClockOf(instant);
  return w.hour * 3600 + w.minute * 60 + w.second;
}

/** Maps a wall-clock second of day onto the TV day (00:00–05:59:59 → +24h). */
export function clockSecondsToTvDaySeconds(clockSeconds: number): number {
  const s = ((clockSeconds % 86400) + 86400) % 86400;
  return s < TV_DAY_START_MIN * 60 ? s + 86400 : s;
}

/** Maps a wall-clock minute of day onto the TV day (00:00–05:59 → +1440). */
export function clockToTvDayMin(clockMinutes: number): number {
  return Math.floor(clockSecondsToTvDaySeconds(clockMinutes * 60) / 60);
}

/**
 * Moves a TV-day position (seconds) by `deltaSeconds`, wrapping within the
 * 06:00 → 06:00 window (used for a manually tuned clock that keeps running).
 */
export function advanceTvDaySeconds(tvDaySeconds: number, deltaSeconds: number): number {
  const start = TV_DAY_START_MIN * 60;
  const span = MINUTES_PER_DAY * 60;
  return start + ((((tvDaySeconds + deltaSeconds - start) % span) + span) % span);
}

/** Position of a real instant within its TV day, in seconds (21600 … 107999). */
export function tvDaySecondsAt(instant: Date): number {
  return clockSecondsToTvDaySeconds(berlinClockSeconds(instant));
}

/** Calendar date ("YYYY-MM-DD") of the TV day a real instant belongs to. */
export function tvDayDateOf(instant: Date): string {
  const w = wallClockOf(instant);
  const date = isoDate(w.year, w.month, w.day);
  return w.hour < TV_DAY_START_MIN / 60 ? addDays(date, -1) : date;
}

/** Adds days to an ISO calendar date (pure calendar math, no time zone). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parseIsoDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Real instant of a TV-day position: `tvDate` at 00:00 Berlin plus `tvDayMin`
 * wall-clock minutes. Handles CET/CEST. For wall times skipped by a DST
 * switch, the result lands on the instant just after the gap.
 */
export function tvDayMinToInstant(tvDate: string, tvDayMin: number): Date {
  const [y, m, d] = parseIsoDate(tvDate);
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, tvDayMin);
  // Iterate: guess offset, read the Berlin offset at the guess, correct.
  let guess = wallAsUtc - 60 * 60 * 1000;
  for (let i = 0; i < 3; i++) {
    const offset = berlinOffsetMs(new Date(guess));
    const next = wallAsUtc - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/** Berlin UTC offset in milliseconds at a given instant (+1h CET, +2h CEST). */
export function berlinOffsetMs(instant: Date): number {
  const w = wallClockOf(instant);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** German long date for a TV day, e.g. "Mittwoch, 13. März 1991". */
export function formatTvDayDate(tvDate: string): string {
  const [y, m, d] = parseIsoDate(tvDate);
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** German teletext-style short date, e.g. "Mi 13.03.91". */
export function formatTvDayShort(tvDate: string): string {
  const [y, m, d] = parseIsoDate(tvDate);
  const weekday = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short" })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(".", "");
  return `${weekday} ${pad(d)}.${pad(m)}.${String(y).slice(-2)}`;
}

function parseIsoDate(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid date "${date}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" that is a real calendar date (2001-02-30 is not). */
export function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}
