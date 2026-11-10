import type { MetadataRoute } from "next";
import { connection } from "next/server";

/** Admin pages and the share-image endpoint aren't for search engines; the sitemap lists the rest. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // Per request: prerendered at build time, SITE_URL (set only on the server) would be missing.
  await connection();
  const site = process.env.SITE_URL?.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", disallow: ["/admin", "/og"] }],
    ...(site ? { sitemap: `${site}/sitemap.xml` } : {}),
  };
}
