import { describe, expect, it } from "vitest";
import { bestDays, channelDayHints, coverageHue, coverageScore, dayCoverageScore, FULL_DAY_BROADCASTS, MATCH_POINTS } from "./coverage";

describe("coverage", () => {
  it("scores 10/3/1/0 points against the maximum", () => {
    const points = MATCH_POINTS.exact + MATCH_POINTS.same_show_period + MATCH_POINTS.same_show + MATCH_POINTS.none;
    expect(points).toBe(14);
    expect(coverageScore(points, 4)).toBeCloseTo(14 / 40);
    expect(coverageScore(0, 0)).toBe(0);
  });
  it("scores a short day against a full programme day", () => {
    // An assumed day with 10 slots, all with a same-year video, is no well-covered day.
    expect(dayCoverageScore(10 * MATCH_POINTS.same_show_period, 10)).toBeCloseTo(30 / (FULL_DAY_BROADCASTS * 10));
    expect(dayCoverageScore(300, 200)).toBe(coverageScore(300, 200));
    expect(dayCoverageScore(0, 0)).toBe(0);
  });
  it("maps scores onto red → green, green from 15 %", () => {
    expect(coverageHue(0)).toBe(0);
    expect(coverageHue(0.075)).toBe(60);
    expect(coverageHue(0.15)).toBe(120);
    expect(coverageHue(0.9)).toBe(120);
  });
  it("ranks the best day of each year, ignoring short days", () => {
    const rows = [
      { date: "1998-11-20", points: 45, accuratePoints: 45, broadcasts: 32 }, // only 32 broadcasts
      { date: "1991-03-13", points: 268, accuratePoints: 150, broadcasts: 195 },
      { date: "1991-03-27", points: 220, accuratePoints: 20, broadcasts: 190 }, // same year: only one 1991 day
      { date: "1997-12-01", points: 120, accuratePoints: 100, broadcasts: 365 },
      { date: "1999-12-31", points: 20, accuratePoints: 0, broadcasts: 278 },
    ];
    expect(bestDays(rows, 3).map((d) => d.date)).toEqual(["1991-03-13", "1997-12-01", "1999-12-31"]);
    // Exact matches beat a higher score made of stand-ins.
    expect(bestDays([...rows, { date: "1999-12-30", points: 15, accuratePoints: 10, broadcasts: 250, exact: 1 }], 1)[0]?.date).toBe("1999-12-30");
  });
  it("points each channel to its nearest and best other day", () => {
    const rows = [
      { date: "1991-03-13", channel: "ard", broadcasts: 40, points: 60 },
      { date: "1991-03-14", channel: "ard", broadcasts: 40, points: 20 },
      { date: "1991-04-10", channel: "ard", broadcasts: 40, points: 120 },
      { date: "1993-07-06", channel: "3sat", broadcasts: 30, points: 10 },
      { date: "1993-07-07", channel: "3sat", broadcasts: 5, points: 25 }, // too short to be "best"
    ];
    const hints = channelDayHints(rows, "1991-03-13");
    expect(hints.ard).toEqual({ nearest: "1991-03-14", best: { date: "1991-04-10", score: 0.3, exact: 0 } });
    expect(hints["3sat"]?.nearest).toBe("1993-07-06");
    expect(hints["3sat"]?.best?.date).toBe("1993-07-06");
  });
  it("prefers a channel day with exact matches as the best day", () => {
    const rows = [
      { date: "1996-08-29", channel: "pro-7", broadcasts: 17, points: 51, exact: 0 }, // all same year
      { date: "1991-03-12", channel: "pro-7", broadcasts: 32, points: 42, exact: 1 },
    ];
    expect(channelDayHints(rows, "1995-01-01")["pro-7"]?.best).toEqual({ date: "1991-03-12", score: 42 / 320, exact: 1 });
  });
});
