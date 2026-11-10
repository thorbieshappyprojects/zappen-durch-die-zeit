import type { MetadataRoute } from "next";

/** Admin pages and the share-image endpoint aren't for search engines; the sitemap lists the rest. */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.SITE_URL?.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", disallow: ["/admin", "/og"] }],
    ...(site ? { sitemap: `${site}/sitemap.xml` } : {}),
  };
}
