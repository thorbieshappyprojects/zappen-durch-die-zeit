import { unstable_rethrow } from "next/navigation";
import { requireAdmin } from "./admin-auth";

/** What an admin action answers: the page shows `error` next to the form (components/AdminForm). */
export type ActionState = { error?: string; ok?: boolean };

/**
 * Runs an admin action: checks the session, and turns a thrown error ("Ungültige Eingabe." …)
 * into a German message on the page instead of an error page. Next's own control flow
 * (redirects, notFound) passes through.
 */
export async function guarded(run: () => Promise<void>): Promise<ActionState> {
  try {
    await requireAdmin();
    await run();
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof Error && e.message ? e.message : "Das hat nicht geklappt." };
  }
}
