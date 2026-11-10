/** Community contributions: validation, spam heuristics and schedule-text parsing (pure, no I/O). */
import { providerOf } from "./providers";
import { parseHHMM } from "./time";

export type ContributionKind = "video_link" | "schedule" | "note";

export interface ContributionInput {
  kind: ContributionKind;
  /** TV day, "YYYY-MM-DD". Required for video links and schedules. */
  tvDate?: string;
  /** Channel slug (e.g. "rtl-plus") or free text for channels we don't know yet. */
  channel?: string;
  /** Broadcast start "HH:MM" (video links). */
  start?: string;
  /** Broadcast title the link belongs to (video links). */
  title?: string;
  url?: string;
  /** Pasted schedule (one broadcast per line) or a free-text note. */
  body?: string;
  /** Where the data comes from, e.g. "HÖRZU 47/1998". */
  sourceInfo?: string;
  contributorName?: string;
  contributorEmail?: string;
  /** Number of attached files (photos/scans of TV guides, PDFs, text files). */
  attachments?: number;
  /** A video link that looks like an interstitial (announcer, sign-off, ident): its kind. */
  suggestedKind?: "announcer" | "sign_off" | "ident" | "ad_break";
}

/** Words that mark a link as interstitial material rather than a programme. */
const INTERSTITIAL_WORDS: [RegExp, NonNullable<ContributionInput["suggestedKind"]>][] = [
  [/sendeschlu(ss|ß)|nationalhymne|testbild/i, "sign_off"],
  [/ansager(in)?\b|ansage\b|programmansage/i, "announcer"],
  [/\bident\b|senderkennung|senderlogo|mainzelm(ä|ae)nnchen/i, "ident"],
  [/werbeblock|werbespot|werbung\b/i, "ad_break"],
];

/** The interstitial kind a submission's text suggests, if any. */
export function suggestedInterstitialKind(text: string): ContributionInput["suggestedKind"] {
  return INTERSTITIAL_WORDS.find(([re]) => re.test(text))?.[1];
}

export const LIMITS = {
  title: 200,
  body: 20_000,
  sourceInfo: 200,
  name: 80,
  email: 120,
  url: 500,
  linksInBody: 5,
  /** A real person needs a moment to fill in the form. */
  minFillSeconds: 4,
  /** Form tokens older than this are rejected (stale page / replay). */
  maxFillSeconds: 24 * 3600,
  perHour: 5,
  perDay: 20,
} as const;

/** Platforms accepted for video links (players we embed, plus Mediathek/streaming link-outs). */
const ACCEPTED_VIDEO_PROVIDERS = new Set(["youtube", "dailymotion", "archive", "vimeo", "zdf", "ard", "rtlplus", "joyn", "bundestag", "bpb"]);

const SPAM_WORDS = /\b(casino|viagra|cialis|crypto|bitcoin|forex|porn|xxx|escort|loan|kredit sofort|seo service|backlinks?|telegram ?@|whatsapp ?\+)\b/i;

export interface ValidationResult {
  ok: boolean;
  /** German messages for the form. */
  errors: string[];
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Checks required fields, formats and lengths per contribution kind. */
export function validateContribution(c: ContributionInput): ValidationResult {
  const errors: string[] = [];
  const tooLong = (v: string | undefined, max: number, label: string) => {
    if (v && v.length > max) errors.push(`${label} ist zu lang (max. ${max} Zeichen).`);
  };
  tooLong(c.title, LIMITS.title, "Der Titel");
  tooLong(c.body, LIMITS.body, "Der Text");
  tooLong(c.sourceInfo, LIMITS.sourceInfo, "Die Quellenangabe");
  tooLong(c.contributorName, LIMITS.name, "Der Name");
  tooLong(c.contributorEmail, LIMITS.email, "Die E-Mail-Adresse");
  tooLong(c.url, LIMITS.url, "Der Link");
  if (c.contributorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contributorEmail)) errors.push("Die E-Mail-Adresse sieht ungültig aus.");
  if (c.tvDate && !isIsoDate(c.tvDate)) errors.push("Das Datum ist ungültig.");
  if (c.tvDate && (c.tvDate < "1952-01-01" || c.tvDate > "2010-12-31")) errors.push("Das Datum liegt außerhalb des Zeitraums der Seite.");

  switch (c.kind) {
    case "video_link":
      if (!c.tvDate) errors.push("Bitte das Datum angeben.");
      if (!c.channel) errors.push("Bitte den Sender angeben.");
      if (!c.start || !/^\d{1,2}:\d{2}$/.test(c.start)) errors.push("Bitte die Anfangszeit als HH:MM angeben.");
      if (!c.url || !isHttpUrl(c.url)) errors.push("Bitte einen gültigen Link angeben.");
      else if (!ACCEPTED_VIDEO_PROVIDERS.has(providerOf(c.url)))
        errors.push("Bitte nur Links zu YouTube, Dailymotion, Internet Archive, Vimeo oder einer Mediathek.");
      break;
    case "schedule": {
      if (!c.tvDate) errors.push("Bitte das Datum angeben.");
      if (!c.channel) errors.push("Bitte den Sender angeben.");
      // Either typed lines or a photo/PDF/text file of the listing.
      const lines = parseScheduleText(c.body ?? "");
      if (lines.entries.length < 3 && !c.attachments)
        errors.push("Bitte mindestens drei Sendungen im Format „HH:MM Titel“ eintragen oder ein Foto/PDF der Programmseite anhängen.");
      if (!c.sourceInfo) errors.push("Bitte die Quelle angeben (z. B. „HÖRZU 47/1998“).");
      break;
    }
    case "note":
      if ((!c.body || c.body.trim().length < 10) && !c.attachments) errors.push("Bitte einen etwas ausführlicheren Hinweis schreiben.");
      break;
  }
  return { ok: errors.length === 0, errors };
}

