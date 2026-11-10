import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  nowAndNextByChannel,
  adBreakFor,
  fallbackFor,
  broadcastsOf,
  findBroadcastAt,
  findOnAir,
  gapAround,
  isInAdWindow,
  matchLevelOf,
  mediaFor,
  minutesSinceStart,
  nextBroadcast,
  progressOf,
  searchUrlFor,
  seekOffsetSeconds,
  simulcastChannels,
  upcomingBroadcast,
  nearestVideoBroadcast,
} from "./schedule";
import { pickCuratedMatch, tvDayFromSeed, type SeedFile } from "./seed";
import { clockToTvDayMin } from "./time";
import type { Broadcast, Channel, TvDay } from "./types";

const seed = JSON.parse(
  readFileSync(new URL("../../../seed/1991-03-13.json", import.meta.url), "utf8"),
) as SeedFile;
const day = tvDayFromSeed(seed);
const on = (channelId: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return findOnAir(broadcastsOf(day, channelId), clockToTvDayMin(h! * 60 + m!));
};

const b = (startMin: number, endMin: number, title = "X"): Broadcast => ({
  id: `t-${startMin}`,
  channelId: "t",
  startMin,
  endMin,
  title,
  description: null,
});

describe("findBroadcastAt", () => {
  const list = [b(360, 400), b(400, 1450), b(1450, 1500)];
  it("uses start-inclusive, end-exclusive slots", () => {
    expect(findBroadcastAt(list, 360)?.startMin).toBe(360);
    expect(findBroadcastAt(list, 399)?.startMin).toBe(360);
    expect(findBroadcastAt(list, 400)?.startMin).toBe(400);
  });
  it("finds programmes spanning midnight", () => {
    expect(findBroadcastAt(list, 1439)?.startMin).toBe(400);
    expect(findBroadcastAt(list, 1440)?.startMin).toBe(400);
    expect(findBroadcastAt(list, 1450)?.startMin).toBe(1450);
  });
  it("returns null outside programme hours", () => {
    expect(findBroadcastAt(list, 1500)).toBeNull();
    expect(findBroadcastAt(list, 359)).toBeNull();
  });
});

describe("findOnAir with the 13.03.1991 seed", () => {
  it("loads 6 channels and 195 broadcasts", () => {
    expect(day.channels.map((c) => [c.displayNumber, c.name])).toEqual([
      [1, "ARD"],
      [2, "ZDF"],
      [3, "SAT.1"],
      [4, "RTL"],
      [6, "Tele 5"],
      [7, "PRO 7"],
    ]);
    expect(day.broadcasts).toHaveLength(195);
  });
  it("finds prime-time slots", () => {
    expect(on("ard", "21:10")?.title).toBe("Eiskunstlauf-WM live");
    expect(on("ard", "22:29")?.title).toBe("Eiskunstlauf-WM live");
    expect(on("rtl-plus", "20:15")?.title).toBe("Gottschalk");
  });
  it("finds after-midnight broadcasts on the same TV day", () => {
    expect(on("ard", "00:45")?.title).toBe("Detektiv Rockford: Anruf genügt");
    expect(on("pro-7", "05:59")?.title).toBe("Das Geheimnis der blauen Tropfen");
  });
  it("shows the test card after Sendeschluss and before programme start", () => {
    expect(on("ard", "01:25")).toBeNull();
    expect(on("ard", "08:59")).toBeNull();
    expect(on("zdf", "03:00")).toBeNull();
    expect(upcomingBroadcast(broadcastsOf(day, "ard"), 400)?.title).toBe("Tagesschau");
  });
  it("continues late-night programmes running past 06:00 into the next morning", () => {
    // PRO 7 runs until 06:20, Tele 5 "Video nonstop" until 06:05.
    expect(on("pro-7", "06:10")?.title).toBe("Das Geheimnis der blauen Tropfen");
    expect(on("pro-7", "06:20")?.title).toBe("Agentur Maxwell");
    expect(on("tele-5", "06:02")?.title).toBe("Video nonstop");
    expect(on("tele-5", "06:05")?.title).toBe("WNT Worldnews");
  });
  it("links to the next broadcast", () => {
    const cur = on("zdf", "17:50")!;
    expect(nextBroadcast(broadcastsOf(day, "zdf"), cur)?.title).toBe("Lotto am Mittwoch");
  });
});

