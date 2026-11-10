import { readFileSync } from "node:fs";
import type { SeedFile } from "@zdz/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./client";
import { excludeFromEvent, includeInEvent, listEventExclusions, listEventPool } from "./events";
import { importDay, importedDayFromSeed } from "./import";
import { blockVideo, createMediaReport, listOpenReportGroups } from "./reports";

const seed = JSON.parse(readFileSync(new URL("../../../seed/1991-03-13.json", import.meta.url), "utf8")) as SeedFile;
let h: DbHandle;
beforeAll(async () => {
  h = await createDb({ dataDir: "memory://" });
  await h.migrate();
  await importDay(h.db, importedDayFromSeed(seed), "local");
});
afterAll(() => h.close());

describe("Chronik in the database", () => {
  it("lists only exact recordings aired in the window, without blocked ones", async () => {
    const pool = await listEventPool(h.db, "1991-03-12", "1991-03-14");
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((v) => v.date === "1991-03-13" && v.media.matchLevel === "exact")).toBe(true);
    expect(await listEventPool(h.db, "1991-03-14", "1991-03-20")).toEqual([]);
    const url = pool[0]!.media.url;
    await blockVideo(h.db, url, "test");
    expect((await listEventPool(h.db, "1991-03-12", "1991-03-14")).map((v) => v.media.url)).not.toContain(url);
  });

  it("an 'off_topic' report is counted per event; excluding closes it, only for that event", async () => {
    const url = "https://www.youtube.com/watch?v=EEEEEEEEEEE";
    const base = { url, ipHash: "x", tvDate: "1991-03-13", channel: "ard", automatic: false } as const;
    await createMediaReport(h.db, { ...base, reason: "off_topic", eventId: "golfkrieg-1991" });
    await createMediaReport(h.db, { ...base, reason: "off_topic", eventId: "rohwedder-1991" });
    await createMediaReport(h.db, { ...base, reason: "unavailable" });
    const group = (await listOpenReportGroups(h.db)).find((g) => g.url === url)!;
    expect(group.events).toEqual({ "golfkrieg-1991": 1, "rohwedder-1991": 1 });

    await excludeFromEvent(h.db, "golfkrieg-1991", url);
    expect(await listEventExclusions(h.db, "golfkrieg-1991")).toEqual(new Set([url]));
    expect(await listEventExclusions(h.db, "rohwedder-1991")).toEqual(new Set());
    const after = (await listOpenReportGroups(h.db)).find((g) => g.url === url)!;
    expect(after.events).toEqual({ "rohwedder-1991": 1 });
    expect(after.reasons).toEqual({ off_topic: 1, unavailable: 1 });

    expect(await includeInEvent(h.db, "golfkrieg-1991", url)).toBe(true);
    expect(await listEventExclusions(h.db, "golfkrieg-1991")).toEqual(new Set());
  });
});
