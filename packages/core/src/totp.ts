/**
 * Admin login, server side only (uses node:crypto; import as "@zdz/core/totp", never from the
 * client bundle): TOTP codes (RFC 6238, the authenticator-app standard) and signed sessions.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bit), base32 as authenticator apps expect it. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 6-digit code for a 30-second time step. */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  const n = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

/**
 * Checks a code against the current step ±1 (clock drift). Returns the matching step, or null.
 * The caller must reject a step that was already used (replay).
 */
export function verifyTotp(secret: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(nowMs / 30_000);
  for (const s of [step, step - 1, step + 1]) {
    if (timingSafeEqual(Buffer.from(totpCode(secret, s)), Buffer.from(code))) return s;
  }
  return null;
}

/** otpauth:// URI for adding the secret to an authenticator app. */
export function otpauthUri(secret: string, account = "admin", issuer = "Zappen durch die Zeit"): string {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Signed session token "<expiresMs>.<nonce>.<mac>" – no password in the cookie. */
export function issueSession(key: string, ttlMs: number, nowMs = Date.now()): string {
  const payload = `${nowMs + ttlMs}.${randomBytes(12).toString("hex")}`;
  return `${payload}.${createHmac("sha256", key).update(payload).digest("hex")}`;
}

export function verifySession(key: string, token: string | undefined, nowMs = Date.now()): boolean {
  const parts = (token ?? "").split(".");
  if (parts.length !== 3) return false;
  const [expires, nonce, mac] = parts as [string, string, string];
  const expected = createHmac("sha256", key).update(`${expires}.${nonce}`).digest("hex");
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  return Number(expires) > nowMs;
}
