"use server";

import { STATIONS } from "@zdz/core";
import { setSiteSetting, setStationHidden } from "@zdz/db";
import { revalidatePath } from "next/cache";
import { guarded, type ActionState } from "@/lib/admin-action";
import { db } from "@/lib/db";

/** Take a station out of the channel list (or bring it back). */
export async function toggleStation(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const slug = String(form.get("slug"));
    if (!STATIONS.some((s) => s.slug === slug)) throw new Error("Unbekannter Sender.");
    await setStationHidden((await db()).db, slug, form.get("hidden") === "1");
    revalidatePath("/admin");
    revalidatePath("/tag/[date]", "page");
  });
}

const SWITCHES = ["crtFilter", "sounds"] as const;

/** TV-wide switches (CRT look, sounds): the TV itself has no buttons for them. */
export async function setSwitch(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guarded(async () => {
    const key = String(form.get("key"));
    if (!SWITCHES.includes(key as (typeof SWITCHES)[number])) throw new Error("Unbekannte Einstellung.");
    await setSiteSetting((await db()).db, key as (typeof SWITCHES)[number], form.get("on") === "1");
    revalidatePath("/admin");
    revalidatePath("/tag/[date]", "page");
  });
}
