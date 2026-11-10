import { broadcastsOf, findOnAir, formatClock, formatTvDayDate, parseShareParams, STATIONS } from "@zdz/core";
import { ImageResponse } from "next/og";
import { getTvDay } from "@/lib/db";

// PGlite needs Node.js.
export const runtime = "nodejs";

const BLUE = "#2b38ff";
const YELLOW = "#ffff3b";
const CYAN = "#3bffff";

/**
 * Link preview for shared days/broadcasts: a teletext-style card (date, channel, time, title).
 * No video thumbnails – rights stay with the uploaders.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const date = q.get("tag") ?? "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? await getTvDay(date) : null;
  const target = parseShareParams({ sender: q.get("sender"), zeit: q.get("zeit") }, STATIONS.map((s) => s.slug));
  const channel = day && target.channelId ? day.channels.find((c) => c.id === target.channelId) : undefined;
  const broadcast = channel && target.tvDayMin !== undefined ? findOnAir(broadcastsOf(day!, channel.id), target.tvDayMin) : null;
  const dateLabel = date ? formatTvDayDate(date) : "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000", color: "#fff", padding: 56, fontFamily: "monospace" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 34, color: "#fff" }}>
          <span>P{channel ? 300 + channel.displayNumber : 300}</span>
          <span>{channel?.name ?? "Videotext"}</span>
          <span>{date ? date.split("-").reverse().join(".") : ""}</span>
        </div>
        <div style={{ display: "flex", marginTop: 28, background: BLUE, color: YELLOW, fontSize: 52, padding: "10px 22px" }}>
          {dateLabel || "Zappen durch die Zeit"}
        </div>
        {broadcast ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
            <div style={{ display: "flex", color: CYAN, fontSize: 64 }}>
              {formatClock(broadcast.startMin)} · {channel!.name}
            </div>
            <div style={{ display: "flex", fontSize: 76, marginTop: 18, lineHeight: 1.1 }}>{broadcast.title.slice(0, 60)}</div>
            {broadcast.description && (
              <div style={{ display: "flex", fontSize: 34, marginTop: 22, color: "#ddd" }}>{broadcast.description.slice(0, 110)}</div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 56, marginTop: 56, color: CYAN }}>Was lief damals? Einschalten und durchzappen.</div>
        )}
        <div style={{ display: "flex", marginTop: "auto", fontSize: 30, color: YELLOW }}>Zappen durch die Zeit</div>
      </div>
    ),
    // A shared link's card never changes much: cache it a day, at the CDN a week.
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400" } },
  );
}
