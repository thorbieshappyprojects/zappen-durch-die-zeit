/** Contribution attachments: allowed types are detected from the file content, not the name. */

export const UPLOAD_LIMITS = {
  files: 5,
  perFileBytes: 10 * 1024 * 1024,
  totalBytes: 25 * 1024 * 1024,
  nameLength: 120,
} as const;

export type UploadKind = "image" | "pdf" | "text";

export interface SniffResult {
  kind: UploadKind;
  mime: string;
  /** Extension used for storage (independent of the uploaded name). */
  ext: string;
}

const TEXT_EXTENSIONS = /\.(txt|csv|tsv|md)$/i;

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

/**
 * Identifies an upload by its leading bytes. Returns null for anything not allowed
 * (executables, archives, HTML/SVG, Office files, …). Text is only accepted for text
 * extensions and when it contains no NUL bytes and decodes as UTF-8 or Latin-1.
 */
export function sniffUpload(bytes: Uint8Array, filename: string): SniffResult | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mime: "image/png", ext: "png" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { kind: "image", mime: "image/webp", ext: "webp" };
  if (ascii(bytes, 4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(ascii(bytes, 8, 12)))
    return { kind: "image", mime: "image/heic", ext: "heic" };
  if (ascii(bytes, 0, 5) === "%PDF-") return { kind: "pdf", mime: "application/pdf", ext: "pdf" };
  if (TEXT_EXTENSIONS.test(filename) && bytes.length > 0 && !bytes.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      // Latin-1 (old exports) is fine too — every byte sequence decodes; NUL bytes were excluded above.
    }
    const ext = filename.match(TEXT_EXTENSIONS)![1]!.toLowerCase();
    return { kind: "text", mime: ext === "csv" ? "text/csv" : ext === "tsv" ? "text/tab-separated-values" : "text/plain", ext };
  }
  return null;
}

/** Keeps only safe characters of an uploaded file name (for display, never for storage paths). */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "datei";
  return base.normalize("NFC").replace(/[^\p{L}\p{N} ._()-]+/gu, "_").slice(0, UPLOAD_LIMITS.nameLength) || "datei";
}

/** Checks count and sizes before reading files; returns German error texts. */
export function checkUploadSizes(sizes: number[]): string[] {
  const errors: string[] = [];
  if (sizes.length > UPLOAD_LIMITS.files) errors.push(`Bitte höchstens ${UPLOAD_LIMITS.files} Dateien anhängen.`);
  if (sizes.some((s) => s > UPLOAD_LIMITS.perFileBytes)) errors.push("Eine Datei ist größer als 10 MB.");
  if (sizes.reduce((a, b) => a + b, 0) > UPLOAD_LIMITS.totalBytes) errors.push("Die Dateien sind zusammen größer als 25 MB.");
  return errors;
}

/** German message for a file of a type we don't accept (same text in the browser and on the server). */
export const uploadTypeError = (name: string) => `„${sanitizeFilename(name)}“ ist kein erlaubter Dateityp (Fotos, PDF oder Textdateien).`;

/** Names the server may accept (it still checks the content with `sniffUpload`). */
const UPLOAD_NAME = /\.(jpe?g|png|webp|heic|pdf|txt|csv|tsv|md)$/i;

/**
 * Check in the browser before sending: count, sizes and type by name, with the server's messages.
 * Catches the common mistakes without an upload; the server checks again (content, not name).
 */
export function checkUploadsBeforeSending(files: readonly { name: string; size: number }[]): string[] {
  const errors = checkUploadSizes(files.map((f) => f.size));
  for (const f of files) if (!UPLOAD_NAME.test(f.name)) errors.push(uploadTypeError(f.name));
  return errors;
}
