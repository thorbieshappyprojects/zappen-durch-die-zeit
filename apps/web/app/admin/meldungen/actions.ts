"use server";

import { eventById } from "@zdz/core";
import { excludeFromEvent, handleReports } from "@zdz/db";
import { revalidatePath } from "next/cache";
import { guarded, type ActionState } from "@/lib/admin-action";
import { db, invalidateCoverage } from "@/lib/db";

const ACTIONS = ["dead", "ignored", "review"] as const;

/** Server actions are reachable by direct POST: check the admin cookie every time. */
export async function decideReports(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const url = String(form.get("url") ?? "");
    const action = String(form.get("action"));
    if (!/^https?:\/\//.test(url) || !ACTIONS.includes(action as (typeof ACTIONS)[number])) throw new Error("Ungültige Eingabe.");
    await handleReports((await db()).db, url, action as (typeof ACTIONS)[number]);
    invalidateCoverage();
    revalidatePath("/admin/meldungen");
  });
}

/** Chronik: takes a reported video out of one event (it stays on the TV everywhere else). */
export async function excludeFromChronik(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const url = String(form.get("url") ?? "");
    const event = eventById(String(form.get("event") ?? ""));
    if (!/^https?:\/\//.test(url) || !event) throw new Error("Ungültige Eingabe.");
    await excludeFromEvent((await db()).db, event.id, url);
    invalidateCoverage();
    revalidatePath("/admin/meldungen");
  });
}
