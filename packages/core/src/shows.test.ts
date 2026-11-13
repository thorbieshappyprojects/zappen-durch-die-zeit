import { describe, expect, it } from "vitest";
import { rankShowHits, showKeyFromSlug, showPath, showSlug } from "./shows";

describe("show slugs", () => {
  it("round-trips the normalised title", () => {
    expect(showSlug("Die Simpsons (Wh.)")).toBe("die-simpsons");
    expect(showKeyFromSlug("die-simpsons")).toBe("die simpsons");
    expect(showSlug("Mini Playback Show")).toBe("mini-playback-show");
    expect(showKeyFromSlug(showSlug("Glücksrad"))).toBe("glücksrad");
    expect(showPath("Glücksrad")).toBe("/sendung/gl%C3%BCcksrad");
  });
  it("rejects malformed slugs", () => {
    expect(showKeyFromSlug("")).toBeNull();
    expect(showKeyFromSlug("---")).toBeNull();
    expect(showKeyFromSlug("Die-Simpsons")).toBeNull();
    expect(showKeyFromSlug("a%20b")).toBeNull();
  });
});

describe("rankShowHits", () => {
  it("puts exact and prefix matches first", () => {
    const hits = [
      { key: "die simpsons", withVideo: 9, airings: 40 },
      { key: "simpsons spezial", withVideo: 0, airings: 1 },
      { key: "simpsons", withVideo: 0, airings: 2 },
    ];
    expect(rankShowHits(hits, "Simpsons").map((h) => h.key)).toEqual(["simpsons", "simpsons spezial", "die simpsons"]);
  });
});
