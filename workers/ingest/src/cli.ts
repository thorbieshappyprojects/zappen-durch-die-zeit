/**
 * Usage:
 *   pnpm db:migrate                     apply migrations
 *   pnpm db:seed                        import all seed/*.json days
 *   pnpm ingest import archive          import the local tvprogramme.net copy (.data/archive/tvprogramme.net-seed)
 *   pnpm ingest interstitials           import seed/interstitials.json (idents, announcers, sign-off, ad spots)
 *   pnpm ingest snapshot                store today's key figures (admin dashboard trend)
 *   pnpm ingest purge                   apply the retention rules (spam, rejected, e-mails, old reports); also part of snapshot
 *   pnpm ingest review-export           print the decisions of /admin/aussortiert as JSON (run where the decisions live: the server)
 *   pnpm ingest review-apply [--decisions <file>]   put uploads the admin included into the seed files; with --decisions
 *                                       from a review-export (the server's decisions), else from this database
 *   pnpm ingest admin-totp [--print]    set up two-factor login for /admin (writes apps/web/.env.local; --print only prints)
 *   pnpm ingest import <adapter> [dates…]
 *   pnpm ingest sources                 list sources and their license status
 *   pnpm ingest remove-source <name>    delete a source and all its TV days
 *   pnpm ingest set-license <status> <name-substring> [-- notes]   record a license status
 */
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { applyUploadReview, tvDayDateOf, withheldUrls, type UploadReviewFile } from "@zdz/core";
import { newTotpSecret, otpauthUri } from "@zdz/core/totp";
import {
  assertImportAllowed,
  computeStats,
  createDb,
  importDay,
  importInterstitials,
  removeInterstitials,
  listUploadDecisions,
  purgeContributions,
  recordSnapshot,
  removeSource,
  repoRoot,
  schema,
  setLicenseStatus,
  type InterstitialSeed,
} from "@zdz/db";
import { seedAdapter } from "./adapters/seed";
import type { ScheduleAdapter } from "./adapters/types";

// Remote adapters (e.g. tvprogramme.net) are registered here once permission is
// recorded in schedule_source.license_status — see CLAUDE.md.
const ADAPTERS: Record<string, () => ScheduleAdapter> = {
  seed: () => seedAdapter(),
  // Days converted from the git-ignored preservation copy of tvprogramme.net (see CLAUDE.md);
  // curated seeds for the same date are skipped by the converter. Missing folder = nothing to import.
  archive: () => seedAdapter(process.env.ARCHIVE_SEED_DIR || path.join(repoRoot(), ".data/archive/tvprogramme.net-seed"), { optional: true }),
};

/**
 * New TOTP secret for the admin login, written to apps/web/.env.local. Needs no database, so it
 * also works while `pnpm dev` holds the local PGlite database. `--print` (servers) only prints the
 * secret and the otpauth:// link; it goes into the server's environment by hand.
 */
async function setupAdminTotp(args: string[]): Promise<void> {
  if (args.includes("--print")) {
    const secret = newTotpSecret();
    console.log(`ADMIN_TOTP_SECRET=${secret}`);
    console.log("In der Authenticator-App hinzufügen – Schlüssel manuell eingeben:");
    console.log(`  ${secret.match(/.{1,4}/g)!.join(" ")}`);
    console.log(`oder als Link/QR-Code: ${otpauthUri(secret)}`);
    console.log("Die Zeile ADMIN_TOTP_SECRET=… in die .env des Servers schreiben und die App neu starten.");
    return;
  }
  // New secret for the authenticator app; replaces an existing one (old codes stop working).
  const file = path.join(repoRoot(), "apps/web/.env.local");
  const secret = newTotpSecret();
  const current = await readFile(file, "utf8").catch(() => "");
  const lines = current.split("\n").filter((l) => l.trim() && !l.startsWith("ADMIN_TOTP_SECRET="));
  await writeFile(file, [...lines, `ADMIN_TOTP_SECRET=${secret}`].join("\n") + "\n", { mode: 0o600 });
  console.log("Zwei-Faktor-Anmeldung eingerichtet (apps/web/.env.local, nicht im Git).");
  console.log("In der Authenticator-App hinzufügen – Schlüssel manuell eingeben:");
  console.log(`  ${secret.match(/.{1,4}/g)!.join(" ")}`);
  console.log("oder diesen Link als QR-Code/Link öffnen:");
  console.log(`  ${otpauthUri(secret)}`);
  console.log("Danach den Webserver neu starten. Alte Sitzungen sind damit beendet.");
}

const purgeSummary = (r: { spam: number; rejected: number; emails: number; reports: number }) =>
  `Purge: ${r.spam} spam and ${r.rejected} rejected contributions deleted, ${r.emails} e-mail addresses cleared, ${r.reports} old reports deleted.`;

