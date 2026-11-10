import { readFileSync } from "node:fs";
import { dayCoverage, tvDayFromSeed, type SeedFile } from "@zdz/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./client";
import { importDay, importedDayFromSeed, removeSource } from "./import";
import { bestVideoStarts, listSeamlessPool, listTvDayCoverage, listTvDays, loadTvDay } from "./queries";
import { computeStats, getSiteSettings, listHiddenStations, listSnapshots, recordSnapshot, setSiteSetting, setStationHidden } from "./stats";
import { blockVideo, countRecentReportsByIp, countUnavailableReports, createMediaReport, handleReports, isKnownVideoUrl, listBlockedVideos, listOpenReportGroups, unblockVideo } from "./reports";

const seed1991 = JSON.parse(
  readFileSync(new URL("../../../seed/1991-03-13.json", import.meta.url), "utf8"),
) as SeedFile;

/** A small reconstructed later day: renamed channels, a Tagesschau without a match, its own ad break. */
const seed1999: SeedFile = {
  date: "1999-12-31",
  completeness: "partial",
  tvDayStart: "06:00",
  timezone: "Europe/Berlin",
  source: { name: "Eigene Recherche (Test)", url: "https://example.org", license: "not required" },
  channels: [
    { id: "ard", name: "Das Erste", displayNumber: 1, isPrivate: false },
    { id: "rtl-plus", name: "RTL", displayNumber: 3, isPrivate: true },
    { id: "vox", name: "VOX", displayNumber: 7, isPrivate: true },
  ],
  broadcasts: [
    { channel: "ard", start: "20:00", end: "20:15", startMinOfTvDay: 1200, endMinOfTvDay: 1215, title: "Tagesschau", description: null },
    { channel: "rtl-plus", start: "20:15", end: "22:00", startMinOfTvDay: 1215, endMinOfTvDay: 1320, title: "Silvester-Show", description: null },
    { channel: "vox", start: "23:00", end: "24:30", startMinOfTvDay: 1380, endMinOfTvDay: 1470, title: "Konzert", description: null },
  ],
  media: [],
  adBreaks: [{ channel: "rtl-plus", url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", note: "RTL Werbung 1999" }],
};

let h: DbHandle;
beforeAll(async () => {
  h = await createDb({ dataDir: "memory://" });
  await h.migrate();
  await importDay(h.db, importedDayFromSeed(seed1991), "local");
  await importDay(h.db, importedDayFromSeed(seed1999), "local");
});
afterAll(() => h.close());

describe("several days", () => {
  it("lists both days", async () => {
    expect(await listTvDays(h.db)).toEqual(["1991-03-13", "1999-12-31"]);
  });

  it("keeps the 1991 day unchanged (round trip)", async () => {
    expect(await loadTvDay(h.db, "1991-03-13")).toEqual(tvDayFromSeed(seed1991));
  });

  it("uses each day's channel names and numbers", async () => {
    const day = (await loadTvDay(h.db, "1999-12-31"))!;
    expect(day.completeness).toBe("partial");
    expect(day.channels).toEqual([
      { id: "ard", name: "Das Erste", displayNumber: 1, isPrivate: false },
      { id: "rtl-plus", name: "RTL", displayNumber: 3, isPrivate: true },
      { id: "vox", name: "VOX", displayNumber: 7, isPrivate: true },
    ]);
    const day91 = (await loadTvDay(h.db, "1991-03-13"))!;
    expect(day91.channels.find((c) => c.id === "rtl-plus")?.name).toBe("RTL");
  });

  it("does not leak 1991 video matches into 1999", async () => {
    const day = (await loadTvDay(h.db, "1999-12-31"))!;
    expect(day.media).toEqual({});
  });

  it("picks the ad break closest to the day's year", async () => {
    const day99 = (await loadTvDay(h.db, "1999-12-31"))!;
    expect(day99.adBreaks.find((a) => a.channelId === "rtl-plus")?.providerVideoId).toBe("AAAAAAAAAAA");
    const day91 = (await loadTvDay(h.db, "1991-03-13"))!;
    expect(day91.adBreaks.find((a) => a.channelId === "rtl-plus")?.providerVideoId).toBe("Uclokv3iEnw");
  });
});

describe("removeSource", () => {
  it("deletes a source with its days and leaves other days alone", async () => {
    expect(await removeSource(h.db, "Eigene Recherche (Test)")).toEqual({ removedDays: ["1999-12-31"], communityOrphaned: 0 });
    expect(await listTvDays(h.db)).toEqual(["1991-03-13"]);
    expect(await removeSource(h.db, "does not exist")).toBeNull();
  });
});

describe("coverage", () => {
  it("adds up the best match per broadcast like the TV shows it", async () => {
    const rows = await listTvDayCoverage(h.db);
    const d1991 = rows.find((r) => r.date === "1991-03-13")!;
    const { points, broadcasts } = dayCoverage((await loadTvDay(h.db, "1991-03-13"))!);
    expect(d1991).toMatchObject({ date: "1991-03-13", points, broadcasts });
    // Accurate points leave out "similar" matches.
    expect(d1991.accuratePoints).toBeLessThan(points);
    expect(d1991.accuratePoints).toBeGreaterThan(0);
    expect(rows.map((r) => r.date)).toEqual(await listTvDays(h.db));
  });
});

describe("best video starts", () => {
  it("finds the show with the best playable video per day and channel", async () => {
    const day = (await loadTvDay(h.db, "1991-03-13"))!;
    const starts = await bestVideoStarts(h.db, [
      { date: "1991-03-13", channel: "ard" },
      { date: "1999-12-31", channel: "vox" }, // a day without videos
    ]);
    const ard = starts.get("1991-03-13|ard");
    expect(ard).toBeDefined();
    const pick = day.broadcasts.find((b) => b.channelId === "ard" && b.startMin === ard)!;
    const levels = day.broadcasts.filter((b) => b.channelId === "ard" && day.media[b.id]?.embeddable).map((b) => day.media[b.id]!.matchLevel);
    // The best level the channel has that day.
    expect(day.media[pick.id]?.matchLevel).toBe(levels.includes("exact") ? "exact" : levels.includes("same_show_period") ? "same_show_period" : "same_show");
    expect(starts.has("1999-12-31|vox")).toBe(false);
    expect((await bestVideoStarts(h.db, [{ date: "1991-03-13", channel: "ard" }], ["youtube", "archive", "vimeo", "dailymotion"])).size).toBe(0);
  });
});

describe("site settings", () => {
  it("falls back to the defaults and stores a change", async () => {
    expect(await getSiteSettings(h.db)).toEqual({ crtFilter: true, sounds: true });
    await setSiteSetting(h.db, "crtFilter", false);
    expect(await getSiteSettings(h.db)).toEqual({ crtFilter: false, sounds: true });
    await setSiteSetting(h.db, "crtFilter", true);
  });
});

describe("seamless pool", () => {
  it("lists each embeddable video with a known length once, by station and nearby date", async () => {
    const pool = await listSeamlessPool(h.db, "1991-03-20", ["ard", "zdf"]);
    expect(pool.length).toBeGreaterThan(0);
    expect(new Set(pool.map((v) => v.media.url)).size).toBe(pool.length);
    expect(pool.every((v) => ["ard", "zdf"].includes(v.channelId) && v.date === "1991-03-13" && v.media.embeddable)).toBe(true);
    expect(pool.every((v) => v.media.durationS! >= 300)).toBe(true);
    expect(await listSeamlessPool(h.db, "1995-01-01", ["ard"], 30)).toEqual([]);
  });
});

describe("video reports and blocking", () => {
  it("lists blocked videos and takes a block back", async () => {
    await blockVideo(h.db, "https://example.org/blocked", "test");
    expect((await listBlockedVideos(h.db)).map((b) => [b.url, b.reason])).toContainEqual(["https://example.org/blocked", "test"]);
    expect(await unblockVideo(h.db, "https://example.org/blocked")).toBe(true);
    expect(await unblockVideo(h.db, "https://example.org/blocked")).toBe(false);
    expect((await listBlockedVideos(h.db)).some((b) => b.url === "https://example.org/blocked")).toBe(false);
  });
  it("knows only the URLs we link ourselves", async () => {
    expect(await isKnownVideoUrl(h.db, "https://www.youtube.com/watch?v=L9j0jrUADG0")).toBe(true);
    expect(await isKnownVideoUrl(h.db, "https://evil.example/track?id=1")).toBe(false);
  });

  it("hides a blocked video from the day and the coverage, also after a re-import", async () => {
    const before = (await loadTvDay(h.db, "1991-03-13"))!;
    const [id, media] = Object.entries(before.media)[0]!;
    const coverageBefore = (await listTvDayCoverage(h.db)).find((r) => r.date === "1991-03-13")!;
    await createMediaReport(h.db, { url: media.url, reason: "unavailable", ipHash: "x", automatic: true });
    expect(await countUnavailableReports(h.db, media.url, new Date(Date.now() - 86400000))).toBe(1);
    await handleReports(h.db, media.url, "dead");
    const after = (await loadTvDay(h.db, "1991-03-13"))!;
    expect(after.media[id]?.url).not.toBe(media.url);
    expect((await listTvDayCoverage(h.db)).find((r) => r.date === "1991-03-13")!.points).toBeLessThan(coverageBefore.points);
    expect(await listOpenReportGroups(h.db)).toEqual([]); // handled
    await importDay(h.db, importedDayFromSeed(seed1991), "local");
    expect((await loadTvDay(h.db, "1991-03-13"))!.media[id]?.url).not.toBe(media.url);
  });
  it("groups open reports per video and counts per IP", async () => {
    await createMediaReport(h.db, { url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", reason: "wrong_programme", ipHash: "ip1", note: "falsche Folge" });
    await createMediaReport(h.db, { url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", reason: "unavailable", ipHash: "ip2" });
    const [g] = await listOpenReportGroups(h.db);
    expect(g).toMatchObject({ reports: 2, reasons: { wrong_programme: 1, unavailable: 1 }, notes: ["falsche Folge"] });
    expect(await countRecentReportsByIp(h.db, "ip1", new Date(Date.now() - 3600000))).toBe(1);
  });
});

describe("admin stats", () => {
  it("counts real days, broadcasts and videos, stores daily snapshots", async () => {
    const s = await computeStats(h.db);
    expect(s.daysReal).toBeGreaterThan(0);
    expect(s.broadcastsWithVideo).toBeGreaterThan(0);
    expect(s.broadcastsWithVideo).toBeLessThanOrEqual(s.broadcastsReal);
    expect(s.broadcastsExact).toBeLessThanOrEqual(s.broadcastsWithVideo);
    await recordSnapshot(h.db, "2026-11-09", s);
    await recordSnapshot(h.db, "2026-11-09", { ...s, videos: s.videos + 1 }); // same day: overwritten
    await recordSnapshot(h.db, "2026-11-10", s);
    const snaps = await listSnapshots(h.db);
    expect(snaps.map((x) => x.day)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(snaps[0]!.data.videos).toBe(s.videos + 1);
  });
  it("hides and shows stations", async () => {
    await setStationHidden(h.db, "tele-5", true);
    await setStationHidden(h.db, "mtv", true);
    await setStationHidden(h.db, "mtv", false);
    expect(await listHiddenStations(h.db)).toEqual(["tele-5"]);
  });
});
