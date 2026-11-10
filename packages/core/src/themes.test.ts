import { describe, expect, it } from "vitest";
import type { PoolVideo } from "./seamless";
import { themeDay, themeGenreOf } from "./themes";
import { TV_DAY_END_MIN, TV_DAY_START_MIN } from "./time";
import type { TvDay } from "./types";

const v = (channelId: string, title: string, i: number): PoolVideo => ({
  channelId,
  date: "1996-03-02",
  title,
  startMin: 480,
  media: {
    provider: "youtube",
    url: `https://www.youtube.com/watch?v=${channelId}${i}`.padEnd(43, "x"),
    providerVideoId: null,
    embeddable: true,
    durationS: 25 * 60,
    matchLevel: "same_show",
    note: "",
    alt: null,
  },
});
const day: TvDay = {
  date: "1991-03-13",
  completeness: "partial",
  source: { name: "t", url: "", licenseStatus: "not_required" },
  channels: [{ id: "ard", name: "ARD", displayNumber: 1, isPrivate: false }],
  broadcasts: [{ id: "ard-1200", channelId: "ard", startMin: 1200, endMin: 1215, title: "Tagesschau", description: null }],
  media: {},
  adBreaks: [],
};

describe("themes", () => {
  it("sorts titles into the theme's genres", () => {
    expect(themeGenreOf("kinder", "Disneys Gummibärenbande")).toBe("cartoon");
    expect(themeGenreOf("kinder", "Die Sendung mit der Maus")).toBe("kids");
    expect(themeGenreOf("kinder", "Tagesschau")).toBeNull();
    expect(themeGenreOf("kinder", "Chart Attack")).toBeNull();
    expect(themeGenreOf("kinder", "Art Attack")).toBe("kids");
    // Super RTL's afternoon and evening line-up.
    for (const t of ["Bonkers", "Marsupilami", "Extreme Dinosaurs", "Mummies Alive", "Hey Arnold!", "Disneys Doug", "Die Dinos", "Trickserien", "Super, Metty!"])
      expect(themeGenreOf("kinder", t)).not.toBeNull();
    expect(themeGenreOf("kinder", "Doug Henning zaubert")).toBeNull();
    expect(themeGenreOf("talk", "Hans Meiser")).toBe("talk");
    expect(themeGenreOf("talk", "Richterin Barbara Salesch")).toBe("court");
    expect(themeGenreOf("talk", "Vera am Mittag")).toBe("talk");
  });

  const pool = [
    ...["Die Sendung mit der Maus", "Sesamstraße", "Löwenzahn"].map((t, i) => v("ard", t, i)),
    ...["DuckTales", "Darkwing Duck", "Käpt'n Balu und seine tollkühne Crew", "Chip und Chap"].map((t, i) => v("super-rtl", t, i)),
    ...["Sailor Moon", "Tagesschau"].map((t, i) => v("rtl-2", t, i)), // only one cartoon: no channel
    v("zdf", "Chart Attack", 1), // a music show, not "Art Attack"
    v("zdf", "heute", 0),
  ];
  const out = themeDay(day, pool, "kinder");

  it("gives a channel to each station with enough shows of the theme, whatever the day's lineup", () => {
    expect(out.channels.map((c) => [c.id, c.displayNumber, c.isPrivate])).toEqual([
      ["ard", 1, false],
      ["super-rtl", 8, true],
    ]);
  });
  it("fills those channels around the clock with the theme only", () => {
    const srtl = out.broadcasts.filter((b) => b.channelId === "super-rtl");
    expect(srtl[0]!.startMin).toBe(TV_DAY_START_MIN);
    expect(srtl[srtl.length - 1]!.endMin).toBe(TV_DAY_END_MIN);
    expect(out.broadcasts.every((b) => themeGenreOf("kinder", b.title))).toBe(true);
    expect(out.broadcasts.some((b) => b.title === "Tagesschau")).toBe(false);
  });
});
