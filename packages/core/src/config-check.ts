/**
 * Production configuration check (run once at server start, see apps/web/instrumentation.ts).
 * `fatal`: the server refuses to start. `adminDisabled`: the admin login stays off, with the reason.
 * Development is not checked.
 */
export const MIN_CONTRIBUTION_SECRET = 32;
export const MIN_ADMIN_TOKEN = 20;

export interface ConfigReport {
  fatal: string[];
  warnings: string[];
  adminDisabled: string | null;
}

export function checkProductionConfig(env: Record<string, string | undefined>): ConfigReport {
  const fatal: string[] = [];
  const warnings: string[] = [];
  if ((env.CONTRIBUTION_SECRET ?? "").length < MIN_CONTRIBUTION_SECRET)
    fatal.push(`CONTRIBUTION_SECRET fehlt oder ist kürzer als ${MIN_CONTRIBUTION_SECRET} Zeichen (Formular-Tokens und IP-Hashes brauchen ein festes Geheimnis).`);
  if (!env.SITE_URL) fatal.push("SITE_URL fehlt (öffentliche Adresse, z. B. https://example.org – für Link-Vorschauen, Sitemap und robots.txt).");
  else if (!/^https?:\/\/[^/]+/.test(env.SITE_URL)) fatal.push(`SITE_URL ist keine gültige Adresse: ${env.SITE_URL}`);
  // The local PGlite store is for development; in production it would silently start an empty database.
  // Only an explicit ZDZ_PGLITE_DIR (a local production test) may use it.
  if (!env.DATABASE_URL && !env.ZDZ_PGLITE_DIR) fatal.push("DATABASE_URL fehlt (in Produktion nur PostgreSQL, kein lokales PGlite).");

  let adminDisabled: string | null = null;
  if (env.ADMIN_TOKEN) {
    if (env.ADMIN_TOKEN.length < MIN_ADMIN_TOKEN) adminDisabled = `ADMIN_TOKEN ist kürzer als ${MIN_ADMIN_TOKEN} Zeichen`;
    else if (!env.ADMIN_TOTP_SECRET) adminDisabled = "ADMIN_TOTP_SECRET fehlt (Zwei-Faktor-Anmeldung ist in Produktion Pflicht)";
  }

  const owner = ["OWNER_NAME", "OWNER_ADDRESS", "OWNER_EMAIL"].filter((k) => !env[k]);
  if (owner.length) warnings.push(`${owner.join(", ")} fehlt: Impressum und Datenschutzerklärung zeigen Platzhalter.`);
  return { fatal, warnings, adminDisabled };
}
