import { describe, expect, it } from "vitest";
import { eventById, eventDay, eventGenreOf, eventsAround, eventVideos, eventWindow, HISTORY_EVENTS, nearestEvent } from "./events";
import type { PoolVideo } from "./seamless";
import { TV_DAY_END_MIN, TV_DAY_START_MIN } from "./time";
import type { MediaCandidate, TvDay } from "./types";

const golf = eventById("golfkrieg-1991")!;
const video = (channelId: string, date: string, startMin: number, title: string, opts: Partial<MediaCandidate> = {}): PoolVideo => ({
  channelId,
  date,
  title,
  startMin,
  media: {
    provider: "youtube",
    url: `https://www.youtube.com/watch?v=${channelId}${date}${startMin}`,
    providerVideoId: "abcdefghijk",
    embeddable: true,
    durationS: 900,
    matchLevel: "exact",
    note: "",
    alt: null,
    ...opts,
  },
});
const base = { date: "1991-03-13", completeness: "full", channels: [], broadcasts: [], media: {} } as unknown as TvDay;

describe("events", () => {
  it("have unique ids and dates in the 90s, oldest first", () => {
    expect(new Set(HISTORY_EVENTS.map((e) => e.id)).size).toBe(HISTORY_EVENTS.length);
    expect(HISTORY_EVENTS.every((e) => e.date >= "1990-01-01" && e.date <= "1999-12-31")).toBe(true);
    expect(HISTORY_EVENTS.map((e) => e.date)).toEqual([...HISTORY_EVENTS.map((e) => e.date)].sort());
  });
  it("window: a day before to the days after (default 10)", () => {
    expect(eventWindow(golf)).toEqual({ from: "1991-01-16", to: "1991-01-31" });
    expect(eventWindow(eventById("eschede-1998")!)).toEqual({ from: "1998-06-02", to: "1998-06-13" });
    expect(eventsAround("1991-01-20").map((e) => e.id)).toEqual(["golfkrieg-1991"]);
    expect(eventsAround("1991-06-01")).toEqual([]);
    expect(nearestEvent("1991-02-10").id).toBe("golfkrieg-1991");
  });
  it("reporting shows count, other programmes don't", () => {
    for (const t of [
      "Tagesschau",
      "heute-journal",
      "RTL aktuell",
      "Brennpunkt",
      "Spiegel TV",
      "ZDF spezial",
      "Schreinemakers live",
      "PRO7 Nachrichten",
    ])
      expect(eventGenreOf(golf, t), t).not.toBeNull();
    for (const t of ["Aktenzeichen XY … ungelöst", "Sesamstraße", "Dallas", "Top of the Pops"]) expect(eventGenreOf(golf, t), t).toBeNull();
    // An event's own extra titles: the music shows for a band.
    expect(eventGenreOf(eventById("take-that-1996")!, "Top of the Pops")).toBe("extra");
  });
  it("selects exact recordings in the window, in airing order, without excluded ones", () => {
    const pool = [
      video("ard", "1991-01-17", 1200, "Tagesschau"),
      video("ard", "1991-01-16", 1350, "Tagesthemen"),
      video("zdf", "1991-01-17", 1185, "heute-journal", { matchLevel: "same_show_period" }),
      video("rtl-plus", "1991-02-20", 1125, "RTL aktuell"),
      video("rtl-plus", "1991-01-21", 1125, "RTL aktuell"),
      video("ard", "1991-01-18", 1215, "Aktenzeichen XY … ungelöst"),
    ];
    const excluded = new Set([pool[4]!.media.url]);
    expect(eventVideos(golf, pool).map((v) => `${v.channelId} ${v.date} ${v.title}`)).toEqual([
      "ard 1991-01-16 Tagesthemen",
      "ard 1991-01-17 Tagesschau",
      "rtl-plus 1991-01-21 RTL aktuell",
    ]);
    expect(eventVideos(golf, pool, excluded).map((v) => v.channelId)).toEqual(["ard", "ard"]);
  });
  it("builds one channel per station, looping its recordings through the TV day", () => {
    const pool = [
      video("ard", "1991-01-16", 1350, "Tagesthemen", { durationS: 1800 }),
      video("ard", "1991-01-17", 1200, "Tagesschau"),
      video("rtl-plus", "1991-01-21", 1125, "RTL aktuell", { durationS: null }),
    ];
    const day = eventDay(base, golf, pool);
    expect(day.date).toBe("1991-03-13");
    expect(day.channels.map((c) => [c.id, c.isPrivate])).toEqual([
      ["ard", false],
      ["rtl-plus", true],
    ]);
    const ard = day.broadcasts.filter((b) => b.channelId === "ard");
    expect(ard.slice(0, 3).map((b) => [b.title, b.startMin, b.endMin])).toEqual([
      ["Tagesthemen", TV_DAY_START_MIN, TV_DAY_START_MIN + 30],
      ["Tagesschau", TV_DAY_START_MIN + 30, TV_DAY_START_MIN + 45],
      ["Tagesthemen", TV_DAY_START_MIN + 45, TV_DAY_START_MIN + 75],
    ]);
    expect(ard[0]!.description).toBe("Gesendet: Mittwoch, 16. Januar 1991, 22:30 Uhr");
    expect(ard.at(-1)!.endMin).toBe(TV_DAY_END_MIN);
    // Unknown length: a 15-minute slot.
    expect(day.broadcasts.find((b) => b.channelId === "rtl-plus")!.endMin).toBe(TV_DAY_START_MIN + 15);
    for (const b of day.broadcasts) expect(day.media[b.id]).toBeDefined();
  });
  it("has no channels without material", () => {
    expect(eventDay(base, golf, []).channels).toEqual([]);
  });
});
