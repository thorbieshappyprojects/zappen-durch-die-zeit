/**
 * Uploads the curation left out (seed/upload-review.json), grouped by source with the reason.
 * The admin decides per group; `applyUploadReview` puts the items of included groups into the
 * seed entry lists and takes them out again when a group is no longer included.
 */

export interface ReviewItem {
  /** media-library.json (a programme) or interstitials.json (announcer, ad …). */
  target: "library" | "interstitial";
  /** We already have this broadcast from another source: nothing new if included. */
  covered: boolean;
  /** The seed entry as it would be added (no uploader name in the note). */
  entry: { url: string; channel?: string | null; note?: string; date?: string; airedOn?: string; durationS?: number | null } & Record<string, unknown>;
}

export interface ReviewGroup {
  id: string;
  platform: string;
  source: string;
  sourceUrl: string | null;
  /** Why it was left out: the uploader, the content itself, or political material. */
  category: "uploader" | "inhalt" | "politisch";
  reason: string;
  /** When the source was active ("dead" sources are promoted less by a link). */
  activity: string;
  profile: string;
  impact: string;
  /** False: nothing a 90s TV would show (summary only). */
  canInclude: boolean;
  items: ReviewItem[];
}

export interface UploadReviewFile {
  about: string;
  groups: ReviewGroup[];
}

type SeedEntry = { url: string } & Record<string, unknown>;

/**
 * Seed entries after the decisions: new (not covered) items of included groups are added once,
 * marked with `review: <group id>`; entries a group added earlier are removed when it isn't
 * included any more.
 */
export function applyUploadReview(
  review: UploadReviewFile,
  included: ReadonlySet<string>,
  library: readonly SeedEntry[],
  interstitials: readonly SeedEntry[],
): { library: SeedEntry[]; interstitials: SeedEntry[]; added: number; removed: number } {
  let added = 0;
  let removed = 0;
  const apply = (entries: readonly SeedEntry[], target: ReviewItem["target"]) => {
    const kept = entries.filter((e) => {
      const drop = typeof e.review === "string" && !included.has(e.review);
      if (drop) removed++;
      return !drop;
    });
    const urls = new Set(kept.map((e) => e.url));
    for (const g of review.groups) {
      if (!g.canInclude || !included.has(g.id)) continue;
      for (const item of g.items) {
        if (item.target !== target || item.covered || urls.has(item.entry.url)) continue;
        kept.push({ ...item.entry, review: g.id });
        urls.add(item.entry.url);
        added++;
      }
    }
    return kept;
  };
  return { library: apply(library, "library"), interstitials: apply(interstitials, "interstitial"), added, removed };
}

/**
 * URLs the review keeps out for now: items of groups that aren't included. The interstitial import
 * only upserts, so these are removed from the database explicitly (a group left out after it was in).
 */
export function withheldUrls(review: UploadReviewFile, included: ReadonlySet<string>, target: ReviewItem["target"]): Set<string> {
  const urls = new Set<string>();
  for (const g of review.groups) if (!included.has(g.id)) for (const item of g.items) if (item.target === target) urls.add(item.entry.url);
  return urls;
}
