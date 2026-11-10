import { describe, expect, it } from "vitest";
import { stationRecommendations } from "./recommendations";

const st = (slug: string, hidden: boolean, score: number, videos: number, shows: number) => ({ slug, name: slug.toUpperCase(), hidden, score, videos, shows });

describe("stationRecommendations", () => {
  const recs = stationRecommendations([
    st("ard", false, 0.2, 1000, 300),
    st("vox", false, 0.06, 80, 20), // weakest shown station
    st("kabel-1", true, 0.07, 60, 15), // all criteria met
    st("3sat", true, 0.02, 30, 12), // too few videos, too little coverage
    st("mdr", true, 0.09, 55, 6), // too few shows
  ]);
  it("lists only hidden stations, ready ones first", () => {
    expect(recs.map((r) => r.slug)).toEqual(["kabel-1", "mdr", "3sat"]);
    expect(recs.map((r) => r.ready)).toEqual([true, false, false]);
  });
  it("says which criterion is missing", () => {
    expect(recs[1]!.checks.map((c) => c.met)).toEqual([true, false, true]);
    expect(recs[2]!.checks.map((c) => c.met)).toEqual([false, true, false]);
    expect(recs[0]!.checks[2]!.label).toContain("6 %");
  });
});
