import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SniffResult } from "@zdz/core";
import { STORAGE_KEY, uploadDir } from "@zdz/db";

/** Attachments live outside the web root and are only served through the admin route. */
const UPLOAD_DIR = uploadDir();

/** Stores bytes under a server-generated name; the uploaded name never reaches the file system. */
export async function saveUpload(contributionId: number, bytes: Uint8Array, type: SniffResult): Promise<string> {
  const key = `${contributionId}/${randomUUID()}.${type.ext}`;
  const file = path.join(UPLOAD_DIR, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes, { mode: 0o600 });
  return key;
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  if (!STORAGE_KEY.test(storageKey)) throw new Error("Invalid storage key");
  return readFile(path.join(UPLOAD_DIR, storageKey));
}
