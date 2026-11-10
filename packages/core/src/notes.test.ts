import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_ADDRESS, withoutEmailAddresses } from "./notes";

const SEED_DIR = join(__dirname, "../../../seed");

describe("withoutEmailAddresses", () => {
  it("drops an uploader address but keeps channel names", () => {
    expect(withoutEmailAddresses("Folge 12, meist 23:15 · Upload: someone@example.org")).toBe("Folge 12, meist 23:15");
    expect(withoutEmailAddresses("Ausschnitt · Upload: a@example.org, b@example.net")).toBe("Ausschnitt");
    expect(withoutEmailAddresses("Ausschnitt · Upload: TV Classic Reboot")).toBe("Ausschnitt · Upload: TV Classic Reboot");
    expect(withoutEmailAddresses(null)).toBeNull();
  });
});

describe("seed files", () => {
  it("contain no e-mail addresses", () => {
    for (const file of readdirSync(SEED_DIR).filter((f) => f.endsWith(".json"))) {
      const text = readFileSync(join(SEED_DIR, file), "utf8");
      expect(text.match(EMAIL_ADDRESS) ?? [], file).toEqual([]);
      expect(text.includes("%40"), `${file}: URL-encoded address`).toBe(false);
    }
  });
});
