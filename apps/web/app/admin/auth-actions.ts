"use server";

import { redirect } from "next/navigation";
import { adminLogin, adminLogout } from "@/lib/admin-auth";

export async function login(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const result = await adminLogin(String(form.get("password") ?? ""), String(form.get("code") ?? ""));
  if (!result.ok) return { error: result.error };
  const next = String(form.get("next") ?? "/admin");
  // Only admin pages ("/adminfoo" or "//evil" are not).
  redirect(next === "/admin" || next.startsWith("/admin/") ? next : "/admin");
}

export async function logout(): Promise<void> {
  await adminLogout();
  redirect("/admin");
}
