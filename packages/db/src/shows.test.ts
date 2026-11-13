import { readFileSync } from "node:fs";
import type { SeedFile } from "@zdz/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./client";
import { importDay, importedDayFromSeed } from "./import";
import { loadShow, searchShows } from "./shows";

const seed = JSON.parse(readFileSync(new URL("../../../seed/1991-03-13.json", import.meta.url), "utf8")) as SeedFile;
let h: DbHandle;
beforeAll(async () => {
  h = await createDb({ dataDir: "memory://" });
  await h.migrate();
  await importDay(h.db, importedDayFromSeed(seed), "local");
});
afterAll(() => h.close());

describe("shows", () => {
  it("finds a show by part of its title and names an airing to open", async () => {
    const hits = await searchShows(h.db, "tagessch");
    const tagesschau = hits.find((x) => x.key === "tagesschau")!;
    expect(tagesschau).toBeDefined();
    expect(tagesschau.airings).toBeGreaterThan(1);
    expect(tagesschau.open.date).toBe("1991-03-13");
    expect(tagesschau.channels).toContain("ard");
    const show = await loadShow(h.db, "tagesschau");
    expect(show.airings).toHaveLength(tagesschau.airings);
    expect(show.airings.some((a) => a.startMin === tagesschau.open.startMin && a.channelId === tagesschau.open.channelId)).toBe(true);
  });

  it("opens the airing with the best video", async () => {
    const withVideo = seed.broadcasts.find((b) => seed.media.some((m) => m.matchTitle === b.title));
    if (!withVideo) return;
    const [hit] = await searchShows(h.db, withVideo.title);
    const show = await loadShow(h.db, hit!.key);
    const opened = show.airings.find((a) => a.channelId === hit!.open.channelId && a.startMin === hit!.open.startMin)!;
    expect(opened.matchLevel).not.toBe("none");
    expect(hit!.withVideo).toBeGreaterThan(0);
  });

  it("ignores too short queries", async () => {
    expect(await searchShows(h.db, "a")).toEqual([]);
    expect(await searchShows(h.db, "%%")).toEqual([]);
  });
});
