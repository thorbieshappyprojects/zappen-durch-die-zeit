"use server";

import { parseReportInput, type ReportInput } from "@zdz/core";
import { AUTO_BLOCK_DAYS, AUTO_BLOCK_REPORTS, blockVideo, countRecentReportsByIp, countUnavailableReports, createMediaReport, isKnownVideoUrl } from "@zdz/db";
import { headers } from "next/headers";
import { clientIp, formTokenAgeSeconds, hashIp } from "@/lib/contribution-security";
import { db, invalidateCoverage } from "@/lib/db";
import { videoAvailable } from "@/lib/video-health";

/** Reports per IP hash and hour (people and players together). */
const PER_HOUR = 20;
/** Form tokens are valid this long (pages renew theirs earlier, lib/form-token.ts). */
const TOKEN_MAX_AGE_S = 24 * 3600;
/** A person needs a moment to pick a reason; the player's automatic report doesn't. */
const MIN_FILL_SECONDS = 2;

export type { ReportInput };

/**
 * "Video defekt / falsch". Always answers ok (no hints for bots). Reports never change what is
 * shown, except: ≥ 3 open "unavailable" reports within 7 days and a failed health check block the video.
 */
export async function reportVideo(raw: ReportInput): Promise<{ ok: true; expired?: true }> {
  // The argument comes from the network: check it at runtime (core parseReportInput).
  const input = parseReportInput(raw);
  if (!input) return { ok: true };
  const age = formTokenAgeSeconds(input.token);
  // Correctly signed but too old (a TV left open): not spam – the client retries with a fresh token.
  if (age !== undefined && age >= TOKEN_MAX_AGE_S) return { ok: true, expired: true };
  const valid =
    age !== undefined &&
    (input.automatic || age >= MIN_FILL_SECONDS) &&
    !input.website;
  if (!valid) return { ok: true };

  const ipHash = hashIp(clientIp(await headers()));
  const { db: handle } = await db();
  if ((await countRecentReportsByIp(handle, ipHash, new Date(Date.now() - 3600_000))) >= PER_HOUR) return { ok: true };
  // Only our own links: an unknown URL is never stored, shown to moderators or fetched.
  if (!(await isKnownVideoUrl(handle, input.url))) return { ok: true };

  const text = (v: string | undefined, max: number) => v?.trim().slice(0, max) || null;
  await createMediaReport(handle, {
    url: input.url,
    reason: input.reason,
    note: text(input.note, 500),
    tvDate: input.tvDate && /^\d{4}-\d{2}-\d{2}$/.test(input.tvDate) ? input.tvDate : null,
    channel: text(input.channel, 40),
    broadcastStart: input.start && /^\d{2}:\d{2}$/.test(input.start) ? input.start : null,
    broadcastTitle: text(input.title, 200),
    automatic: Boolean(input.automatic),
    ipHash,
  });

  if (input.reason === "unavailable") {
    const since = new Date(Date.now() - AUTO_BLOCK_DAYS * 86_400_000);
    if ((await countUnavailableReports(handle, input.url, since)) >= AUTO_BLOCK_REPORTS && !(await videoAvailable(input.url))) {
      await blockVideo(handle, input.url, `auto: ${AUTO_BLOCK_REPORTS}+ reports, health check failed`);
      invalidateCoverage();
    }
  }
  return { ok: true };
}
