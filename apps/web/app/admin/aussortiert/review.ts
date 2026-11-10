import { readFile } from "node:fs/promises";
import path from "node:path";
import type { UploadReviewFile } from "@zdz/core";
import { repoRoot } from "@zdz/db";

/** The review file: UPLOAD_REVIEW_FILE, else seed/upload-review.json in the repository. */
export const uploadReviewFile = () => process.env.UPLOAD_REVIEW_FILE || path.join(repoRoot(), "seed/upload-review.json");

/** The uploads the curation left out, with reasons (built by the curation scripts). Absent file: no groups. */
export async function loadUploadReview(): Promise<UploadReviewFile> {
  try {
    return JSON.parse(await readFile(uploadReviewFile(), "utf8")) as UploadReviewFile;
  } catch {
    return { about: "", groups: [] };
  }
}
