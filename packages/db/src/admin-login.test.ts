import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loginBlocked } from "@zdz/core";
import { afterAll, describe, expect, it } from "vitest";
import { claimTotpStep, clearLoginFailures, listRecentLoginFailures, recordLoginFailure } from "./admin-login";
import { createDb } from "./client";

const dirs: string[] = [];
afterAll(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

describe("admin login state", () => {
  it("keeps a used TOTP step rejected after a restart", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "zdz-login-"));
    dirs.push(dir);
    let h = await createDb({ dataDir: dir });
    await h.migrate();
    expect(await claimTotpStep(h.db, 1000)).toBe(true);
    expect(await claimTotpStep(h.db, 1000)).toBe(false); // the same code again
    await h.close();
    // "Restart": a fresh connection to the same database.
    h = await createDb({ dataDir: dir });
    expect(await claimTotpStep(h.db, 1000)).toBe(false);
    expect(await claimTotpStep(h.db, 999)).toBe(false); // an older code
    expect(await claimTotpStep(h.db, 1001)).toBe(true);
    await h.close();
  }, 20_000); // two databases on disk with migrations: slower than the default 5 s on a busy machine

  it("stores failures for the throttle and forgives an address on success", async () => {
    const h = await createDb({ dataDir: "memory://" });
    await h.migrate();
    const now = new Date();
    for (let i = 0; i < 5; i++) await recordLoginFailure(h.db, "a", now);
    await recordLoginFailure(h.db, "b", now);
    await recordLoginFailure(h.db, "old", new Date(now.getTime() - 20 * 60_000));
    const recent = await listRecentLoginFailures(h.db, now);
    expect(recent).toHaveLength(6);
    expect(loginBlocked(recent, "a", now)).toBe("ip");
    await clearLoginFailures(h.db, "a");
    expect(loginBlocked(await listRecentLoginFailures(h.db, now), "a", now)).toBeNull();
    await h.close();
  });
});
