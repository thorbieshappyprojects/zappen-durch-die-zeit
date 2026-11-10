import { LOGIN_WINDOW_MS } from "@zdz/core";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "./client";
import { adminLoginAttempt, siteSetting } from "./schema";

/**
 * Admin login state in the database, not in process memory: survives restarts and is shared by
 * several instances. Failed attempts feed core `loginBlocked`; TOTP steps can be used once.
 */
export async function listRecentLoginFailures(db: Db, now = new Date()): Promise<{ ipHash: string; at: Date }[]> {
  return db
    .select({ ipHash: adminLoginAttempt.ipHash, at: adminLoginAttempt.at })
    .from(adminLoginAttempt)
    .where(gte(adminLoginAttempt.at, new Date(now.getTime() - LOGIN_WINDOW_MS)));
}

export async function recordLoginFailure(db: Db, ipHash: string, now = new Date()): Promise<void> {
  await db.insert(adminLoginAttempt).values({ ipHash, at: now });
  // Older rows are no longer needed for the throttle.
  await db.delete(adminLoginAttempt).where(lt(adminLoginAttempt.at, new Date(now.getTime() - LOGIN_WINDOW_MS)));
}

/** A successful login forgives that address's failures (the global count keeps the others). */
export async function clearLoginFailures(db: Db, ipHash: string): Promise<void> {
  await db.delete(adminLoginAttempt).where(eq(adminLoginAttempt.ipHash, ipHash));
}

const TOTP_STEP_KEY = "adminTotpLastStep";

/**
 * Marks a TOTP time step as used. True only if it is newer than every step used before (a code
 * works once, and an older one never again); atomic, so two instances can't both accept a code.
 */
export async function claimTotpStep(db: Db, step: number): Promise<boolean> {
  const rows = await db
    .insert(siteSetting)
    .values({ key: TOTP_STEP_KEY, value: step })
    .onConflictDoUpdate({
      target: siteSetting.key,
      set: { value: step, updatedAt: new Date() },
      setWhere: and(eq(siteSetting.key, TOTP_STEP_KEY), sql`(${siteSetting.value})::bigint < ${step}`),
    })
    .returning({ key: siteSetting.key });
  return rows.length > 0;
}
