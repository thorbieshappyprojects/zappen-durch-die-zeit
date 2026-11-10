import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { tvDayFromSeed, type SeedFile } from "./seed";
import { offAirMessage, stationAtSlot, stationBySlug, stationStatus, STATIONS, withStationNames } from "./stations";

const at = (slot: number) => stationAtSlot(slot)!;

describe("stations", () => {
  it("knows which stations did not exist yet in March 1991", () => {
    expect(stationStatus(at(5), "1991-03-13")).toEqual({ kind: "not_yet", startsOn: "1993-03-06" });
    expect(stationStatus(at(8), "1991-03-13")).toEqual({ kind: "not_yet", startsOn: "1995-04-28" });
    expect(stationStatus(at(1), "1991-03-13")).toEqual({ kind: "on_air" });
    expect(stationStatus(at(6), "1991-03-13")).toEqual({ kind: "on_air" });
    expect(stationStatus(at(10), "1991-03-13")).toEqual({ kind: "not_yet", startsOn: "1993-01-25" });
    expect(stationStatus(at(11), "1991-03-13")).toEqual({ kind: "not_yet", startsOn: "1992-02-29" });
    expect(stationStatus(at(10), "1998-11-20").kind).toBe("on_air");
    expect(stationStatus(at(15), "1991-03-13")).toEqual({ kind: "not_yet", startsOn: "1992-01-01" });
    expect(stationStatus(at(12), "1991-03-13").kind).toBe("on_air");
    expect(stationStatus(at(16), "1991-03-13").kind).toBe("on_air");
    expect(stationStatus(at(17), "1991-03-13")).toEqual({ kind: "not_yet", startsOn: "1993-12-01" });
  });
  it("handles launch days and gaps", () => {
    expect(stationStatus(at(5), "1993-03-05").kind).toBe("not_yet");
    expect(stationStatus(at(5), "1993-03-06").kind).toBe("on_air");
    expect(stationStatus(at(9), "1997-01-01").kind).toBe("on_air");
    expect(stationStatus(at(9), "1999-12-31")).toEqual({ kind: "paused", endedOn: "1998-05-31", resumesOn: "2005-09-01" });
    expect(stationStatus(at(6), "1996-06-01")).toEqual({ kind: "paused", endedOn: "1992-12-31", resumesOn: "2002-01-28" });
  });
  it("writes German messages", () => {
    expect(offAirMessage(at(5), "1991-03-13")).toEqual({
      headline: "RTL II gab es am 13. März 1991 noch nicht.",
      detail: "Sendestart: 6. März 1993",
    });
    expect(offAirMessage(at(9), "1999-12-31")?.headline).toBe("Nickelodeon war am 31. Dezember 1999 nicht auf Sendung.");
    expect(offAirMessage(at(1), "1991-03-13")).toBeNull();
  });
});

describe("station names", () => {
  it("shows every channel of a day with its registry name, not the source's spelling", () => {
    const seed = JSON.parse(readFileSync(new URL("../../../seed/1991-03-13.json", import.meta.url), "utf8")) as SeedFile;
    const day = tvDayFromSeed(seed);
    expect(day.channels.find((c) => c.id === "pro-7")?.name).toBe("PRO 7"); // as printed in the 1991 guide
    const shown = withStationNames(day);
    for (const c of shown.channels) expect(c.name).toBe(stationBySlug(c.id)!.name);
    expect(shown.channels.find((c) => c.id === "pro-7")?.name).toBe("ProSieben");
  });
  it("covers every slot with a unique slug", () => {
    expect(new Set(STATIONS.map((s) => s.slug)).size).toBe(STATIONS.length);
  });
});
