import { describe, expect, it } from "vitest";
import { parseShareParams, shareUrl } from "./share";

const slugs = ["ard", "rtl-plus", "3sat"];

describe("share links", () => {
  it("reads channel and time", () => {
    expect(parseShareParams({ sender: "rtl-plus", zeit: "20:15" }, slugs)).toEqual({ channelId: "rtl-plus", tvDayMin: 1215 });
  });
  it("puts times after midnight into the night after the date", () => {
    expect(parseShareParams({ zeit: "00:30" }, slugs)).toEqual({ tvDayMin: 1470 });
    expect(parseShareParams({ zeit: "05:59" }, slugs)).toEqual({ tvDayMin: 1799 });
    expect(parseShareParams({ zeit: "06:00" }, slugs)).toEqual({ tvDayMin: 360 });
  });
  it("ignores unknown channels and malformed times", () => {
    expect(parseShareParams({ sender: "foo", zeit: "25:00" }, slugs)).toEqual({});
    expect(parseShareParams({ zeit: "abc" }, slugs)).toEqual({});
    expect(parseShareParams({}, slugs)).toEqual({});
  });
  it("builds links that parse back to the same target", () => {
    const url = shareUrl("1999-11-09", { channelId: "rtl-plus", tvDayMin: 1470 }, "https://example.org");
    expect(url).toBe("https://example.org/tag/1999-11-09?sender=rtl-plus&zeit=00%3A30");
    const q = new URL(url).searchParams;
    expect(parseShareParams({ sender: q.get("sender"), zeit: q.get("zeit") }, slugs)).toEqual({ channelId: "rtl-plus", tvDayMin: 1470 });
    expect(shareUrl("1991-03-13")).toBe("/tag/1991-03-13");
  });
  it("carries a theme programme, and ignores unknown ones", () => {
    const url = shareUrl("1995-10-24", { channelId: "ard", programme: "kinder" });
    expect(url).toBe("/tag/1995-10-24?sender=ard&programm=kinder");
    expect(parseShareParams({ sender: "ard", programm: "kinder" }, slugs)).toEqual({ channelId: "ard", programme: "kinder" });
    expect(parseShareParams({ programm: "krimi" }, slugs)).toEqual({});
  });
});
