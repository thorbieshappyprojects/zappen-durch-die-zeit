import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SeedFile } from "@zdz/core";
import { importedDayFromSeed, repoRoot } from "@zdz/db";
import type { ScheduleAdapter } from "./types";

/** Curated JSON days in seed/ (local files, no network). */
export function seedAdapter(dir = path.join(repoRoot(), "seed"), opts: { optional?: boolean } = {}): ScheduleAdapter {
  const read = async (date: string) =>
    JSON.parse(await readFile(path.join(dir, `${date}.json`), "utf8")) as SeedFile;
  return {
    name: "seed",
    // Each seed file names its own source; the CLI checks per file.
    sourceName: "(per file)",
    kind: "local",
    async listDays() {
      if (opts.optional && !existsSync(dir)) return [];
      return (await readdir(dir))
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map((f) => f.slice(0, 10))
        .sort();
    },
    async loadDay(date) {
      return importedDayFromSeed(await read(date));
    },
  };
}
