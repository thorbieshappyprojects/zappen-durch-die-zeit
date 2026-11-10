import type { MatchLevel } from "@zdz/core";

/** One colour per level everywhere: green exact, yellow same show/same year, blue similar, red missing. */
export function matchLabel(level: MatchLevel): string {
  switch (level) {
    case "exact":
      return "🟢 Genau diese Sendung";
    case "same_show_period":
      return "🟡 Gleiche Sendung, gleiches Jahr";
    case "same_show":
      return "🔵 Ähnliches";
    case "none":
      return "❌ Kein Video";
  }
}

export const MATCH_MARK: Record<MatchLevel, string> = {
  exact: "🟢",
  same_show_period: "🟡",
  same_show: "🔵",
  none: "❌",
};

/** Tooltip / screen-reader text for the guide's marks. */
export const MATCH_HINT: Record<MatchLevel, string> = {
  exact: "Genau diese Sendung als Video",
  same_show_period: "Gleiche Sendung aus demselben Jahr als Video",
  same_show: "Ähnliches Video (andere Folge, anderer Sender oder anderer Kommentar)",
  none: "Kein Video gefunden",
};

/** One pattern for link-outs: "In der ZDF-Mediathek ansehen", "Bei YouTube ansehen". */
export function watchLabel(provider: string): string {
  return /Mediathek$/.test(provider) ? `In der ${provider} ansehen` : `Bei ${provider} ansehen`;
}
