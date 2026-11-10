import { rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./client";

/** Contribution attachments live outside the web root (UPLOAD_DIR, default .data/uploads). */
export function uploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(repoRoot(), ".data/uploads");
}

/** Storage keys are server-generated: "<contributionId>/<uuid>.<ext>". */
export const STORAGE_KEY = /^\d+\/[0-9a-f-]{36}\.[a-z]{2,4}$/;

/** Removes stored files (missing ones are fine) and the then-empty contribution folders. */
export async function removeUploadFiles(keys: readonly string[]): Promise<void> {
  const dir = uploadDir();
  for (const key of keys) {
    if (!STORAGE_KEY.test(key)) continue;
    await rm(path.join(dir, key), { force: true });
    await rmdir(path.join(dir, key.split("/")[0]!)).catch(() => {}); // fails unless empty: fine
  }
}