describe("media matches", () => {
  it("maps seed levels to match levels", () => {
    expect(matchLevelOf(day, on("zdf", "16:30")!)).toBe("exact");
    // Same event, but a foreign broadcast with other commentary: only "similar".
    expect(matchLevelOf(day, on("ard", "21:30")!)).toBe("same_show");
    expect(matchLevelOf(day, on("rtl-plus", "17:20")!)).toBe("same_show_period");
    expect(matchLevelOf(day, on("ard", "11:03")!)).toBe("same_show");
    expect(matchLevelOf(day, on("ard", "23:10")!)).toBe("none");
  });
  it("marks YouTube as embeddable and Mediathek as link-out", () => {
    const yt = mediaFor(day, on("ard", "21:30")!)!;
    expect(yt).toMatchObject({ provider: "youtube", providerVideoId: "L9j0jrUADG0", embeddable: true });
    const zdf = mediaFor(day, on("zdf", "18:00")!)!;
    expect(zdf).toMatchObject({ provider: "zdf", providerVideoId: null, embeddable: false });
  });
  it("builds a fallback search link without the repeat marker", () => {
    expect(searchUrlFor(b(0, 1, "Showladen (Wh.)"), "1991-03-13")).toBe(
      "https://www.youtube.com/results?search_query=Showladen%201991",
    );
  });
});

describe("seek-in-progress", () => {
  const show = b(1270, 1350);
  it("seeks to now − start", () => {
    expect(seekOffsetSeconds(show, 1270 * 60)).toBe(0);
    expect(seekOffsetSeconds(show, 1282 * 60 + 30)).toBe(12 * 60 + 30);
  });
  it("loops recordings shorter than the elapsed time", () => {
    expect(seekOffsetSeconds(show, 1279 * 60, 600)).toBe(540);
    expect(seekOffsetSeconds(show, 1280 * 60, 600)).toBe(0);
    expect(seekOffsetSeconds(show, 1290 * 60 + 5, 398)).toBe(1205 % 398);
  });
  it("reports minutes since start", () => {
    expect(minutesSinceStart(show, 1290 * 60 + 59)).toBe(20);
  });
  it("handles after-midnight and overhang positions", () => {
    const late = b(1795, 1820);
    expect(seekOffsetSeconds(late, 1799 * 60)).toBe(4 * 60);
    // 06:10 next morning = 370 on the replayed day
    expect(seekOffsetSeconds(late, 370 * 60)).toBe(15 * 60);
    expect(progressOf(late, 370 * 60)).toBeCloseTo(0.6);
  });
});

describe("ad breaks", () => {
  const channel = (id: string) => day.channels.find((c) => c.id === id)!;
  it("only exist for private channels", () => {
    expect(adBreakFor(day, channel("rtl-plus"))?.providerVideoId).toBe("Uclokv3iEnw");
    expect(adBreakFor(day, channel("zdf"))).toBeNull();
    expect(adBreakFor(day, channel("ard"))).toBeNull();
  });
  it("run in the last 3 minutes of programmes of at least 20 minutes", () => {
    const show = b(1215, 1275);
    expect(isInAdWindow(show, 1271)).toBe(false);
    expect(isInAdWindow(show, 1272)).toBe(true);
    expect(isInAdWindow(show, 1274)).toBe(true);
    expect(isInAdWindow(show, 1275)).toBe(false);
    expect(isInAdWindow(b(1000, 1010), 1008)).toBe(false);
  });
});

