/**
 * The client address for rate limits and the admin lockout. Only values the hosting platform
 * writes itself can be trusted: never the leftmost `X-Forwarded-For` entry, which the caller sets.
 * `next start` without a proxy in front keeps a client-sent X-Forwarded-For as it is, so run it
 * behind a proxy that appends the address it sees (README "Hosting").
 */
export interface ClientIpConfig {
  /** A header the platform sets itself (e.g. `cf-connecting-ip`, `fly-client-ip`): used alone. */
  header?: string;
  /** Proxies in front that append to X-Forwarded-For: the client is that many entries from the right. */
  hops: number;
}

export function clientIpConfigFrom(env: Record<string, string | undefined>): ClientIpConfig {
  const hops = Number(env.TRUSTED_PROXY_HOPS ?? "1");
  return { header: env.CLIENT_IP_HEADER?.trim().toLowerCase() || undefined, hops: Number.isInteger(hops) && hops >= 0 ? hops : 1 };
}

export function clientIpFrom(get: (name: string) => string | null, config: ClientIpConfig): string {
  if (config.header) return get(config.header)?.split(",")[0]?.trim() || "unknown";
  if (config.hops === 0) return "unknown";
  const chain = (get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Fewer entries than proxies: nothing was appended by a trusted hop.
  return chain.length >= config.hops ? chain[chain.length - config.hops]! : "unknown";
}
