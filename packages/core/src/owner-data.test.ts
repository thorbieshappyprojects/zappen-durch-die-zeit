import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

/** OWNER_ADDRESS from the environment or the git-ignored apps/web/.env.local (absent in CI: nothing to compare). */
function ownerAddress(): string | undefined {
  if (process.env.OWNER_ADDRESS?.trim()) return process.env.OWNER_ADDRESS.trim();
  const file = join(ROOT, "apps/web/.env.local");
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8").split("\n").find((l) => l.startsWith("OWNER_ADDRESS="));
  return line?.slice("OWNER_ADDRESS=".length).trim().replace(/^["']|["']$/g, "") || undefined;
}

describe("owner's postal address", () => {
  it("is in no tracked file (only in the environment)", () => {
    const address = ownerAddress();
    if (!address) return;
    // Each line of the address (street, postcode and town) on its own; short fragments would match by chance.
    const parts = address.split(/\s*[,\n]\s*/).filter((p) => p.length >= 6);
    const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    const hits: string[] = [];
    for (const f of files) {
      if (/\.(png|jpe?g|gif|ico|webp|woff2?)$/i.test(f)) continue;
      const text = readFileSync(join(ROOT, f), "utf8");
      if (parts.some((p) => text.includes(p))) hits.push(f); // file names only: the address itself is never printed
    }
    expect(hits).toEqual([]);
  });
});
