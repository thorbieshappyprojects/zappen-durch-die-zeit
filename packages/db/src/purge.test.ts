import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./client";
import { addContributionFile, createContribution, deleteContribution, purgeContributions } from "./contributions";
import { contribution, mediaReport } from "./schema";

let h: DbHandle;
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "zdz-uploads-"));
  process.env.UPLOAD_DIR = dir;
  h = await createDb({ dataDir: "memory://" });
  await h.migrate();
});
afterAll(async () => {
  await h.close();
  await rm(dir, { recursive: true, force: true });
  delete process.env.UPLOAD_DIR;
});

const now = new Date("2026-11-10T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

/** A contribution with a status, dates and optionally a stored file. */
async function make(status: "pending" | "approved" | "rejected" | "spam", created: Date, opts: { reviewed?: Date; email?: string; file?: boolean } = {}) {
  const row = await createContribution(h.db, { kind: "note", body: `Testbeitrag ${status}`, contributorEmail: opts.email }, { ipHash: "x", spamReasons: status === "spam" ? ["test"] : [] });
  await h.db.update(contribution).set({ status, createdAt: created, reviewedAt: opts.reviewed ?? null }).where(eq(contribution.id, row.id));
  let file: string | null = null;
  if (opts.file) {
    const key = `${row.id}/${"0".repeat(8)}-0000-0000-0000-${String(row.id).padStart(12, "0")}.jpg`;
    await mkdir(path.join(dir, String(row.id)), { recursive: true });
    await writeFile(path.join(dir, key), "jpg");
    await addContributionFile(h.db, { contributionId: row.id, originalName: "a.jpg", mime: "image/jpeg", sizeBytes: 3, sha256: "0".repeat(64), storageKey: key });
    file = path.join(dir, key);
  }
  return { id: row.id, file };
}
const exists = async (id: number) => (await h.db.select().from(contribution).where(eq(contribution.id, id))).length > 0;

describe("purgeContributions", () => {
  it("applies the retention rules", async () => {
    const oldSpam = await make("spam", daysAgo(31), { file: true });
    const newSpam = await make("spam", daysAgo(29));
    const oldRejected = await make("rejected", daysAgo(120), { reviewed: daysAgo(91), file: true });
    const newRejected = await make("rejected", daysAgo(120), { reviewed: daysAgo(10) });
    const approvedOld = await make("approved", daysAgo(200), { reviewed: daysAgo(91), email: "a@example.org" });
    const approvedNew = await make("approved", daysAgo(200), { reviewed: daysAgo(5), email: "b@example.org" });
    const pending = await make("pending", daysAgo(400), { email: "c@example.org" });
    await h.db.insert(mediaReport).values([
      { url: "https://x/old", reason: "other", ipHash: "x", handledAt: daysAgo(181), createdAt: daysAgo(200) },
      { url: "https://x/new", reason: "other", ipHash: "x", handledAt: daysAgo(10), createdAt: daysAgo(20) },
      { url: "https://x/open", reason: "other", ipHash: "x", createdAt: daysAgo(400) },
    ]);

    expect(await purgeContributions(h.db, now)).toEqual({ spam: 1, rejected: 1, emails: 1, reports: 1 });
    expect(await exists(oldSpam.id)).toBe(false);
    expect(existsSync(oldSpam.file!)).toBe(false);
    expect(await exists(oldRejected.id)).toBe(false);
    expect(existsSync(oldRejected.file!)).toBe(false);
    for (const kept of [newSpam, newRejected, approvedOld, approvedNew, pending]) expect(await exists(kept.id)).toBe(true);
    const email = async (id: number) => (await h.db.select({ e: contribution.contributorEmail }).from(contribution).where(eq(contribution.id, id)))[0]?.e;
    expect(await email(approvedOld.id)).toBeNull();
    expect(await email(approvedNew.id)).toBe("b@example.org");
    expect(await email(pending.id)).toBe("c@example.org"); // not reviewed yet
    expect((await h.db.select().from(mediaReport)).map((r) => r.url).sort()).toEqual(["https://x/new", "https://x/open"]);
  });

  it("deletes a single contribution with its files", async () => {
    const c = await make("pending", daysAgo(1), { file: true });
    expect(await deleteContribution(h.db, c.id)).toBe(true);
    expect(existsSync(c.file!)).toBe(false);
    expect(existsSync(path.dirname(c.file!))).toBe(false);
    expect(await deleteContribution(h.db, c.id)).toBe(false);
  });
});
