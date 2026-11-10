import { describe, expect, it } from "vitest";
import { interstitialsFor, pickInterstitial, signOffFor, type Interstitial } from "./interstitials";
import type { Broadcast, Channel, TvDay } from "./types";

let nextId = 1;
const item = (p: Partial<Interstitial> & Pick<Interstitial, "kind">): Interstitial => ({
  id: nextId++,
  channelId: null,
  url: `https://www.youtube.com/watch?v=${String(nextId).padStart(11, "x")}`,
  provider: "youtube",
  providerVideoId: String(nextId).padStart(11, "x"),
  inS: null,
  outS: null,
  durationS: null,
  airedOn: null,
  airedPeriod: null,
  validFrom: null,
  validTo: null,
  rank: 0,
  note: "",
  ...p,
});

const ard: Channel = { id: "ard", name: "ARD", displayNumber: 1, isPrivate: false };
const rtl: Channel = { id: "rtl-plus", name: "RTL", displayNumber: 4, isPrivate: true };
const b = (channelId: string, startMin: number, endMin: number): Broadcast => ({ id: `${channelId}-${startMin}`, channelId, startMin, endMin, title: "x", description: null });

describe("pickInterstitial", () => {
  const opts = { kind: "ident" as const, channelId: "zdf", date: "1997-05-02", seed: "s" };
  it("prefers an item whose validity window covers the date", () => {
    const old = item({ kind: "ident", channelId: "zdf", validFrom: "1990-01-01", validTo: "1996-12-31" });
    const current = item({ kind: "ident", channelId: "zdf", validFrom: "1997-01-01" });
    const near = item({ kind: "ident", channelId: "zdf", airedPeriod: "1997" });
    expect(pickInterstitial([old, current, near], opts)?.id).toBe(current.id);
  });
  it("prefers a recording from that very day over a covering window", () => {
    const current = item({ kind: "ident", channelId: "zdf", validFrom: "1997-01-01" });
    const thatDay = item({ kind: "ident", channelId: "zdf", airedOn: "1997-05-02" });
    const poolThatDay = item({ kind: "ident", airedOn: "1997-05-02" });
    expect(pickInterstitial([current, poolThatDay, thatDay], { ...opts, pool: true })?.id).toBe(thatDay.id);
  });
  it("falls back to the nearest year, then rank", () => {
    const y91 = item({ kind: "ident", channelId: "zdf", airedOn: "1991-03-13" });
    const y96a = item({ kind: "ident", channelId: "zdf", airedPeriod: "1996", rank: 1 });
    const y96b = item({ kind: "ident", channelId: "zdf", airedPeriod: "1996-Q2", rank: 0 });
    expect(pickInterstitial([y91, y96a, y96b], opts)?.id).toBe(y96b.id);
  });
  it("uses pool items only within two years and only when asked", () => {
    const spot = item({ kind: "ad_break", airedOn: "1994-01-01" });
    const spotOld = item({ kind: "ad_break", airedOn: "1986-01-01" });
    expect(pickInterstitial([spot, spotOld], { ...opts, kind: "ad_break", pool: true, date: "1995-10-20" })?.id).toBe(spot.id);
    expect(pickInterstitial([spotOld], { ...opts, kind: "ad_break", pool: true, date: "1995-10-20" })).toBeNull();
    expect(pickInterstitial([spot], { ...opts, kind: "ad_break", date: "1995-10-20" })).toBeNull();
  });
});

describe("interstitialsFor", () => {
  const pool = [item({ kind: "ad_break", airedOn: "1991-05-01", note: "Punica" })];
  const ardIdent = item({ kind: "ident", channelId: "ard", airedPeriod: "1991" });
  const announcer = item({ kind: "announcer", channelId: "ard", airedPeriod: "1991" });
  const signOff = item({ kind: "sign_off", channelId: "ard", airedPeriod: "1991" });
  const day = (broadcasts: Broadcast[], channels: Channel[]): TvDay => ({
    date: "1991-03-13",
    completeness: "full",
    source: { name: "t", url: "", licenseStatus: "not_required" },
    channels,
    broadcasts,
    media: {},
    adBreaks: [],
    interstitials: [...pool, ardIdent, announcer, signOff],
  });

  it("private channel without own ad break: a pool spot in the ad window", () => {
    const show = b("rtl-plus", 1200, 1260);
    const d = day([show], [rtl]);
    expect(interstitialsFor(d, rtl, show, 1258).map((s) => s.note)).toEqual(["Punica"]);
    expect(interstitialsFor(d, rtl, show, 1230)).toEqual([]); // not in the ad window
  });
  it("ARD before 20:00: spot, ident and the announcer before the evening programme", () => {
    const vorabend = b("ard", 1170, 1198); // 19:30–19:58
    const prime = b("ard", 1215, 1305);
    const d = day([vorabend, b("ard", 1198, 1215), prime], [ard]);
    expect(interstitialsFor(d, ard, vorabend, 1197).map((s) => s.kind)).toEqual(["ad_break", "ident", "announcer"]);
  });
  it("ARD after 20:00: no ads, only the ident", () => {
    const late = b("ard", 1305, 1350);
    const d = day([late, b("ard", 1350, 1400)], [ard]);
    expect(interstitialsFor(d, ard, late, 1349).map((s) => s.kind)).toEqual(["ident"]);
  });
  it("sign-off right after the last broadcast, then nothing", () => {
    const last = b("ard", 1500, 1560);
    const d = day([last], [ard]);
    expect(signOffFor(d, ard, 1562)?.kind).toBe("sign_off");
    expect(signOffFor(d, ard, 1559)).toBeNull();
    expect(signOffFor(d, ard, 1575)).toBeNull();
  });
  it("no sign-off when a channel's list just stops early (incomplete data)", () => {
    const early = b("ard", 960, 1020); // ends 17:00
    expect(signOffFor(day([early], [ard]), ard, 1022)).toBeNull();
  });
});
