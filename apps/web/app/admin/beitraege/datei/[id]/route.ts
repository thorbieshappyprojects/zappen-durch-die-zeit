import { getContributionFile } from "@zdz/db";
import { isAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { readUpload } from "@/lib/upload-store";

/** Serves a contribution attachment to the logged-in moderator only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Nicht angemeldet.", { status: 401 });
  const id = Number((await ctx.params).id);
  const file = Number.isInteger(id) ? await getContributionFile((await db()).db, id) : null;
  if (!file) return new Response("Nicht gefunden.", { status: 404 });
  const bytes = await readUpload(file.storageKey);
  const inline = file.mime.startsWith("image/") && file.mime !== "image/heic";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
