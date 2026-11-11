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

/**
 * Links already in the seed files next to the review file (media-library.json, interstitials.json):
 * an included entry found there has been applied (review-apply, then a data update).
 */
export async function loadSeedUrls(): Promise<Set<string>> {
  const dir = path.dirname(uploadReviewFile());
  const urls = new Set<string>();
  for (const name of ["media-library.json", "interstitials.json"]) {
    try {
      const file = JSON.parse(await readFile(path.join(dir, name), "utf8")) as { entries?: { url?: string }[] };
      for (const e of file.entries ?? []) if (e.url) urls.add(e.url);
    } catch {
      // Missing file: nothing counts as applied.
    }
  }
  return urls;
}