async function main(argv: string[]) {
  const [command, ...args] = argv;
  if (command === "admin-totp") return setupAdminTotp(args);
  const handle = await createDb();
  try {
    await handle.migrate();
    switch (command) {
      case "migrate":
        console.log(`Migrations applied (${handle.driver}).`);
        break;
      case "import": {
        const [adapterName, ...dates] = args;
        const make = adapterName ? ADAPTERS[adapterName] : undefined;
        if (!make) throw new Error(`Unknown adapter "${adapterName}". Available: ${Object.keys(ADAPTERS).join(", ")}`);
        const adapter = make();
        if (adapter.kind === "remote") await assertImportAllowed(handle.db, adapter.sourceName, "remote");
        const days = dates.length ? dates : await adapter.listDays();
        for (const date of days) {
          const stats = await importDay(handle.db, await adapter.loadDay(date), adapter.kind);
          console.log(
            `${date}: ${stats.broadcasts} broadcasts, ${stats.programmesLinked} programmes linked, ` +
              `${stats.mediaCandidates} media candidates, ${stats.adBreaks} ad breaks` +
              (stats.communityVideos ? `, ${stats.communityVideos} community videos kept` : "") +
              (stats.communityOrphaned ? `, ${stats.communityOrphaned} community videos without broadcast (contribution back to „pending“)` : ""),
          );
        }
        break;
      }
      case "interstitials": {
        const file = path.join(repoRoot(), "seed/interstitials.json");
        const { entries } = JSON.parse(await readFile(file, "utf8")) as { entries: InterstitialSeed[] };
        const { imported, skipped } = await importInterstitials(handle.db, entries);
        console.log(`${imported} interstitials imported${skipped.length ? `; skipped (unknown channel): ${skipped.join("; ")}` : ""}`);
        // Clips the review keeps out (a group not included, e.g. after the decision changed) leave the database too.
        const review = JSON.parse(await readFile(path.join(repoRoot(), "seed/upload-review.json"), "utf8")) as UploadReviewFile;
        const decisions = await listUploadDecisions(handle.db);
        const included = new Set(Object.entries(decisions).filter(([, d]) => d.decision === "include").map(([id]) => id));
        const inSeed = new Set(entries.map((e) => e.url));
        const removed = await removeInterstitials(handle.db, [...withheldUrls(review, included, "interstitial")].filter((u) => !inSeed.has(u)));
        if (removed) console.log(`${removed} interstitials removed (left out by the upload review)`);
        break;
      }
      case "review-export": {
        // The admin decides on the server; the seed files live in the repository on the owner's machine.
        const decisions = await listUploadDecisions(handle.db);
        console.log(JSON.stringify(Object.fromEntries(Object.entries(decisions).map(([id, d]) => [id, { decision: d.decision, note: d.note }]))));
        break;
      }
      case "review-apply": {
        const seed = (name: string) => path.join(repoRoot(), "seed", name);
        const review = JSON.parse(await readFile(seed("upload-review.json"), "utf8")) as UploadReviewFile;
        const from = args.indexOf("--decisions");
        const decisions: Record<string, { decision: string }> =
          from >= 0 ? JSON.parse(await readFile(args[from + 1]!, "utf8")) : await listUploadDecisions(handle.db);
        const included = new Set(Object.entries(decisions).filter(([, d]) => d.decision === "include").map(([id]) => id));
        const lib = JSON.parse(await readFile(seed("media-library.json"), "utf8"));
        const inter = JSON.parse(await readFile(seed("interstitials.json"), "utf8"));
        const out = applyUploadReview(review, included, lib.entries, inter.entries);
        // Same format as the curation scripts write (1-space indent, UTF-8).
        await writeFile(seed("media-library.json"), JSON.stringify({ ...lib, entries: out.library }, null, 1) + "\n");
        await writeFile(seed("interstitials.json"), JSON.stringify({ ...inter, entries: out.interstitials }, null, 1) + "\n");
        console.log(`${included.size} groups included: ${out.added} entries added, ${out.removed} removed.`);
        if (out.added || out.removed)
          console.log("Next: regenerate the archive days (to_seed.py), then pnpm ingest import archive && pnpm ingest interstitials.");
        break;
      }
      case "snapshot": {
        const day = tvDayDateOf(new Date());
        const stats = await computeStats(handle.db);
        await recordSnapshot(handle.db, day, stats);
        console.log(`Snapshot ${day}: ${stats.daysReal} days, ${stats.broadcastsWithVideo}/${stats.broadcastsReal} broadcasts with video, ${stats.videos} videos`);
        // The daily run also applies the retention rules.
        console.log(purgeSummary(await purgeContributions(handle.db)));
        break;
      }
      case "purge": {
        console.log(purgeSummary(await purgeContributions(handle.db)));
        break;
      }
      case "sources": {
        for (const s of await handle.db.select().from(schema.scheduleSource)) {
          console.log(`${s.licenseStatus.padEnd(12)} ${s.name}`);
        }
        break;
      }
      case "remove-source": {
        const name = args.join(" ");
        const result = await removeSource(handle.db, name);
        console.log(result ? `Removed "${name}" with days: ${result.removedDays.join(", ") || "none"}` : `No source named "${name}".`);
        if (result?.communityOrphaned)
          console.warn(`${result.communityOrphaned} community videos lost their broadcast; their contributions are back to „pending“.`);
        break;
      }
      case "set-license": {
        const [status, ...rest] = args;
        if (!status) throw new Error("Usage: set-license <status> <name-substring> [-- notes]");
        const sep = rest.indexOf("--");
        const needle = (sep >= 0 ? rest.slice(0, sep) : rest).join(" ");
        const notes = sep >= 0 ? rest.slice(sep + 1).join(" ") : undefined;
        const sources = await handle.db.select().from(schema.scheduleSource);
        for (const s of sources.filter((x) => x.name.includes(needle))) {
          await setLicenseStatus(handle.db, s.name, status as never, notes);
          console.log(`${status.padEnd(12)} ${s.name}`);
        }
        break;
      }
      default:
        throw new Error(
          `Unknown command "${command}". Use: migrate | import <adapter> [dates…] | sources | remove-source <name> | set-license <status> <name> [-- notes]`,
        );
    }
  } finally {
    await handle.close();
  }
}

main(process.argv.slice(2)).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
