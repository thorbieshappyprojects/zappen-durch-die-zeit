import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { clientIpConfigFrom, clientIpFrom } from "@zdz/core";

/**
 * Secret for form tokens and IP hashing. Set CONTRIBUTION_SECRET in production; without it a
 * random per-process secret is used (tokens then expire on restart, which is fine for dev).
 */
const SECRET = process.env.CONTRIBUTION_SECRET ?? randomBytes(32).toString("hex");

/** Signed "issued at" timestamp embedded in the form: lets the server measure fill time. */
export function issueFormToken(now = Date.now()): string {
  const sig = createHmac("sha256", SECRET).update(String(now)).digest("hex").slice(0, 32);
  return `${now}.${sig}`;
}

/** Seconds since the token was issued, or undefined if it is missing or forged. */
export function formTokenAgeSeconds(token: string | null, now = Date.now()): number | undefined {
  const [ts, sig] = (token ?? "").split(".");
  if (!ts || !sig || !/^\d+$/.test(ts)) return undefined;
  const expected = createHmac("sha256", SECRET).update(ts).digest("hex").slice(0, 32);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return undefined;
  return (now - Number(ts)) / 1000;
}

/** sha256(secret + day + ip): rotates daily, so stored hashes cannot be linked across days. */
export function hashIp(ip: string, now = new Date()): string {
  return createHash("sha256").update(`${SECRET}|${now.toISOString().slice(0, 10)}|${ip}`).digest("hex");
}

const IP_CONFIG = clientIpConfigFrom(process.env);

/** The caller's address as far as the hosting can vouch for it (CLIENT_IP_HEADER / TRUSTED_PROXY_HOPS, see core). */
export function clientIp(headers: Headers): string {
  return clientIpFrom((name) => headers.get(name), IP_CONFIG);
}

/** Constant-time check of a password against ADMIN_TOKEN (admin is off when unset); digests hide the length. */
export function isAdminToken(value: string | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !value) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(value), digest(expected));
}
