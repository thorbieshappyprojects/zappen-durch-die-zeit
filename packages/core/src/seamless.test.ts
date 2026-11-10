import { describe, expect, it } from "vitest";
import { seamlessDay, type PoolVideo } from "./seamless";
import { TV_DAY_END_MIN, TV_DAY_START_MIN } from "./time";
import type { MediaCandidate, TvDay } from "./types";

const video = (id: string, minutes: number | null, level: MediaCandidate["matchLevel"] = "exact"): MediaCandidate => ({
  provider: "youtube",
  url: `https://www.youtube.com/watch?v=${id.padEnd(11, "x")}`,
  providerVideoId: id.padEnd(11, "x"),
  embeddable: true,
  durationS: minutes === null ? null : minutes * 60 + 30,
  matchLevel: level,
  note: "",
  alt: null,
});
const pv = (title: string, date: string, startMin: number, minutes: number, channelId = "rtl-plus"): PoolVideo => ({
  channelId,
  date,
  title,
  startMin,
  media: video(title.replace(/\W/g, "").slice(0, 8), minutes),
});

const day: TvDay = {
  date: "1995-10-24",
  completeness: "partial",
  source: { name: "t", url: "", licenseStatus: "not_required" },
  channels: [
    { id: "rtl-plus", name: "RTL", displayNumber: 4, isPrivate: true },
    { id: "3sat", name: "3sat", displayNumber: 9, isPrivate: false },
  ],
  broadcasts: [
    { id: "rtl-plus-1215", channelId: "rtl-plus", startMin: 1215, endMin: 1320, title: "Spielfilm", description: null },
    { id: "rtl-plus-1320", channelId: "rtl-plus", startMin: 1320, endMin: 1380, title: "Stern TV", description: null },
    { id: "3sat-1200", channelId: "3sat", startMin: 1200, endMin: 1215, title: "Kulturzeit", description: null },
  ],
  media: { "rtl-plus-1320": video("sterntv", 45) },
  adBreaks: [],
};

const pool = [
  pv("Punkt 12", "1995-10-23", 720, 60),
  pv("Explosiv", "1995-10-20", 1110, 30),
  pv("Der Preis ist heiß", "1996-02-01", 690, 25),
  pv("Unsere kleine Farm", "1993-05-04", 540, 45),
  pv("Kurzer Clip", "1995-10-24", 600, 2), // too short for a programme
  // Enough different shows for a whole day.
  ...["Explosiv Weekend", "Mini Playback Show", "Familien Duell", "Hans Meiser", "Bärbel Schäfer", "RTL aktuell", "Formel Eins"].map((t, i) =>
    pv(t, "1995-09-01", 600 + i * 90, 30),
  ),
];

describe("seamlessDay", () => {
  const out = seamlessDay(day, pool);
  const rtl = out.broadcasts.filter((b) => b.channelId === "rtl-plus");

  it("fills the whole TV day without gaps or overlaps", () => {
    expect(rtl[0]!.startMin).toBe(TV_DAY_START_MIN);
    expect(rtl[rtl.length - 1]!.endMin).toBe(TV_DAY_END_MIN);
    for (let i = 1; i < rtl.length; i++) expect(rtl[i]!.startMin).toBe(rtl[i - 1]!.endMin);
    expect(rtl.every((b) => out.media[b.id]?.embeddable)).toBe(true);
  });
  it("keeps a real broadcast with video in its slot, as long as the recording runs", () => {
    const stern = rtl.find((b) => b.title === "Stern TV")!;
    expect([stern.startMin, stern.endMin]).toEqual([1320, 1365]);
    expect(out.media[stern.id]?.matchLevel).toBe("exact");
    // The broadcast without a video is replaced.
    expect(rtl.some((b) => b.title === "Spielfilm")).toBe(false);
  });
  it("prefers shows from a similar time of day and marks borrowed videos", () => {
    const morning = rtl.find((b) => b.startMin >= 690 && b.startMin < 780)!;
    expect(["Punkt 12", "Der Preis ist heiß"]).toContain(morning.title);
    const punkt12 = rtl.find((b) => b.title === "Punkt 12")!;
    expect(out.media[punkt12.id]?.matchLevel).toBe("same_show_period");
    expect(punkt12.description).toBe("Aufnahme vom 23.10.1995");
    expect(out.media[rtl.find((b) => b.title === "Unsere kleine Farm")!.id]?.matchLevel).toBe("same_show");
    expect(rtl.some((b) => b.title === "Kurzer Clip")).toBe(false);
  });
  it("leaves out a channel with too few different shows, and is deterministic", () => {
    const few = seamlessDay(day, pool.slice(0, 4));
    expect(few.channels).toEqual([]);
    expect(few.broadcasts).toEqual([]);
    expect(out.channels.map((c) => c.id)).toEqual(["rtl-plus"]);
    expect(out.broadcasts.some((b) => b.channelId === "3sat")).toBe(false);
    expect(seamlessDay(day, pool)).toEqual(out);
  });
});
