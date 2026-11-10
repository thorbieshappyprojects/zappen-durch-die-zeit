import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { describe, expect, it } from "vitest";

const dir = new URL("../drizzle/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

describe("migration 0007: ad_break → interstitial", () => {
  it("keeps every ad break as an approved interstitial of kind ad_break", async () => {
    const pg = await PGlite.create("memory://", { extensions: { pg_trgm } });
    for (const f of files.filter((f) => f < "0007")) await pg.exec(readFileSync(new URL(f, dir), "utf8"));
    await pg.exec(`
      insert into channel (slug, name, display_number, is_private) values ('rtl-plus', 'RTL', 4, true), ('sat-1', 'SAT.1', 3, true);
      insert into ad_break (channel_id, aired_period, url, provider_video_id, rank, notes) values
        (1, '1991', 'https://www.youtube.com/watch?v=AAAAAAAAAAA', 'AAAAAAAAAAA', 0, 'RTL 1991'),
        (1, '1991', 'https://www.youtube.com/watch?v=BBBBBBBBBBB', 'BBBBBBBBBBB', 1, null),
        (2, '1997', 'https://www.youtube.com/watch?v=CCCCCCCCCCC', 'CCCCCCCCCCC', 0, 'SAT.1 1997');
    `);
    await pg.exec(readFileSync(new URL(files.find((f) => f.startsWith("0007"))!, dir), "utf8"));
    const rows = await pg.query<{ channel_id: number; kind: string; status: string; url: string; rank: number; notes: string | null }>(
      "select channel_id, kind, status, url, rank, notes from interstitial order by id",
    );
    expect(rows.rows).toEqual([
      { channel_id: 1, kind: "ad_break", status: "approved", url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", rank: 0, notes: "RTL 1991" },
      { channel_id: 1, kind: "ad_break", status: "approved", url: "https://www.youtube.com/watch?v=BBBBBBBBBBB", rank: 1, notes: null },
      { channel_id: 2, kind: "ad_break", status: "approved", url: "https://www.youtube.com/watch?v=CCCCCCCCCCC", rank: 0, notes: "SAT.1 1997" },
    ]);
    const tables = await pg.query<{ t: string }>("select table_name as t from information_schema.tables where table_name in ('ad_break', 'ad_spot')");
    expect(tables.rows.map((r) => r.t)).toEqual(["ad_spot"]);
    await pg.close();
  });
});
