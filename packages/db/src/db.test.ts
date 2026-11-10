import { readFileSync } from "node:fs";
import { tvDayFromSeed, type SeedFile } from "@zdz/core";
import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./client";
import { assertImportAllowed, importDay, importedDayFromSeed, ImportNotPermittedError } from "./import";
import { listTvDays, loadTvDay } from "./queries";
import { broadcast, mediaCandidate, programme, scheduleSource } from "./schema";

const seed = JSON.parse(
  readFileSync(new URL("../../../seed/1991-03-13.json", import.meta.url), "utf8"),
) as SeedFile;

let h: DbHandle;

beforeAll(async () => {
  h = await createDb({ dataDir: "memory://" });
  await h.migrate();
  await importDay(h.db, importedDayFromSeed(seed), "local");
});
afterAll(() => h.close());

describe("seed import", () => {
  it("round-trips: the DB day equals the seed-derived day", async () => {
    expect(await loadTvDay(h.db, "1991-03-13")).toEqual(tvDayFromSeed(seed));
  });

  it("lists available days and returns null for missing ones", async () => {
    expect(await listTvDays(h.db)).toEqual(["1991-03-13"]);
    expect(await loadTvDay(h.db, "1991-03-14")).toBeNull();
  });

  it("stores real timestamps, including after midnight", async () => {
    const [row] = await h.db.select().from(broadcast).where(eq(broadcast.title, "Detektiv Rockford: Anruf genügt"));
    expect(row!.startMin).toBe(1470);
    expect(row!.startsAt.toISOString()).toBe("1991-03-13T23:30:00.000Z");
    expect(row!.endsAt.toISOString()).toBe("1991-03-14T00:15:00.000Z");
  });

  it("links repeated broadcasts to one programme", async () => {
    const [prog] = await h.db.select().from(programme).where(eq(programme.title, "Tagesschau"));
    const [linked] = await h.db.select({ n: count() }).from(broadcast).where(eq(broadcast.programmeId, prog!.id));
    expect(linked!.n).toBeGreaterThan(10);
  });

  it("derives flags and normalized titles", async () => {
    const [row] = await h.db.select().from(broadcast).where(eq(broadcast.title, "Glücksrad (Wh.)"));
    expect(row!.normalizedTitle).toBe("glücksrad");
    expect(row!.flags).toEqual({ repeat: true });
  });

  it("supports trigram similarity search", async () => {
    const rows = await h.db
      .select({ title: broadcast.title })
      .from(broadcast)
      .where(sql`${broadcast.normalizedTitle} % ${"schwarzwald klinik"}`);
    expect(rows.map((r) => r.title)).toContain("Die Schwarzwaldklinik");
  });

  it("is idempotent", async () => {
    const before = await counts();
    await importDay(h.db, importedDayFromSeed(seed), "local");
    expect(await counts()).toEqual(before);
    expect(await loadTvDay(h.db, "1991-03-13")).toEqual(tvDayFromSeed(seed));
  });
});

describe("licence guard", () => {
  it("records the seed source's license status from the seed (tvprogramme.net: not required)", async () => {
    const [src] = await h.db.select().from(scheduleSource);
    expect(src!.licenseStatus).toBe("not_required");
  });

  it("refuses remote imports without recorded permission", async () => {
    await h.db.update(scheduleSource).set({ licenseStatus: "pending" }).where(eq(scheduleSource.name, seed.source.name));
    await expect(assertImportAllowed(h.db, seed.source.name, "remote")).rejects.toBeInstanceOf(ImportNotPermittedError);
    await expect(assertImportAllowed(h.db, "Never heard of it", "remote")).rejects.toThrow(/unknown/);
    await expect(importDay(h.db, importedDayFromSeed(seed), "remote")).rejects.toBeInstanceOf(ImportNotPermittedError);
  });

  it("allows remote imports once granted, and re-imports never overwrite the recorded status", async () => {
    await h.db.update(scheduleSource).set({ licenseStatus: "granted" }).where(eq(scheduleSource.name, seed.source.name));
    await expect(assertImportAllowed(h.db, seed.source.name, "remote")).resolves.toBeUndefined();
    await importDay(h.db, importedDayFromSeed(seed), "local"); // the seed says "not required"; the recorded status wins
    const [src] = await h.db.select().from(scheduleSource);
    expect(src!.licenseStatus).toBe("granted");
  });
});

async function counts() {
  const [b] = await h.db.select({ n: count() }).from(broadcast);
  const [p] = await h.db.select({ n: count() }).from(programme);
  const [m] = await h.db.select({ n: count() }).from(mediaCandidate);
  return { broadcasts: b!.n, programmes: p!.n, media: m!.n };
}
