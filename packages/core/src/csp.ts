/**
 * Content-Security-Policy of the pages (set per request with a fresh nonce in apps/web/proxy.ts).
 * Sources: the YouTube IFrame API script, the four players' frames and archive.org video files.
 */
export function contentSecurityPolicy(nonce: string, { dev = false }: { dev?: boolean } = {}): string {
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["object-src", "'none'"],
    ["frame-ancestors", "'none'"],
    // React needs eval only in development (debugging info), never in production.
    ["script-src", "'self'", `'nonce-${nonce}'`, "https://www.youtube.com", ...(dev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes are used widely (colours per coverage, CSS variables).
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:"],
    ["font-src", "'self'"],
    ["frame-src", "https://www.youtube-nocookie.com", "https://geo.dailymotion.com", "https://player.vimeo.com"],
    // archive.org download links redirect to its storage hosts (ia800….us.archive.org).
    ["media-src", "'self'", "https://archive.org", "https://*.archive.org"],
    // Development: hot reload over a WebSocket.
    ["connect-src", "'self'", ...(dev ? ["ws:"] : [])],
    ...(dev ? [] : [["upgrade-insecure-requests"] as [string]]),
  ];
  return directives.map((d) => d.join(" ")).join("; ");
}

/** Fixed headers for every response (next.config.ts); HSTS only in production. */
export function securityHeaders({ production }: { production: boolean }): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Not "no-referrer": YouTube embeds need a referrer.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
  ];
}
