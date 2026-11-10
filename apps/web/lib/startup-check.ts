import { checkProductionConfig } from "@zdz/core";

/**
 * Production config check at server start (core `checkProductionConfig`), Node.js runtime only:
 * a missing/weak secret or SITE_URL ends the process with the reason.
 */
export function checkConfigAtStartup(): void {
  const report = checkProductionConfig(process.env);
  for (const w of report.warnings) console.warn(`[config] ${w}`);
  if (report.adminDisabled) console.warn(`[config] Admin-Anmeldung abgeschaltet: ${report.adminDisabled}.`);
  if (report.fatal.length) {
    console.error(`Server startet nicht – Konfiguration unvollständig (siehe apps/web/.env.example):\n- ${report.fatal.join("\n- ")}`);
    // Throwing would only make Next answer every request with 500; exiting lets the process manager show why.
    process.exit(1);
  }
}
