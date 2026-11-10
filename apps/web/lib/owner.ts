/** Owner details for Impressum, Datenschutzerklärung and the takedown contact (environment, see .env.example). */
export function owner() {
  const name = process.env.OWNER_NAME?.trim();
  const address = process.env.OWNER_ADDRESS?.trim();
  const email = process.env.OWNER_EMAIL?.trim();
  return { name, address, email, complete: Boolean(name && address && email) };
}

/** Public repository of this code (AGPL-3.0 § 13: visitors of the running site are offered the source). */
export function sourceUrl(): string {
  return process.env.SOURCE_URL?.trim() || "https://github.com/thorbieshappyprojects/zappen-durch-die-zeit";
}
