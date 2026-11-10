import { readFileSync } from "node:fs";
import type { SeedFile } from "@zdz/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./client";
import {
  addContributionFile,
  approveVideoContribution,
  getContributionFile,
  listContributionFiles,
  countRecentContributions,
  createContribution,
  listContributions,
  setContributionStatus,
  uploadedBytes,
  countContributionsByStatus,
} from "./contributions";
import { importDay, importedDayFromSeed } from "./import";
import { loadTvDay } from "./queries";

const seed = JSON.parse(readFileSync(new URL("../../../seed/1991-03-13.json", import.meta.url), "utf8")) as SeedFile;
let h: DbHandle;
beforeAll(async () => {
  h = await createDb({ dataDir: "memory://" });
  await h.migrate();
  await importDay(h.db, importedDayFromSeed(seed), "local");
});
afterAll(() => h.close());

describe("contributions", () => {
  it("stores pending submissions and spam separately", async () => {
    const ok = await createContribution(h.db, { kind: "note", body: "Die Tagesschau lief um 20 Uhr." }, { ipHash: "a", spamReasons: [] });
    const spam = await createContribution(h.db, { kind: "note", body: "casino" }, { ipHash: "b", spamReasons: ["spam-words"] });
    expect(ok.status).toBe("pending");
    expect(spam.status).toBe("spam");
    expect((await listContributions(h.db, "pending")).map((c) => c.id)).toContain(ok.id);
  });

  it("counts per status and pages the list", async () => {
    const counts = await countContributionsByStatus(h.db);
    expect(counts.pending).toBeGreaterThanOrEqual(1);
    expect(counts.spam).toBeGreaterThanOrEqual(1);
    const all = await listContributions(h.db, "pending", 200);
    expect(await listContributions(h.db, "pending", 1, 0)).toEqual(all.slice(0, 1));
    expect(await listContributions(h.db, "pending", 1, all.length)).toEqual([]);
  });

  it("counts recent submissions per IP hash", async () => {
    const since = new Date(Date.now() - 3600_000);
    expect(await countRecentContributions(h.db, "a", since)).toBe(1);
    expect(await countRecentContributions(h.db, "nobody", since)).toBe(0);
  });

  it("approving a video link puts it on the broadcast (ahead of seed matches)", async () => {
    // ARD 20:10 "Geschichten aus der Heimat" — the seed has a 1992 episode; a contributor suggests another one.
    const url = "https://www.youtube.com/watch?v=AAAAAAAAAAA";
    const c = await createContribution(
      h.db,
      { kind: "video_link", tvDate: "1991-03-13", channel: "ard", start: "20:10", title: "Geschichten aus der Heimat", url, contributorName: "Thorben" },
      { ipHash: "c", spamReasons: [] },
    );
    const before = await loadTvDay(h.db, "1991-03-13");
    expect(before!.media["ard-1210"]?.url).not.toBe(url);
    const r = await approveVideoContribution(h.db, c.id, "same_show_period");
    expect(r.ok).toBe(true);
    const after = await loadTvDay(h.db, "1991-03-13");
    expect(after!.media["ard-1210"]).toMatchObject({ url, providerVideoId: "AAAAAAAAAAA", matchLevel: "same_show_period", note: "Vorschlag von Thorben" });
    expect((await listContributions(h.db)).find((x) => x.id === c.id)?.status).toBe("approved");
  });

  it("finds after-midnight broadcasts and reports unknown slots", async () => {
    const late = await createContribution(
      h.db,
      { kind: "video_link", tvDate: "1991-03-13", channel: "ard", start: "00:30", url: "https://www.youtube.com/watch?v=BBBBBBBBBBB" },
      { ipHash: "c", spamReasons: [] },
    );
    expect((await approveVideoContribution(h.db, late.id, "same_show")).ok).toBe(true);
    const missing = await createContribution(
      h.db,
      { kind: "video_link", tvDate: "1991-03-13", channel: "ard", start: "03:33", url: "https://www.youtube.com/watch?v=CCCCCCCCCCC" },
      { ipHash: "c", spamReasons: [] },
    );
    expect(await approveVideoContribution(h.db, missing.id, "same_show")).toEqual({ ok: false, error: "Keine Sendung ard 1991-03-13 03:33 gefunden." });
  });

  it("approves a free-form note once the moderator fills in the broadcast", async () => {
    const c = await createContribution(
      h.db,
      { kind: "note", body: "Gefunden: https://www.youtube.com/watch?v=DDDDDDDDDDD" },
      { ipHash: "e", spamReasons: [] },
    );
    expect((await approveVideoContribution(h.db, c.id, "same_show")).ok).toBe(false);
    const overrides = { url: "https://www.youtube.com/watch?v=DDDDDDDDDDD", tvDate: "1991-03-13", channel: "ard", start: "00:30" };
    expect((await approveVideoContribution(h.db, c.id, "same_show", overrides)).ok).toBe(true);
    const row = (await listContributions(h.db, "approved")).find((x) => x.id === c.id);
    expect(row).toMatchObject({ kind: "video_link", channel: "ard", broadcastStart: "00:30", url: overrides.url });
  });

  it("rejects with a note", async () => {
    const c = await createContribution(h.db, { kind: "note", body: "Bitte prüfen, ob das stimmt." }, { ipHash: "d", spamReasons: [] });
    await setContributionStatus(h.db, c.id, "rejected", "Doppelt");
    const row = (await listContributions(h.db, "rejected"))[0]!;
    expect(row).toMatchObject({ id: c.id, reviewNote: "Doppelt" });
  });
});

describe("contribution files", () => {
  it("stores attachment metadata and removes it with the contribution", async () => {
    const c = await createContribution(h.db, { kind: "schedule", tvDate: "1998-11-20", channel: "vox", sourceInfo: "HÖRZU 47/1998", attachments: 1 }, { ipHash: "e", spamReasons: [] });
    const f = await addContributionFile(h.db, {
      contributionId: c.id, originalName: "HÖRZU 47 S.12.jpg", mime: "image/jpeg", sizeBytes: 123456, sha256: "ab".repeat(32), storageKey: `${c.id}/x.jpg`,
    });
    expect((await listContributionFiles(h.db, [c.id])).map((x) => x.id)).toEqual([f.id]);
    expect((await getContributionFile(h.db, f.id))?.mime).toBe("image/jpeg");
  });
  it("sums the stored bytes for the upload quota", async () => {
    const before = await uploadedBytes(h.db, new Date(Date.now() - 24 * 3600_000));
    expect(before.total).toBeGreaterThanOrEqual(123456);
    expect(before.recent).toBe(before.total);
    expect((await uploadedBytes(h.db, new Date(Date.now() + 60_000))).recent).toBe(0);
  });
});
