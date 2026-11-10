/**
 * Notes on videos are shown on the site. They name an uploader by channel name at most, never by
 * e-mail address (Internet Archive lists many uploaders only by their address).
 */
export const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** The note without e-mail addresses: an "Upload: <address>" part goes completely. */
export function withoutEmailAddresses(note: string): string;
export function withoutEmailAddresses(note: string | null | undefined): string | null | undefined;
export function withoutEmailAddresses(note: string | null | undefined) {
  if (!note) return note;
  const address = EMAIL_ADDRESS.source;
  return note
    .replace(new RegExp(`\\s*·?\\s*Upload: ${address}(?:,\\s*${address})*`, "g"), "")
    .replace(EMAIL_ADDRESS, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