export interface SpamSignals {
  /** Hidden field that humans never fill in. */
  honeypot?: string;
  /** Seconds between rendering the form and submitting it. */
  fillSeconds?: number;
}

/** Heuristic spam check. Returns the reasons; empty means "looks human". */
export function spamReasons(c: ContributionInput, signals: SpamSignals): string[] {
  const reasons: string[] = [];
  if (signals.honeypot) reasons.push("honeypot");
  if (signals.fillSeconds === undefined || signals.fillSeconds < LIMITS.minFillSeconds) reasons.push("too-fast");
  if (signals.fillSeconds !== undefined && signals.fillSeconds > LIMITS.maxFillSeconds) reasons.push("stale-form");
  const text = [c.title, c.body, c.sourceInfo, c.contributorName].filter(Boolean).join("\n");
  const links = text.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links > LIMITS.linksInBody) reasons.push("too-many-links");
  if (SPAM_WORDS.test(text) || (c.url && SPAM_WORDS.test(c.url))) reasons.push("spam-words");
  if (/<\s*(a|script|iframe|img)\b|\[url=/i.test(text)) reasons.push("markup");
  if (/(.)\1{14,}/.test(text)) reasons.push("repeated-chars");
  return reasons;
}

export interface ScheduleEntry {
  start: string;
  startMin: number;
  title: string;
  description: string | null;
}

/**
 * Parses pasted schedule text, one broadcast per line:
 * "20:15 Tatort – Kolportage, mit Michael Janisch" or "20.15 Uhr  Tatort | Kolportage".
 * Lines that don't start with a time are attached to the previous entry's description.
 */
export function parseScheduleText(text: string): { entries: ScheduleEntry[]; skipped: number } {
  const entries: ScheduleEntry[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d{1,2})[:.](\d{2})(?:\s*Uhr)?\s+(.+)$/.exec(line);
    if (!m) {
      const last = entries[entries.length - 1];
      if (last) last.description = last.description ? `${last.description} · ${line}` : line;
      else skipped++;
      continue;
    }
    const start = `${m[1]!.padStart(2, "0")}:${m[2]}`;
    let startMin: number;
    try {
      startMin = parseHHMM(start);
    } catch {
      skipped++;
      continue;
    }
    if (startMin >= 24 * 60) {
      skipped++;
      continue;
    }
    const [title, ...rest] = m[3]!.split(/\s+[–—|-]\s+|\s*\|\s*/);
    entries.push({ start, startMin, title: title!.trim(), description: rest.join(" · ").trim() || null });
  }
  return { entries, skipped };
}

/** Broadcast the visitor came from (prefilled when clicking "Video vorschlagen" in the TV). */
export interface SubmissionContext {
  tvDate?: string;
  channel?: string;
  start?: string;
  title?: string;
}

/** All links in a text that point to a platform we accept for videos. */
export function extractVideoUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  return urls
    .map((u) => u.replace(/[.,;:!?]+$/, ""))
    .filter((u) => {
      try {
        return ACCEPTED_VIDEO_PROVIDERS.has(providerOf(u));
      } catch {
        return false;
      }
    });
}

/**
 * Turns a free-form submission (one text field + files) into a typed contribution:
 * a video link if the text contains one, a schedule if it lists several "HH:MM Titel"
 * lines or only files were sent, otherwise a note. The moderator can still correct it.
 */
export function classifySubmission(body: string, attachments: number, context: SubmissionContext = {}): ContributionInput {
  const text = body.trim();
  const videoUrls = extractVideoUrls(text);
  const scheduleLines = parseScheduleText(text).entries.length;
  const base = { ...context, body: text || undefined, attachments };
  if (videoUrls.length && scheduleLines < 3)
    return { ...base, kind: "video_link", url: videoUrls[0], suggestedKind: suggestedInterstitialKind(text) };
  if (scheduleLines >= 3 || (attachments > 0 && !videoUrls.length && text.length < 200)) return { ...base, kind: "schedule" };
  return { ...base, kind: "note" };
}

/** Minimal checks for the free-form form: something must be there, nothing may be oversized. */
export function validateSubmission(c: ContributionInput): ValidationResult {
  const errors: string[] = [];
  if ((!c.body || c.body.trim().length < 3) && !c.attachments) errors.push("Bitte etwas eintragen oder eine Datei anhängen.");
  if (c.body && c.body.length > LIMITS.body) errors.push(`Der Text ist zu lang (max. ${LIMITS.body} Zeichen).`);
  if (c.contributorName && c.contributorName.length > LIMITS.name) errors.push("Der Name ist zu lang.");
  if (c.contributorEmail && (c.contributorEmail.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contributorEmail)))
    errors.push("Die E-Mail-Adresse sieht ungültig aus.");
  if (c.tvDate && !isIsoDate(c.tvDate)) errors.push("Das Datum ist ungültig.");
  // Context fields come from the TV's link; anything odd is a tampered URL, not a user mistake.
  if ((c.title?.length ?? 0) > LIMITS.title || (c.channel?.length ?? 0) > LIMITS.name || (c.start && !/^\d{1,2}:\d{2}$/.test(c.start)))
    errors.push("Der Bezug zur Sendung ist ungültig – bitte mit × entfernen.");
  return { ok: errors.length === 0, errors };
}
