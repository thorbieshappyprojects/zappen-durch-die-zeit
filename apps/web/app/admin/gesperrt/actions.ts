"use server";

import { unblockVideo } from "@zdz/db";
import { revalidatePath } from "next/cache";
import { guarded, type ActionState } from "@/lib/admin-action";
import { db, invalidateCoverage } from "@/lib/db";

/** „Entsperren": the video shows again everywhere it was linked. */
export async function unblock(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const url = String(form.get("url") ?? "");
    if (!/^https?:\/\//.test(url)) throw new Error("Ungültige Eingabe.");
    await unblockVideo((await db()).db, url);
    invalidateCoverage();
    revalidatePath("/admin/gesperrt");
  });
}