describe("fallbackFor", () => {
  const ch = (id: string) => day.channels.find((c) => c.id === id)!;
  const fake = (channelId: string, startMin: number, endMin: number, extra: Partial<Broadcast> = {}): Broadcast => ({
    id: `${channelId}-x`, channelId, startMin, endMin, title: "X", description: null, ...extra,
  });
  it("picks the nearest embeddable programme on the same channel", () => {
    const veranda = on("ard", "23:10")!;
    const fb = fallbackFor(day, ch("ard"), veranda);
    expect(fb?.kind).toBe("programme");
    if (fb?.kind === "programme") {
      expect(fb.broadcast.channelId).toBe("ard");
      expect(fb.media.embeddable).toBe(true);
    }
  });
  it("prefers the earlier neighbour on equal distance", () => {
    const yt = mediaFor(day, on("ard", "21:30")!)!;
    const t: Channel = { id: "t", name: "T", displayNumber: 9, isPrivate: false };
    const before = fake("t", 600, 630, { id: "t-600" });
    const gap = fake("t", 630, 660, { id: "t-630" });
    const after = fake("t", 660, 690, { id: "t-660" });
    const synthetic = { ...day, channels: [t], broadcasts: [before, gap, after], media: { "t-600": yt, "t-660": yt }, adBreaks: [] };
    const fb = fallbackFor(synthetic, t, gap);
    expect(fb?.kind === "programme" && fb.broadcast.id).toBe("t-600");
  });
  it("falls back to the ad break when a channel has no embeddable programme", () => {
    const bare = { ...day, media: {} };
    const fb = fallbackFor(bare, ch("rtl-plus"), fake("rtl-plus", 700, 730));
    expect(fb).toEqual({ kind: "ad", adBreak: adBreakFor(day, ch("rtl-plus")) });
    expect(fallbackFor(bare, ch("ard"), fake("ard", 700, 730))).toBeNull();
  });
});

describe("fallbackFor preferences", () => {
  const t: Channel = { id: "t", name: "T", displayNumber: 9, isPrivate: true };
  const mk = (startMin: number): Broadcast => ({ id: `t-${startMin}`, channelId: "t", startMin, endMin: startMin + 30, title: "X", description: null });
  const video = (id: string, durationS: number | null) => ({
    provider: "youtube" as const, url: `https://www.youtube.com/watch?v=${id}`, providerVideoId: id, embeddable: true,
    durationS, matchLevel: "same_show" as const, note: "", alt: null,
  });
  const [near, gap, far] = [mk(600), mk(630), mk(720)];
  const base = { ...day, channels: [t], broadcasts: [near, gap, far], adBreaks: [{ channelId: "t", provider: "youtube" as const, url: "u", providerVideoId: "ad000000000", note: "", alternatives: [] }] };
  it("skips short clips when a longer recording exists", () => {
    const d = { ...base, media: { "t-600": video("short000000", 60), "t-720": video("long0000000", 1800) } };
    const fb = fallbackFor(d, t, gap);
    expect(fb?.kind === "programme" && fb.media.providerVideoId).toBe("long0000000");
  });
  it("still uses a short clip when nothing longer exists", () => {
    const d = { ...base, media: { "t-600": video("short000000", 60) } };
    const fb = fallbackFor(d, t, gap);
    expect(fb?.kind === "programme" && fb.media.providerVideoId).toBe("short000000");
  });
  it("skips videos that failed to play, then falls back to the ad break", () => {
    const d = { ...base, media: { "t-600": video("short000000", 60) } };
    expect(fallbackFor(d, t, gap, new Set(["short000000"]))?.kind).toBe("ad");
    expect(fallbackFor(d, t, gap, new Set(["short000000", "ad000000000"]))).toBeNull();
  });
});

describe("gapAround", () => {
  const list = [b(600, 660), b(700, 760)];
  it("spans from the previous end to the next start", () => {
    expect(gapAround(list, "t", 680)).toMatchObject({ startMin: 660, endMin: 700, title: "Programm unbekannt" });
  });
  it("extends to the TV-day bounds at the edges", () => {
    expect(gapAround(list, "t", 400)).toMatchObject({ startMin: 360, endMin: 600 });
    expect(gapAround(list, "t", 1500)).toMatchObject({ startMin: 760, endMin: 1800 });
  });
});

