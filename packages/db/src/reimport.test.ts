import { readFileSync } from "node:fs";
import type { SeedFile } from "@zdz/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./client";
import { approveVideoContribution, createContribution, listContributions } from "./contributions";
import { importDay, importedDayFromSeed } from "./import";
import { loadTvDay } from "./queries";
import { contribution, mediaCandidate } from "./schema";

const seed = JSON.parse(readFileSync(new URL("../../../seed/1991-03-13.json", import.meta.url), "utf8")) as SeedFile;
let h: DbHandle;
beforeAll(async () => {
  h = await createDb({ dataDir: "memory://" });
  await h.migrate();
  await importDay(h.db, importedDayFromSeed(seed), "local");
});
afterAll(() => h.close());

async function approved(start: string, url: string) {
  const c = await createContribution(
    h.db,
    { kind: "video_link", tvDate: "1991-03-13", channel: "ard", start, url },
    { ipHash: "x", spamReasons: [] },
  );
  const r = await approveVideoContribution(h.db, c.id, "same_show");
  expect(r.ok).toBe(true);
  return c.id;
}

describe("re-importing a day", () => {
  it("keeps approved community videos on the broadcast with the same channel and start", async () => {
    const url = "https://www.youtube.com/watch?v=DDDDDDDDDDD";
    const id = await approved("20:10", url);
    const stats = await importDay(h.db, importedDayFromSeed(seed), "local");
    expect(stats.communityVideos).toBe(1);
    expect((await loadTvDay(h.db, "1991-03-13"))!.media["ard-1210"]?.url).toBe(url);
    // The contribution points to the re-created row.
    const [c] = await h.db.select().from(contribution).where(eq(contribution.id, id));
    const [mc] = await h.db.select().from(mediaCandidate).where(eq(mediaCandidate.id, c!.mediaCandidateId!));
    expect(mc).toMatchObject({ url, foundBy: "community", status: "approved" });
  });

  it("sends the contribution back to „pending“ when the broadcast is gone", async () => {
    const id = await approved("20:00", "https://www.youtube.com/watch?v=EEEEEEEEEEE");
    const changed: SeedFile = { ...seed, broadcasts: seed.broadcasts.filter((b) => !(b.channel === "ard" && b.start === "20:00")) };
    const stats = await importDay(h.db, importedDayFromSeed(changed), "local");
    expect(stats.communityOrphaned).toBe(1);
    const c = (await listContributions(h.db, "pending", 500)).find((x) => x.id === id);
    expect(c).toMatchObject({ status: "pending", mediaCandidateId: null });
    expect(c!.reviewNote).toContain("Neuimport");
  });
});
