import { listingIndexable } from "@zdz/core";
import type { MetadataRoute } from "next";
import { getDaySources } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Day listing pages that may be indexed (see core listingIndexable and PUBLISH_LISTINGS). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  const publish = process.env.PUBLISH_LISTINGS === "1";
  const best = new Map<string, { licenseStatus: string; completeness: string }>();
  for (const s of await getDaySources()) {
    const prev = best.get(s.date);
    if (!prev || prev.completeness === "series_only") best.set(s.date, s);
  }
  return [...best]
    .filter(([, s]) => listingIndexable(s, publish))
    .map(([date]) => ({ url: `${base}/tag/${date}/programm`, changeFrequency: "yearly" as const }));
}
