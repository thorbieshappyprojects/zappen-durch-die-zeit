"use server";

import { approveVideoContribution, deleteContribution, setContributionStatus } from "@zdz/db";
import { revalidatePath } from "next/cache";
import { guarded, type ActionState } from "@/lib/admin-action";
import { db, invalidateCoverage } from "@/lib/db";

const LEVELS = ["exact", "same_show_period", "same_show"] as const;

export async function approveVideo(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const id = Number(form.get("id"));
    const level = String(form.get("level"));
    if (!Number.isInteger(id) || !LEVELS.includes(level as (typeof LEVELS)[number])) throw new Error("Ungültige Eingabe.");
    const text = (k: string) => String(form.get(k) ?? "").trim() || undefined;
    const overrides = { url: text("url"), tvDate: text("tvDate"), channel: text("channel"), start: text("start") };
    if (overrides.start && !/^\d{1,2}:\d{2}$/.test(overrides.start)) throw new Error("Ungültige Anfangszeit.");
    if (overrides.tvDate && !/^\d{4}-\d{2}-\d{2}$/.test(overrides.tvDate)) throw new Error("Ungültiges Datum.");
    if (overrides.url && !/^https?:\/\//.test(overrides.url)) throw new Error("Ungültiger Link.");
    const result = await approveVideoContribution((await db()).db, id, level as (typeof LEVELS)[number], overrides);
    if (!result.ok) {
      await setContributionStatus((await db()).db, id, "pending", result.error);
      revalidatePath("/admin/beitraege");
      throw new Error(result.error);
    }
    invalidateCoverage();
    revalidatePath("/admin/beitraege");
  });
}

const STATUSES = ["pending", "approved", "rejected", "spam"] as const;

export async function setStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const id = Number(form.get("id"));
    const status = String(form.get("status"));
    if (!Number.isInteger(id) || !STATUSES.includes(status as (typeof STATUSES)[number])) throw new Error("Ungültige Eingabe.");
    const note = String(form.get("note") ?? "").slice(0, 500) || undefined;
    await setContributionStatus((await db()).db, id, status as (typeof STATUSES)[number], note);
    revalidatePath("/admin/beitraege");
  });
}

/** „Endgültig löschen": the contribution with its files (no undo). */
export async function removeContribution(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const id = Number(form.get("id"));
    if (!Number.isInteger(id)) throw new Error("Ungültige Eingabe.");
    await deleteContribution((await db()).db, id);
    revalidatePath("/admin/beitraege");
  });
}
