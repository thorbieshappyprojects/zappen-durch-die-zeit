import { describe, expect, it } from "vitest";
import { calendarDistance, pickStartBroadcast, pickStartDay } from "./startday";
import type { Broadcast, MediaCandidate, TvDay } from "./types";

describe("pickStartDay", () => {
  const dates = ["1991-03-13", "1995-11-09", "1997-12-01", "1998-11-20", "1999-01-02"];
  it("takes today's date in an earlier year when we have it", () => {
    expect(pickStartDay(dates, "2026-11-09")).toEqual({ date: "1995-11-09", exact: true });
  });
  it("falls back to the nearest calendar date", () => {
    expect(
      pickStartDay(
        dates.filter((d) => d !== "1995-11-09"),
        "2026-11-09",
      ),
    ).toEqual({ date: "1998-11-20", exact: false });
  });
  it("counts across New Year", () => {
    expect(calendarDistance("1999-01-02", "2026-12-30")).toBe(3);
    expect(pickStartDay(["1991-03-13", "1999-01-02"], "2026-12-30")?.date).toBe("1999-01-02");
  });
  it("prefers the better-covered day among equally near ones", () => {
    expect(pickStartDay(["1991-03-13", "1992-03-13"], "2026-03-13", { "1991-03-13": 0.1, "1992-03-13": 0.3 })?.date).toBe("1992-03-13");
  });
  it("handles 29 February and an empty database", () => {
    expect(calendarDistance("1992-02-29", "2026-02-28")).toBe(0);
    expect(pickStartDay([], "2026-11-09")).toBeNull();
  });
});

describe("pickStartBroadcast", () => {
  const bc = (channelId: string, startMin: number, endMin: number): Broadcast => ({
    id: `${channelId}-${startMin}`,
    channelId,
    startMin,
    endMin,
    title: "X",
    description: null,
  });
  const media = (matchLevel: MediaCandidate["matchLevel"], embeddable = true): MediaCandidate => ({
    provider: "youtube",
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    providerVideoId: "abcdefghijk",
    embeddable,
    durationS: null,
    matchLevel,
    note: "",
    alt: null,
  });
  const dayWith = (entries: [Broadcast, MediaCandidate | null][]): TvDay =>
    ({
      date: "1993-05-08",
      completeness: "full",
      channels: [],
      broadcasts: entries.map(([b]) => b),
      media: Object.fromEntries(entries.filter(([, m]) => m).map(([b, m]) => [b.id, m!])),
    }) as unknown as TvDay;
  const evening = 20 * 60 + 15;

  it("takes the exact broadcast on air now", () => {
    const day = dayWith([
      [bc("ard", 1170, 1200), media("exact")],
      [bc("rtl", 1200, 1260), media("same_show_period")],
      [bc("zdf", 1205, 1290), media("exact")],
    ]);
    expect(pickStartBroadcast(day, evening)).toEqual({ channelId: "zdf", tvDayMin: 1205 });
  });
  it("otherwise the exact broadcast starting nearest to now, before or after", () => {
    const day = dayWith([
      [bc("ard", 600, 630), media("exact")],
      [bc("rtl", 1300, 1330), media("exact")],
      [bc("sat1", 1215, 1300), media("same_show")],
    ]);
    expect(pickStartBroadcast(day, evening)).toEqual({ channelId: "rtl", tvDayMin: 1300 });
  });
  it("skips hidden stations, unplayable videos and links without a player", () => {
    const day = dayWith([
      [bc("tm3", 1215, 1300), media("exact")],
      [bc("ard", 1215, 1300), media("exact", false)],
      [bc("zdf", 1215, 1300), null],
      [bc("rtl", 1500, 1560), media("exact")],
      [bc("pro7", 1215, 1300), media("exact")],
    ]);
    const start = pickStartBroadcast(day, evening, { hidden: new Set(["tm3"]), playable: (b) => b.channelId !== "pro7" });
    expect(start).toEqual({ channelId: "rtl", tvDayMin: 1500 });
  });
  it("falls back to the same show from that year, never to other episodes", () => {
    expect(pickStartBroadcast(dayWith([[bc("rtl", 900, 960), media("same_show_period")]]), evening)).toEqual({
      channelId: "rtl",
      tvDayMin: 900,
    });
    expect(pickStartBroadcast(dayWith([[bc("rtl", 1215, 1300), media("same_show")]]), evening)).toBeNull();
  });
});
