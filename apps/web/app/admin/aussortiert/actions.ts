"use server";

import { setUploadDecision } from "@zdz/db";
import { revalidatePath } from "next/cache";
import { guarded, type ActionState } from "@/lib/admin-action";
import { db } from "@/lib/db";
import { loadUploadReview } from "./review";

/** Include or exclude a group of left-out uploads ("reset" clears the decision). */
export async function decideUploadGroup(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const id = String(form.get("id"));
    const decision = String(form.get("decision"));
    const group = (await loadUploadReview()).groups.find((g) => g.id === id);
    if (!group || !["include", "exclude", "reset"].includes(decision)) throw new Error("Ungültige Eingabe.");
    if (decision === "include" && !group.canInclude) throw new Error("Diese Gruppe kann nicht aufgenommen werden.");
    const note = String(form.get("note") ?? "").trim().slice(0, 500) || undefined;
    await setUploadDecision((await db()).db, id, decision === "reset" ? null : (decision as "include" | "exclude"), note);
    revalidatePath("/admin/aussortiert");
  });
}
