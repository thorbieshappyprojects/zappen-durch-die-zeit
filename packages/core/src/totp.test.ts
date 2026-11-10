import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, issueSession, newTotpSecret, totpCode, verifySession, verifyTotp } from "./totp";

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 test vector: secret "12345678901234567890" (ASCII), SHA-1, T = 59 s → 94287082 (8 digits).
  const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC 6238 test vectors (last 6 digits)", () => {
    expect(totpCode(rfcSecret, Math.floor(59 / 30))).toBe("287082");
    expect(totpCode(rfcSecret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpCode(rfcSecret, Math.floor(1234567890 / 30))).toBe("005924");
  });
  it("round-trips base32", () => {
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });
  it("accepts the current and neighbouring step only", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step), now)).toBe(step);
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(rfcSecret, totpCode(rfcSecret, step - 3), now)).toBeNull();
    expect(verifyTotp(rfcSecret, "12345", now)).toBeNull();
  });
});

describe("admin sessions", () => {
  it("are signed and expire", () => {
    const t = issueSession("key", 1000, 0);
    expect(verifySession("key", t, 500)).toBe(true);
    expect(verifySession("key", t, 1500)).toBe(false);
    expect(verifySession("other", t, 500)).toBe(false);
    expect(verifySession("key", t.replace(/^\d+/, "999999"), 500)).toBe(false);
    expect(verifySession("key", undefined)).toBe(false);
  });
});
