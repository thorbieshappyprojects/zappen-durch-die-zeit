import { createHash } from "node:crypto";
import {
  checkUploadSizes,
  classifySubmission,
  LIMITS,
  sanitizeFilename,
  sniffUpload,
  spamReasons,
  uploadTypeError,
  validateSubmission,
  type SniffResult,
} from "@zdz/core";
import { addContributionFile, countRecentContributions, createContribution, uploadedBytes } from "@zdz/db";
import { clientIp, formTokenAgeSeconds, hashIp } from "./contribution-security";
import { db } from "./db";
import { saveUpload } from "./upload-store";

export interface SubmitState {
  status: "idle" | "ok" | "error";
  errors: string[];
  /** The form token was correctly signed but too old: the form fetches a new one (content stays). */
  expired?: boolean;
}

const MB = 1024 * 1024;
/** Global attachment quota: per 24 h and for the whole store (contribution_file.size_bytes). */
const DAILY_QUOTA_BYTES = Number(process.env.UPLOAD_DAILY_QUOTA_MB ?? 500) * MB;
const TOTAL_QUOTA_BYTES = Number(process.env.UPLOAD_TOTAL_QUOTA_MB ?? 5000) * MB;

const field = (f: FormData, name: string) => {
  const v = f.get(name);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

/**
 * A Mitmachen submission (route /mitmachen/senden). Cheap checks first, files are read last:
 * consent → token age → rate limit → sizes → global quota → file types → text → store.
 */
export async function handleSubmission(form: FormData, headers: Headers): Promise<SubmitState> {
  if (form.get("consent") !== "on") return { status: "error", errors: ["Bitte das Häkchen beim Einverständnis setzen."] };
  // A page left open too long is no spam: ask to send again (the form renews its token meanwhile).
  const tokenAge = formTokenAgeSeconds(field(form, "token") ?? null);
  if (tokenAge !== undefined && tokenAge > LIMITS.maxFillSeconds)
    return { status: "error", errors: ["Das Formular war zu lange offen – bitte noch einmal abschicken."], expired: true };

  const ipHash = hashIp(clientIp(headers));
  const handle = await db();
  const now = Date.now();
  const lastHour = await countRecentContributions(handle.db, ipHash, new Date(now - 3600_000));
  const lastDay = await countRecentContributions(handle.db, ipHash, new Date(now - 24 * 3600_000));
  if (lastHour >= LIMITS.perHour || lastDay >= LIMITS.perDay)
    return { status: "error", errors: ["Danke! Für heute sind genug Beiträge von dir eingegangen – bitte später noch einmal."] };

  // Attachments: sizes and the global quota before any file is read.
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const sizeErrors = checkUploadSizes(files.map((f) => f.size));
  if (sizeErrors.length) return { status: "error", errors: sizeErrors };
  if (files.length) {
    const stored = await uploadedBytes(handle.db, new Date(now - 24 * 3600_000));
    const incoming = files.reduce((sum, f) => sum + f.size, 0);
    if (stored.recent + incoming > DAILY_QUOTA_BYTES || stored.total + incoming > TOTAL_QUOTA_BYTES)
      return { status: "error", errors: ["Im Moment nehmen wir keine Dateien an. Text, Links und abgetipptes Programm gehen weiterhin – bitte ohne Anhang schicken."] };
  }
  // Then the type from the content (never trust name or claimed MIME).
  const uploads: { name: string; bytes: Uint8Array; type: SniffResult }[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const type = sniffUpload(bytes, f.name);
    if (!type) return { status: "error", errors: [uploadTypeError(f.name)] };
    uploads.push({ name: sanitizeFilename(f.name), bytes, type });
  }
  // One free-text field: we work out on our side whether it is a link, a schedule or a note.
  const input = classifySubmission(field(form, "body") ?? "", uploads.length, {
    tvDate: field(form, "tvDate"),
    channel: field(form, "channel"),
    start: field(form, "start"),
    title: field(form, "title"),
  });
  input.contributorName = field(form, "contributorName");
  input.contributorEmail = field(form, "contributorEmail");
  const validation = validateSubmission(input);
  if (!validation.ok) return { status: "error", errors: validation.errors };

  const reasons = spamReasons(input, { honeypot: field(form, "website"), fillSeconds: tokenAge });
  // Spam is stored for auditing but answered like a normal submission (no hints for bots).
  const row = await createContribution(handle.db, input, { ipHash, spamReasons: reasons });
  // Files of spam submissions are not kept.
  if (!reasons.length) {
    for (const u of uploads) {
      const storageKey = await saveUpload(row.id, u.bytes, u.type);
      await addContributionFile(handle.db, {
        contributionId: row.id,
        originalName: u.name,
        mime: u.type.mime,
        sizeBytes: u.bytes.length,
        sha256: createHash("sha256").update(u.bytes).digest("hex"),
        storageKey,
      });
    }
  }
  return { status: "ok", errors: [] };
}
