import { describe, expect, it } from "vitest";
import { parseReportInput } from "./report-input";

const ok = { url: "https://www.youtube.com/watch?v=abcdefghijk", reason: "unavailable", token: "1.abc" };

describe("parseReportInput", () => {
  it("accepts a well-formed report", () => {
    expect(parseReportInput({ ...ok, note: "Ton fehlt", automatic: false, tvDate: "1991-03-13" })).toEqual({ ...ok, note: "Ton fehlt", automatic: false, tvDate: "1991-03-13" });
  });
  it("accepts 'off_topic' with the Chronik event", () => {
    expect(parseReportInput({ ...ok, reason: "off_topic", event: "golfkrieg-1991" })).toEqual({ ...ok, reason: "off_topic", event: "golfkrieg-1991" });
    expect(parseReportInput({ ...ok, reason: "off_topic", event: { id: 1 } })).toBeNull();
  });
  it("rejects wrong kinds instead of failing later", () => {
    expect(parseReportInput({ ...ok, note: { evil: true } })).toBeNull();
    expect(parseReportInput({ ...ok, automatic: "yes" })).toBeNull();
    expect(parseReportInput({ ...ok, reason: "boring" })).toBeNull();
    expect(parseReportInput({ ...ok, url: "javascript:alert(1)" })).toBeNull();
    expect(parseReportInput({ ...ok, title: "x".repeat(301) })).toBeNull();
    expect(parseReportInput([ok])).toBeNull();
    expect(parseReportInput("report")).toBeNull();
    expect(parseReportInput(null)).toBeNull();
    expect(parseReportInput(new (class { url = ok.url })())).toBeNull();
  });
});
