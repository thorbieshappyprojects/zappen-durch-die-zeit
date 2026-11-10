/** Admin login throttle: per address, and for all addresses together (rotating addresses). */
export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_MAX_FAILURES_PER_IP = 5;
/** Accepted trade-off: an attacker can lock the single admin out for one window. */
export const LOGIN_MAX_FAILURES_GLOBAL = 20;

/** Why logins are refused right now, given the failed attempts of the last window; null = allowed. */
export function loginBlocked(failures: readonly { ipHash: string; at: Date }[], ipHash: string, now = new Date()): "ip" | "global" | null {
  const recent = failures.filter((f) => now.getTime() - f.at.getTime() < LOGIN_WINDOW_MS);
  if (recent.length >= LOGIN_MAX_FAILURES_GLOBAL) return "global";
  if (recent.filter((f) => f.ipHash === ipHash).length >= LOGIN_MAX_FAILURES_PER_IP) return "ip";
  return null;
}
