import { THEMES, type ThemeId } from "@zdz/core";
import { getSeamlessDay, getThemeDay } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * A built programme of a day as JSON (channels, broadcasts, media): "Lückenlos", or with
 * `?thema=kinder|talk` a theme channel programme. The TV loads it when the mode is switched on.
 */
export async function GET(req: Request, { params }: { params: Promise<{ date: string }> }) {
  const date = (await params).date;
  const theme = new URL(req.url).searchParams.get("thema");
  if (theme && !(theme in THEMES)) return Response.json({ error: "unknown theme" }, { status: 400 });
  const day = theme ? await getThemeDay(date, theme as ThemeId) : await getSeamlessDay(date);
  if (!day) return Response.json({ error: "not found" }, { status: 404 });
  // Only what differs from the day the TV already has.
  // The same for every viewer (built per date, cached in lib/db): browsers and CDNs may keep it.
  return Response.json({ channels: day.channels, broadcasts: day.broadcasts, media: day.media }, { headers: { "Cache-Control": "public, max-age=600" } });
}
