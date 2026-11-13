import { isCalendarDate, normalizeTitle, SHOW_SEARCH_MIN_CHARS } from "@zdz/core";
import { NextResponse, type NextRequest } from "next/server";
import { findShows } from "@/lib/db";

/** Longest query we look at (titles are short; this keeps the LIKE pattern small). */
const MAX_QUERY = 60;

/**
 * Show search for the box above the guide: GET /suche?q=<text>[&tag=<date>] → { hits: ShowHit[] }.
 * `tag` is the day the viewer is on: among equally good airings the nearest one opens.
 */
export async function GET(request: NextRequest) {
  const q = normalizeTitle((request.nextUrl.searchParams.get("q") ?? "").slice(0, MAX_QUERY));
  const tag = request.nextUrl.searchParams.get("tag") ?? "";
  if (q.length < SHOW_SEARCH_MIN_CHARS) return NextResponse.json({ hits: [] });
  const hits = await findShows(q, isCalendarDate(tag) ? tag : undefined);
  return NextResponse.json({ hits }, { headers: { "Cache-Control": "public, max-age=300" } });
}
