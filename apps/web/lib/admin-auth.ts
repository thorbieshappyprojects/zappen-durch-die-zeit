import { createHash } from "node:crypto";
import { checkProductionConfig, loginBlocked } from "@zdz/core";
import { issueSession, verifySession, verifyTotp } from "@zdz/core/totp";
import { claimTotpStep, clearLoginFailures, listRecentLoginFailures, recordLoginFailure } from "@zdz/db";
import { cookies, headers } from "next/headers";
import { clientIp, hashIp, isAdminToken } from "./contribution-security";
import { db } from "./db";

/**
 * Admin access: password (ADMIN_TOKEN) plus a 6-digit code from an authenticator app when
 * ADMIN_TOTP_SECRET is set (set it up with `pnpm ingest admin-totp`). The cookie holds a signed,
 * expiring session – never the password. Changing the password or the secret ends all sessions.
 */
export const ADMIN_COOKIE = "zdz_admin";
const SESSION_MS = 8 * 3600_000;

/** In production a short password or a missing second factor keeps the admin off (instrumentation.ts logs why). */
const PRODUCTION_ADMIN_DISABLED = process.env.NODE_ENV === "production" ? checkProductionConfig(process.env).adminDisabled : null;
export const adminConfigured = () => Boolean(process.env.ADMIN_TOKEN) && !PRODUCTION_ADMIN_DISABLED;
export const twoFactorEnabled = () => Boolean(process.env.ADMIN_TOTP_SECRET);

function sessionKey(): string {
  return createHash("sha256").update(`${process.env.ADMIN_TOKEN ?? ""}|${process.env.ADMIN_TOTP_SECRET ?? ""}|admin-session`).digest("hex");
}

export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  return verifySession(sessionKey(), (await cookies()).get(ADMIN_COOKIE)?.value);
}

/** Server actions and routes are reachable directly: call this first in every one of them. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Nicht angemeldet.");
}

// Failed logins and used TOTP steps live in the database (packages/db admin-login.ts): they
// survive restarts and are shared by several instances.
export async function adminLogin(password: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = hashIp(clientIp(await headers()));
  const now = Date.now();
  const { db: handle } = await db();
  const blocked = loginBlocked(await listRecentLoginFailures(handle, new Date(now)), ip, new Date(now));
  if (blocked) {
    if (blocked === "global") console.warn("admin login: global throttle active (too many failed logins from several addresses)");
    return { ok: false, error: "Zu viele Fehlversuche – bitte in 15 Minuten erneut versuchen." };
  }
  const fail = async (error: string) => {
    await recordLoginFailure(handle, ip, new Date(now));
    return { ok: false as const, error };
  };
  if (!adminConfigured()) return { ok: false, error: "Die Moderation ist nicht eingerichtet (ADMIN_TOKEN fehlt)." };
  if (!isAdminToken(password)) return fail("Passwort oder Code falsch.");
  if (twoFactorEnabled()) {
    const step = verifyTotp(process.env.ADMIN_TOTP_SECRET!, code.replace(/\s/g, ""), now);
    // A code works once (and an older one never again).
    if (step === null || !(await claimTotpStep(handle, step))) return fail("Passwort oder Code falsch.");
  }
  await clearLoginFailures(handle, ip);
  (await cookies()).set(ADMIN_COOKIE, issueSession(sessionKey(), SESSION_MS, now), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: SESSION_MS / 1000,
  });
  return { ok: true };
}

export async function adminLogout(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
}
