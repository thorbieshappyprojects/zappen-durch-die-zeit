export type MatchLevel = "exact" | "same_show_period" | "same_show" | "none";

export type Provider =
  | "youtube"
  | "dailymotion"
  | "archive"
  | "vimeo"
  | "zdf"
  | "ard"
  | "rtlplus"
  | "joyn"
  | "bundestag"
  | "bpb"
  | "other";

export interface Channel {
  id: string;
  name: string;
  displayNumber: number;
  isPrivate: boolean;
}

export interface Broadcast {
  /** Stable id within a TV day: `<channel>-<startMin>`. */
  id: string;
  channelId: string;
  /** Minutes from 00:00 of the TV day's date; values ≥ 1440 are after midnight. */
  startMin: number;
  endMin: number;
  title: string;
  description: string | null;
}

export interface MediaLink {
  url: string;
  label: string;
}

export interface MediaCandidate {
  provider: Provider;
  url: string;
  /** Provider-specific id for the in-screen player (see `videoIdOf`). */
  providerVideoId: string | null;
  embeddable: boolean;
  /** Length of the recording, if known. */
  durationS: number | null;
  matchLevel: Exclude<MatchLevel, "none">;
  note: string;
  alt: MediaLink | null;
}

export interface AdBreak {
  channelId: string;
  provider: Provider;
  url: string;
  providerVideoId: string | null;
  note: string;
  alternatives: string[];
}

export type LicenseStatus = "unknown" | "requested" | "pending" | "granted" | "denied" | "not_required";

export interface ScheduleSource {
  name: string;
  url: string;
  licenseStatus: LicenseStatus;
}

export type Completeness = "full" | "partial" | "series_only";

export interface TvDay {
  /** Calendar date the TV day starts on (06:00), "YYYY-MM-DD". */
  date: string;
  /** "partial": gaps mean "unknown", not "off air". */
  completeness: Completeness;
  source: ScheduleSource;
  channels: Channel[];
  /** Sorted by channel, then start. */
  broadcasts: Broadcast[];
  /** Idents, announcers, sign-off, single ad spots (see interstitials.ts); absent = none. */
  interstitials?: import("./interstitials").Interstitial[];
  /** Keyed by broadcast id. Seed shortcut: matched by exact title. */
  media: Record<string, MediaCandidate>;
  adBreaks: AdBreak[];
}
