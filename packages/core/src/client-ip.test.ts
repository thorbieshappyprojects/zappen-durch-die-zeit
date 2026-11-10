import { describe, expect, it } from "vitest";
import { clientIpConfigFrom, clientIpFrom } from "./client-ip";
import { LOGIN_MAX_FAILURES_GLOBAL, loginBlocked } from "./login-throttle";

const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;

describe("clientIpFrom", () => {
  it("ignores a spoofed leftmost X-Forwarded-For value", () => {
    // The caller sent "1.1.1.1"; the one proxy in front appended the address it saw.
    expect(clientIpFrom(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }), { hops: 1 })).toBe("203.0.113.7");
    expect(clientIpFrom(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7, 10.0.0.2" }), { hops: 2 })).toBe("203.0.113.7");
    // Fewer entries than trusted proxies: nothing trustworthy.
    expect(clientIpFrom(headers({ "x-forwarded-for": "1.1.1.1" }), { hops: 2 })).toBe("unknown");
    expect(clientIpFrom(headers({ "x-forwarded-for": "1.1.1.1" }), { hops: 0 })).toBe("unknown");
  });
  it("uses only the platform header when one is configured", () => {
    const get = headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2", "cf-connecting-ip": "198.51.100.4" });
    expect(clientIpFrom(get, clientIpConfigFrom({ CLIENT_IP_HEADER: "CF-Connecting-IP" }))).toBe("198.51.100.4");
    expect(clientIpFrom(headers({}), clientIpConfigFrom({ CLIENT_IP_HEADER: "cf-connecting-ip" }))).toBe("unknown");
  });
  it("defaults to one trusted proxy", () => {
    expect(clientIpConfigFrom({})).toEqual({ header: undefined, hops: 1 });
    expect(clientIpConfigFrom({ TRUSTED_PROXY_HOPS: "x" }).hops).toBe(1);
  });
});

describe("loginBlocked", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  it("locks one address after 5 failures in 15 minutes", () => {
    const f = Array.from({ length: 5 }, (_, i) => ({ ipHash: "a", at: ago(i) }));
    expect(loginBlocked(f, "a", now)).toBe("ip");
    expect(loginBlocked(f, "b", now)).toBeNull();
    expect(loginBlocked(f.map((x) => ({ ...x, at: ago(16) })), "a", now)).toBeNull();
  });
  it("locks everyone after 20 failures from rotating addresses", () => {
    const f = Array.from({ length: LOGIN_MAX_FAILURES_GLOBAL }, (_, i) => ({ ipHash: `ip${i}`, at: ago(1) }));
    expect(loginBlocked(f, "fresh", now)).toBe("global");
    expect(loginBlocked(f.slice(1), "fresh", now)).toBeNull();
  });
});
