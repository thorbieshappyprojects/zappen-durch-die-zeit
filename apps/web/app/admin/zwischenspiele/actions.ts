"use server";

import { importInterstitials, setInterstitialStatus, type InterstitialSeed } from "@zdz/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { guarded, type ActionState } from "@/lib/admin-action";
import { db } from "@/lib/db";

const KINDS = ["ad_break", "ident", "announcer", "trailer", "sign_off", "sign_on", "test_card"] as const;
const STATUSES = ["proposed", "approved", "rejected", "dead"] as const;

export async function setStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const id = Number(form.get("id"));
    const status = String(form.get("status"));
    if (!Number.isInteger(id) || !STATUSES.includes(status as (typeof STATUSES)[number])) throw new Error("Ungültige Eingabe.");
    await setInterstitialStatus((await db()).db, id, status as (typeof STATUSES)[number]);
    revalidatePath("/admin/zwischenspiele");
  });
}

export async function addInterstitial(_prev: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await requireAdmin();
  const get = (k: string) => String(form.get(k) ?? "").trim() || undefined;
  const num = (k: string) => (get(k) ? Number(get(k)) : undefined);
  const kind = get("kind") as (typeof KINDS)[number] | undefined;
  const url = get("url");
  const aired = get("aired");
  if (!url || !/^https?:\/\//.test(url)) return { error: "Bitte einen gültigen Link angeben." };
  if (!kind || !KINDS.includes(kind)) return { error: "Bitte die Art wählen." };
  if (aired && !/^\d{4}(-\d{2}-\d{2})?$/.test(aired)) return { error: "Zeitraum als JJJJ oder JJJJ-MM-TT angeben." };
  const entry: InterstitialSeed = {
    channel: get("channel") ?? null,
    kind,
    url,
    ...(aired?.length === 10 ? { airedOn: aired } : aired ? { airedPeriod: aired } : {}),
    inS: num("inS"),
    outS: num("outS"),
    note: get("note") ?? "",
  };
  const { imported, skipped } = await importInterstitials((await db()).db, [entry]);
  revalidatePath("/admin/zwischenspiele");
  return imported ? { ok: true } : { error: `Unbekannter Sender: ${skipped.join(", ")}` };
}
