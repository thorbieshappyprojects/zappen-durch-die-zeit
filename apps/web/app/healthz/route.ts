import { constants } from "node:fs";
import { access, mkdir, statfs } from "node:fs/promises";
import { pingDb, uploadDir } from "@zdz/db";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Below this share of free space on the uploads disk the check fails (backups and logs need room too). */
const MIN_FREE_SHARE = 0.1;

async function healthy(): Promise<boolean> {
  try {
    await pingDb((await db()).db);
    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    const fs = await statfs(dir);
    return fs.bavail / fs.blocks >= MIN_FREE_SHARE;
  } catch {
    return false;
  }
}

/**
 * Health check for the container and the uptime monitor: database answers, uploads folder writable,
 * enough free disk. Says nothing else (no versions, no reasons) – the logs have the details.
 */
export async function GET() {
  const ok = await healthy();
  return Response.json(ok ? { ok: true } : { ok: false }, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