describe("pickCuratedMatch", () => {
  const generic = { matchTitle: "Tagesschau", url: "g" };
  const at20 = { matchTitle: "Tagesschau", channel: "ard", start: "20:00", url: "s" };
  it("prefers the entry restricted to this broadcast", () => {
    expect(pickCuratedMatch([generic, at20], { title: "Tagesschau", channel: "ard", start: "20:00" })?.url).toBe("s");
    expect(pickCuratedMatch([at20, generic], { title: "Tagesschau", channel: "ard", start: "20:00" })?.url).toBe("s");
  });
  it("falls back to the title-only entry elsewhere", () => {
    expect(pickCuratedMatch([generic, at20], { title: "Tagesschau", channel: "ard", start: "13:00" })?.url).toBe("g");
    expect(pickCuratedMatch([at20], { title: "Tagesschau", channel: "zdf", start: "20:00" })).toBeUndefined();
  });
});

describe("simulcastChannels", () => {
  it("finds the joint ARD/ZDF morning programme", () => {
    expect(simulcastChannels(day, on("ard", "11:30")!).map((c) => c.id)).toEqual(["zdf"]);
    expect(simulcastChannels(day, on("zdf", "11:30")!).map((c) => c.id)).toEqual(["ard"]);
  });
  it("is empty once the channels split at 13:45", () => {
    expect(simulcastChannels(day, on("ard", "14:00")!)).toEqual([]);
    expect(simulcastChannels(day, on("rtl-plus", "11:30")!)).toEqual([]);
  });
});

describe("nowAndNextByChannel", () => {
  it("lists every channel in programme order with now and next", () => {
    const rows = nowAndNextByChannel(day, 1215); // 20:15
    expect(rows.map((r) => r.channel.displayNumber)).toEqual([...rows.map((r) => r.channel.displayNumber)].sort((a, b) => a - b));
    const ard = rows.find((r) => r.channel.id === "ard")!;
    expect(ard.now?.startMin).toBeLessThanOrEqual(1215);
    expect(ard.next!.startMin).toBeGreaterThan(1215);
  });
  it("handles after-midnight broadcasts", () => {
    const late = day.broadcasts.find((b) => b.startMin >= 1440)!; // e.g. a broadcast at 00:30
    const row = nowAndNextByChannel(day, late.startMin + 1).find((r) => r.channel.id === late.channelId)!;
    expect(row.now).toEqual(late);
    for (const r of nowAndNextByChannel(day, late.startMin)) if (r.now && r.next) expect(r.next.startMin).toBeGreaterThan(r.now.startMin);
  });
  it("shows the next broadcast when nothing is on", () => {
    const rows = nowAndNextByChannel(day, 300 + 60); // 06:00, before most channels start
    for (const r of rows) if (!r.now && r.next) expect(r.next.startMin).toBeGreaterThanOrEqual(360);
  });
});

describe("nearestVideoBroadcast", () => {
  const b = (id: string, startMin: number, endMin: number): Broadcast => ({ id, channelId: "ard", startMin, endMin, title: id, description: null });
  const shows = [b("a", 600, 660), b("b", 660, 720), b("c", 720, 780), b("d", 780, 840)];
  const day = {
    date: "1991-03-13",
    completeness: "partial",
    source: { name: "t", url: "", licenseStatus: "not_required" },
    channels: [],
    broadcasts: shows,
    media: Object.fromEntries(["b", "d"].map((id) => [id, { provider: "youtube", url: `https://y/${id}`, providerVideoId: id, embeddable: true, durationS: null, matchLevel: "same_show", note: "", alt: null }])),
    adBreaks: [],
  } as TvDay;
  it("keeps the show on air if it has a video", () => {
    expect(nearestVideoBroadcast(day, shows, 670)?.id).toBe("b");
  });
  it("otherwise takes the next show with a video, then the last earlier one", () => {
    expect(nearestVideoBroadcast(day, shows, 610)?.id).toBe("b");
    expect(nearestVideoBroadcast(day, shows, 730)?.id).toBe("d");
    expect(nearestVideoBroadcast(day, shows, 900)?.id).toBe("d");
    expect(nearestVideoBroadcast(day, shows, 730, (x) => x.id === "b")?.id).toBe("b");
    expect(nearestVideoBroadcast(day, shows, 730, () => false)).toBeNull();
  });
});
