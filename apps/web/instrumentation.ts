/**
 * Runs once when a server instance starts: in production, refuse to start on a weak or missing
 * configuration (lib/startup-check.ts), then warm the coverage cache. Development and `next build` are not checked.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { checkConfigAtStartup } = await import("./lib/startup-check");
  checkConfigAtStartup();
  // Warm the coverage cache (seconds over all days) at start instead of on the first visitor's request.
  void import("./lib/db").then((m) => m.getTvDayCoverage()).catch((err) => console.warn("[startup] coverage not warmed:", err));
}
