/** Title normalisation for matching and trigram search. */

const REPEAT = /\(\s*wh\.?\s*\)/gi;
const CONTINUATION = /\(\s*fortsetzung\s*\)/gi;

/**
 * Lowercase, strip repeat/continuation markers, quotes and punctuation,
 * collapse whitespace. Umlauts and ß are kept (they matter for German search).
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(REPEAT, " ")
    .replace(CONTINUATION, " ")
    .toLowerCase()
    .replace(/['’‘`´„“”"«»‹›]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface BroadcastFlags {
  repeat?: true;
  blackAndWhite?: true;
  live?: true;
}

/** Derives listing flags (Wh., s/w, live) from title and description. */
export function broadcastFlags(title: string, description: string | null): BroadcastFlags {
  const text = `${title} ${description ?? ""}`;
  const flags: BroadcastFlags = {};
  if (/\(\s*wh\.?\s*\)|\bwh\. von\b/i.test(text)) flags.repeat = true;
  if (/(^|[\s·,(])s\/w([\s·,)]|$)/i.test(text)) flags.blackAndWhite = true;
  if (/(^|[\s·,(-])live([\s·,)]|$)/i.test(text)) flags.live = true;
  return flags;
}
