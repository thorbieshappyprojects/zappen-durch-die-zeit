import { describe, expect, it } from "vitest";
import { checkProductionConfig } from "./config-check";

const good = {
  CONTRIBUTION_SECRET: "x".repeat(64),
  SITE_URL: "https://example.org",
  ADMIN_TOKEN: "y".repeat(32),
  ADMIN_TOTP_SECRET: "JBSWY3DPEHPK3PXP",
  OWNER_NAME: "A",
  OWNER_ADDRESS: "B",
  OWNER_EMAIL: "c@example.org",
  DATABASE_URL: "postgres://app@db/app",
};

describe("checkProductionConfig", () => {
  it("accepts a complete configuration", () => {
    expect(checkProductionConfig(good)).toEqual({ fatal: [], warnings: [], adminDisabled: null });
  });
  it("refuses to start without a strong contribution secret or a site URL", () => {
    expect(checkProductionConfig({ ...good, CONTRIBUTION_SECRET: "short" }).fatal).toHaveLength(1);
    expect(checkProductionConfig({ ...good, SITE_URL: undefined }).fatal[0]).toContain("SITE_URL");
    expect(checkProductionConfig({ ...good, SITE_URL: "example.org" }).fatal[0]).toContain("keine gültige");
  });
  it("refuses to start without a Postgres database (no silent PGlite)", () => {
    expect(checkProductionConfig({ ...good, DATABASE_URL: undefined }).fatal[0]).toContain("DATABASE_URL");
    expect(checkProductionConfig({ ...good, DATABASE_URL: undefined, ZDZ_PGLITE_DIR: "/tmp/pg" }).fatal).toEqual([]);
  });
  it("turns the admin login off for a weak token or a missing second factor", () => {
    expect(checkProductionConfig({ ...good, ADMIN_TOKEN: "short" }).adminDisabled).toContain("kürzer");
    expect(checkProductionConfig({ ...good, ADMIN_TOTP_SECRET: undefined }).adminDisabled).toContain("ADMIN_TOTP_SECRET");
    // No admin configured at all: nothing to disable.
    expect(checkProductionConfig({ ...good, ADMIN_TOKEN: undefined, ADMIN_TOTP_SECRET: undefined }).adminDisabled).toBeNull();
  });
  it("warns while the owner details for Impressum/Datenschutz are missing", () => {
    expect(checkProductionConfig({ ...good, OWNER_EMAIL: undefined }).warnings[0]).toContain("OWNER_EMAIL");
  });
});
