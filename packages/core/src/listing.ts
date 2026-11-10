/** Day listing pages (/tag/<date>/programm): may search engines index them? */
import type { Completeness, LicenseStatus } from "./types";

/**
 * Only when publishing is switched on (env PUBLISH_LISTINGS=1), the source's licence allows it,
 * and the day is a real programme day – assumed days (regular slots only) are thin content.
 */
export function listingIndexable(day: { licenseStatus: LicenseStatus | string; completeness: Completeness | string }, publish: boolean): boolean {
  return publish && (day.licenseStatus === "granted" || day.licenseStatus === "not_required") && day.completeness !== "series_only";
}

/** Text instead of emoji for the printed listing. */
export const LISTING_MATCH_TEXT: Record<string, string> = {
  exact: "Video",
  same_show_period: "Video (gleiches Jahr)",
  same_show: "ähnliches Video",
  none: "",
};
