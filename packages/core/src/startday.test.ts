import { describe, expect, it } from "vitest";
import { calendarDistance, pickStartDay } from "./startday";

describe("pickStartDay", () => {
  const dates = ["1991-03-13", "1995-11-09", "1997-12-01", "1998-11-20", "1999-01-02"];
  it("takes today's date in an earlier year when we have it", () => {
    expect(pickStartDay(dates, "2026-11-09")).toEqual({ date: "1995-11-09", exact: true });
  });
  it("falls back to the nearest calendar date", () => {
    expect(pickStartDay(dates.filter((d) => d !== "1995-11-09"), "2026-11-09")).toEqual({ date: "1998-11-20", exact: false });
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
