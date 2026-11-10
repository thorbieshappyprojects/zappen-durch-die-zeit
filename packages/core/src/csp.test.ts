import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./csp";

describe("content security policy", () => {
  const prod = contentSecurityPolicy("abc123");
  it("allows scripts only from us, with the nonce, and the YouTube API", () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc123' https://www.youtube.com;");
    expect(prod).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy("n", { dev: true })).toContain("'unsafe-eval'");
  });
  it("lets the four players in and nobody frame us", () => {
    expect(prod).toContain("frame-src https://www.youtube-nocookie.com https://geo.dailymotion.com https://player.vimeo.com");
    expect(prod).toContain("media-src 'self' https://archive.org https://*.archive.org");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
  });
  it("sends HSTS only in production", () => {
    expect(securityHeaders({ production: true }).map((h) => h.key)).toContain("Strict-Transport-Security");
    expect(securityHeaders({ production: false }).map((h) => h.key)).not.toContain("Strict-Transport-Security");
  });
});
