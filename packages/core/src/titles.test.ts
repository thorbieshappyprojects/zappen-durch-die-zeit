import { describe, expect, it } from "vitest";
import { broadcastFlags, normalizeTitle } from "./titles";

describe("normalizeTitle", () => {
  it("strips repeat and continuation markers", () => {
    expect(normalizeTitle("Glücksrad (Wh.)")).toBe("glücksrad");
    expect(normalizeTitle("Die Schwarzwaldklinik (Fortsetzung)")).toBe("die schwarzwaldklinik");
  });
  it("drops quotes and punctuation, keeps umlauts", () => {
    expect(normalizeTitle("Ruck Zuck '88")).toBe("ruck zuck 88");
    expect(normalizeTitle("Detektiv Rockford: Anruf genügt")).toBe("detektiv rockford anruf genügt");
    expect(normalizeTitle("Stadt, Land, Fluß")).toBe("stadt land fluß");
    expect(normalizeTitle("Willy Bogner – Feuer und Eis")).toBe("willy bogner feuer und eis");
  });
});

describe("broadcastFlags", () => {
  it("detects repeats, black-and-white and live", () => {
    expect(broadcastFlags("Showladen (Wh.)", null)).toEqual({ repeat: true });
    expect(broadcastFlags("Hart auf Hart", "„Der Ozelot“ · Comedyserie (Wh. von 1989)")).toEqual({ repeat: true });
    expect(broadcastFlags("Schachnovelle", "Spielfilm, BRD 1960 · s/w")).toEqual({ blackAndWhite: true });
    expect(broadcastFlags("Eiskunstlauf-WM live", null)).toEqual({ live: true });
    expect(broadcastFlags("Gottschalk", "Personality-Show, live, mit Thomas Gottschalk")).toEqual({ live: true });
    expect(broadcastFlags("Lotto am Mittwoch", null)).toEqual({});
  });
  it("does not match words containing live", () => {
    expect(broadcastFlags("Olivers Show", "Liveshow-Rückblick")).toEqual({});
  });
});
