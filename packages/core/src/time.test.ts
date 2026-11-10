import { describe, expect, it } from "vitest";
import {
  isCalendarDate,
  addDays,
  advanceTvDaySeconds,
  berlinClockSeconds,
  berlinOffsetMs,
  clockToTvDayMin,
  formatClock,
  formatTvDayDate,
  formatTvDayShort,
  parseHHMM,
  tvDayDateOf,
  tvDayMinToInstant,
  tvDaySecondsAt,
} from "./time";

describe("parseHHMM / formatClock", () => {
  it("parses regular and after-midnight times", () => {
    expect(parseHHMM("06:00")).toBe(360);
    expect(parseHHMM("21:10")).toBe(1270);
    expect(parseHHMM("25:15")).toBe(1515);
  });
  it("rejects garbage", () => {
    expect(() => parseHHMM("9")).toThrow();
    expect(() => parseHHMM("10:75")).toThrow();
  });
  it("formats with wrap-around past midnight", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(1270)).toBe("21:10");
    expect(formatClock(1530)).toBe("01:30");
    expect(formatClock(1800)).toBe("06:00");
    expect(formatClock(-1)).toBe("23:59");
  });
});

describe("clockToTvDayMin", () => {
  it("keeps 06:00–23:59 as is", () => {
    expect(clockToTvDayMin(360)).toBe(360);
    expect(clockToTvDayMin(1439)).toBe(1439);
  });
  it("moves 00:00–05:59 to the end of the TV day", () => {
    expect(clockToTvDayMin(0)).toBe(1440);
    expect(clockToTvDayMin(90)).toBe(1530);
    expect(clockToTvDayMin(359)).toBe(1799);
  });
});

describe("Berlin wall clock of real instants", () => {
  it("uses CET in winter and CEST in summer", () => {
    expect(berlinClockSeconds(new Date("2026-01-15T20:30:15Z"))).toBe(21 * 3600 + 30 * 60 + 15);
    expect(berlinClockSeconds(new Date("2026-07-15T20:30:15Z"))).toBe(22 * 3600 + 30 * 60 + 15);
    expect(berlinOffsetMs(new Date("2026-01-15T12:00:00Z"))).toBe(3600_000);
    expect(berlinOffsetMs(new Date("2026-07-15T12:00:00Z"))).toBe(7200_000);
  });
  it("places after-midnight instants at the end of the previous TV day", () => {
    // 01:30 Berlin on 14.03.1991 (CET)
    const instant = new Date("1991-03-14T00:30:00Z");
    expect(tvDaySecondsAt(instant)).toBe(1530 * 60);
    expect(tvDayDateOf(instant)).toBe("1991-03-13");
  });
  it("starts a new TV day at 06:00 Berlin", () => {
    expect(tvDayDateOf(new Date("1991-03-14T04:59:59Z"))).toBe("1991-03-13");
    expect(tvDayDateOf(new Date("1991-03-14T05:00:00Z"))).toBe("1991-03-14");
  });
});

describe("tvDayMinToInstant", () => {
  it("converts TV-day minutes to real instants (CET)", () => {
    expect(tvDayMinToInstant("1991-03-13", 1270).toISOString()).toBe("1991-03-13T20:10:00.000Z");
    expect(tvDayMinToInstant("1991-03-13", 1515).toISOString()).toBe("1991-03-14T00:15:00.000Z");
  });
  it("handles CEST and the DST switch inside a TV day", () => {
    expect(tvDayMinToInstant("1991-06-01", 1200).toISOString()).toBe("1991-06-01T18:00:00.000Z");
    // 1991: DST started on 31 March at 02:00 → 03:00. The TV day of 30.03. spans it.
    expect(tvDayMinToInstant("1991-03-30", 1440 + 60).toISOString()).toBe("1991-03-31T00:00:00.000Z");
    expect(tvDayMinToInstant("1991-03-30", 1440 + 180).toISOString()).toBe("1991-03-31T01:00:00.000Z");
  });
  it("round-trips with tvDaySecondsAt", () => {
    for (const min of [360, 720, 1439, 1440, 1525, 1799]) {
      const instant = tvDayMinToInstant("1991-03-13", min);
      expect(tvDaySecondsAt(instant)).toBe(min * 60);
      expect(tvDayDateOf(instant)).toBe("1991-03-13");
    }
  });
});

describe("calendar helpers", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("1991-03-13", 1)).toBe("1991-03-14");
    expect(addDays("1991-03-01", -1)).toBe("1991-02-28");
    expect(addDays("1991-12-31", 1)).toBe("1992-01-01");
  });
  it("formats German dates", () => {
    expect(formatTvDayDate("1991-03-13")).toBe("Mittwoch, 13. März 1991");
    expect(formatTvDayShort("1991-03-13")).toBe("Mi 13.03.91");
  });
});

describe("advanceTvDaySeconds", () => {
  it("advances and wraps at the 06:00 TV-day boundary", () => {
    expect(advanceTvDaySeconds(1270 * 60, 90)).toBe(1270 * 60 + 90);
    expect(advanceTvDaySeconds(1799 * 60, 120)).toBe(361 * 60);
    expect(advanceTvDaySeconds(360 * 60, -60)).toBe(1799 * 60);
  });
});

describe("isCalendarDate", () => {
  it("accepts real dates only", () => {
    expect(isCalendarDate("1991-03-13")).toBe(true);
    expect(isCalendarDate("2000-02-29")).toBe(true);
    expect(isCalendarDate("2001-02-29")).toBe(false);
    expect(isCalendarDate("2001-13-01")).toBe(false);
    expect(isCalendarDate("abc")).toBe(false);
  });
});
