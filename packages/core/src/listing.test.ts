import { describe, expect, it } from "vitest";
import { listingIndexable } from "./listing";

describe("listingIndexable", () => {
  it("needs the publish switch, a permissive licence and a real day", () => {
    expect(listingIndexable({ licenseStatus: "not_required", completeness: "partial" }, true)).toBe(true);
    expect(listingIndexable({ licenseStatus: "granted", completeness: "full" }, true)).toBe(true);
    expect(listingIndexable({ licenseStatus: "not_required", completeness: "full" }, false)).toBe(false);
    expect(listingIndexable({ licenseStatus: "unknown", completeness: "full" }, true)).toBe(false);
    expect(listingIndexable({ licenseStatus: "not_required", completeness: "series_only" }, true)).toBe(false);
  });
});
