import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_ADDRESS } from "./notes";

const ROOT = join(__dirname, "../../..");
/** The one contact address of the project; test fixtures use example domains. */
const ALLOWED = /^dev@thorbieshappyprojects\.com$|@example\.(org|net|com)$/;

function trackedTextFiles(): string[] {
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  return files.filter((f) => !/\.(png|jpe?g|gif|ico|webp|woff2?)$/i.test(f) && f !== "pnpm-lock.yaml");
}

describe("tracked files", () => {
  it("contain no e-mail address except the project contact", () => {
    const found: string[] = [];
    for (const file of trackedTextFiles()) {
      for (const address of readFileSync(join(ROOT, file), "utf8").match(EMAIL_ADDRESS) ?? [])
        if (!ALLOWED.test(address)) found.push(`${file}: ${address}`);
    }
    expect(found).toEqual([]);
  });
});
