import { providerOf, videoIdOf, withoutEmailAddresses, type InterstitialKind } from "@zdz/core";
import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./client";
import { channel, interstitial } from "./schema";

/** One entry of seed/interstitials.json (curated; only links to existing uploads). */
export interface InterstitialSeed {
  /** Channel slug, or null/absent for a pool item (e.g. a single ad spot for any channel). */
  channel?: string | null;
  kind: InterstitialKind;
  url: string;
  airedOn?: string;
  airedPeriod?: string;
  validFrom?: string;
  validTo?: string;
  inS?: number;
  outS?: number;
  durationS?: number;
  rank?: number;
  note: string;
}

/** Upserts curated interstitials (approved). Unknown channel slugs are reported and skipped. */
export async function importInterstitials(db: Db, entries: readonly InterstitialSeed[]): Promise<{ imported: number; skipped: string[] }> {
  const skipped: string[] = [];
  let imported = 0;
  for (const e of entries) {
    let channelId: number | null = null;
    if (e.channel) {
      const [c] = await db.select({ id: channel.id }).from(channel).where(eq(channel.slug, e.channel));
      if (!c) {
        skipped.push(`${e.channel}: ${e.note}`);
        continue;
      }
      channelId = c.id;
    }
    providerOf(e.url); // throws on a malformed URL
    const values = {
      channelId,
      kind: e.kind,
      url: e.url,
      providerVideoId: videoIdOf(e.url),
      airedOn: e.airedOn ?? null,
      airedPeriod: e.airedPeriod ?? e.airedOn?.slice(0, 4) ?? null,
      validFrom: e.validFrom ?? null,
      validTo: e.validTo ?? null,
      inS: e.inS ?? null,
      outS: e.outS ?? null,
      durationS: e.durationS ?? null,
      rank: e.rank ?? 0,
      notes: withoutEmailAddresses(e.note),
      status: "approved" as const,
    };
    await db
      .insert(interstitial)
      .values(values)
      .onConflictDoUpdate({ target: [interstitial.channelId, interstitial.kind, interstitial.url, interstitial.inS], set: values });
    imported++;
  }
  return { imported, skipped };
}

/** Deletes interstitials by URL (uploads the review keeps out); returns how many went. */
export async function removeInterstitials(db: Db, urls: readonly string[]): Promise<number> {
  if (!urls.length) return 0;
  return (await db.delete(interstitial).where(inArray(interstitial.url, [...urls])).returning({ id: interstitial.id })).length;
}

export type InterstitialRow = typeof interstitial.$inferSelect;

/** All interstitials with their channel slug, newest first (admin list). */
export async function listInterstitials(db: Db): Promise<(InterstitialRow & { channelSlug: string | null })[]> {
  const rows = await db
    .select({ i: interstitial, slug: channel.slug })
    .from(interstitial)
    .leftJoin(channel, eq(interstitial.channelId, channel.id))
    .orderBy(desc(interstitial.id));
  return rows.map(({ i, slug }) => ({ ...i, channelSlug: slug ?? null }));
}

export async function setInterstitialStatus(db: Db, id: number, status: InterstitialRow["status"]): Promise<void> {
  await db.update(interstitial).set({ status }).where(eq(interstitial.id, id));
}
