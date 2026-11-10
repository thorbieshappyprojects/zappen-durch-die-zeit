/** Postgres schema (ARCHITECTURE.md §4). */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const licenseStatus = pgEnum("license_status", [
  "unknown",
  "requested",
  "pending",
  "granted",
  "denied",
  "not_required",
]);
export const tvDayCompleteness = pgEnum("tv_day_completeness", ["full", "partial", "series_only"]);
export const programmeKind = pgEnum("programme_kind", [
  "series_episode",
  "show_edition",
  "film",
  "live_event",
  "news",
  "other",
]);
export const mediaProvider = pgEnum("media_provider", [
  "youtube",
  "dailymotion",
  "archive",
  "vimeo",
  "zdf",
  "ard",
  "rtlplus",
  "joyn",
  "bundestag",
  "bpb",
  "other",
]);
export const matchLevel = pgEnum("match_level", ["exact", "same_show_period", "same_show"]);
export const mediaStatus = pgEnum("media_status", ["proposed", "approved", "rejected", "dead"]);

export const channel = pgTable("channel", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  displayNumber: integer("display_number").notNull(),
  isPrivate: boolean("is_private").notNull(),
  /** Logos/idents per era, e.g. [{ from: "1985-01-01", logo: "…" }]. */
  logoEra: jsonb("logo_era").$type<unknown[]>(),
  activeFrom: date("active_from"),
  activeTo: date("active_to"),
});

export const scheduleSource = pgTable("schedule_source", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  url: text("url"),
  /** Remote importers refuse to run unless this is `granted` or `not_required` (see CLAUDE.md). */
  licenseStatus: licenseStatus("license_status").notNull().default("unknown"),
  notes: text("notes"),
});

export const tvDay = pgTable(
  "tv_day",
  {
    id: serial("id").primaryKey(),
    /** Calendar date the TV day starts on (06:00 Europe/Berlin). */
    date: date("date").notNull(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => scheduleSource.id),
    completeness: tvDayCompleteness("completeness").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tv_day_date_source_idx").on(t.date, t.sourceId)],
);

/** Channel lineup of one TV day: names and numbers changed over the years (RTL plus → RTL). */
export const tvDayChannel = pgTable(
  "tv_day_channel",
  {
    tvDayId: integer("tv_day_id")
      .notNull()
      .references(() => tvDay.id, { onDelete: "cascade" }),
    channelId: integer("channel_id")
      .notNull()
      .references(() => channel.id),
    name: text("name").notNull(),
    displayNumber: integer("display_number").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tvDayId, t.channelId] })],
);

export const programme = pgTable(
  "programme",
  {
    id: serial("id").primaryKey(),
    kind: programmeKind("kind").notNull().default("other"),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    seriesTitle: text("series_title"),
    season: integer("season"),
    episode: integer("episode"),
    episodeTitle: text("episode_title"),
    year: integer("year"),
    /** fernsehserien, tvdb, tmdb, imdb, wikidata ids. */
    extIds: jsonb("ext_ids").$type<Record<string, string>>(),
  },
  (t) => [index("programme_normalized_title_trgm_idx").using("gin", sql`${t.normalizedTitle} gin_trgm_ops`)],
);

export const broadcast = pgTable(
  "broadcast",
  {
    id: serial("id").primaryKey(),
    tvDayId: integer("tv_day_id")
      .notNull()
      .references(() => tvDay.id, { onDelete: "cascade" }),
    channelId: integer("channel_id")
      .notNull()
      .references(() => channel.id),
    /** Minutes from 00:00 of the TV day's date; ≥ 1440 after midnight. */
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    /** Wh., s/w, OmU, live … */
    flags: jsonb("flags").$type<Record<string, boolean>>(),
    raw: jsonb("raw"),
    programmeId: integer("programme_id").references(() => programme.id, { onDelete: "set null" }),
  },
  (t) => [
    index("broadcast_day_channel_start_idx").on(t.tvDayId, t.channelId, t.startMin),
    index("broadcast_programme_idx").on(t.programmeId),
    index("broadcast_normalized_title_trgm_idx").using("gin", sql`${t.normalizedTitle} gin_trgm_ops`),
  ],
);

export const mediaCandidate = pgTable(
  "media_candidate",
  {
    id: serial("id").primaryKey(),
    programmeId: integer("programme_id").references(() => programme.id, { onDelete: "cascade" }),
    broadcastId: integer("broadcast_id").references(() => broadcast.id, { onDelete: "cascade" }),
    provider: mediaProvider("provider").notNull(),
    url: text("url").notNull(),
    providerVideoId: text("provider_video_id"),
    /** Video title, or the link label for curated alternatives. */
    title: text("title"),
    durationS: integer("duration_s"),
    embeddable: boolean("embeddable").notNull(),
    matchLevel: matchLevel("match_level").notNull(),
    confidence: real("confidence").notNull().default(0),
    status: mediaStatus("status").notNull().default("proposed"),
    foundBy: text("found_by").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("media_candidate_programme_url_idx").on(t.programmeId, t.url),
    index("media_candidate_programme_status_idx").on(t.programmeId, t.status),
    index("media_candidate_broadcast_status_idx").on(t.broadcastId, t.status),
  ],
);

export const interstitialKind = pgEnum("interstitial_kind", [
  "ad_break",
  "ident",
  "announcer",
  "trailer",
  "sign_off",
  "sign_on",
  "test_card",
]);

/**
 * The glue between programmes: ad breaks and single spots, station idents, announcers, trailers,
 * sign-off/sign-on. Replaces the former ad_break table (copied as kind = ad_break).
 * `channel_id` null = not tied to one channel (e.g. a pool of single ad spots).
 */
export const interstitial = pgTable(
  "interstitial",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id").references(() => channel.id),
    kind: interstitialKind("kind").notNull(),
    airedOn: date("aired_on"),
    /** e.g. "1991" or "1991-Q1" */
    airedPeriod: text("aired_period"),
    /** Logo eras etc.: only used between these dates (inclusive) when set. */
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    url: text("url").notNull(),
    providerVideoId: text("provider_video_id"),
    /** Segment of a longer recording, in seconds. */
    inS: real("in_s"),
    outS: real("out_s"),
    durationS: real("duration_s"),
    /** Lower rank = preferred. */
    rank: integer("rank").notNull().default(0),
    notes: text("notes"),
    status: mediaStatus("status").notNull().default("proposed"),
  },
  // NULLS NOT DISTINCT: a pool spot (channel null) or a whole recording (in_s null) is still unique.
  (t) => [unique("interstitial_channel_kind_url_in_key").on(t.channelId, t.kind, t.url, t.inS).nullsNotDistinct()],
);

/** Single spots inside an ad break recording (unused so far, kept for curation). */
export const adSpot = pgTable("ad_spot", {
  id: serial("id").primaryKey(),
  interstitialId: integer("interstitial_id")
    .notNull()
    .references(() => interstitial.id, { onDelete: "cascade" }),
  brand: text("brand"),
  product: text("product"),
  inS: real("in_s").notNull(),
  outS: real("out_s").notNull(),
  quarter: text("quarter"),
});

export const takedownRequest = pgTable("takedown_request", {
  id: serial("id").primaryKey(),
  mediaCandidateId: integer("media_candidate_id")
    .notNull()
    .references(() => mediaCandidate.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason"),
  handledAt: timestamp("handled_at", { withTimezone: true }),
});

export const contributionKind = pgEnum("contribution_kind", ["video_link", "schedule", "note"]);
export const contributionStatus = pgEnum("contribution_status", ["pending", "approved", "rejected", "spam"]);

/** Community submissions: nothing goes live before a moderator approves it. */
export const contribution = pgTable(
  "contribution",
  {
    id: serial("id").primaryKey(),
    kind: contributionKind("kind").notNull(),
    status: contributionStatus("status").notNull().default("pending"),
    tvDate: date("tv_date"),
    channel: text("channel"),
    broadcastStart: text("broadcast_start"),
    broadcastTitle: text("broadcast_title"),
    url: text("url"),
    body: text("body"),
    sourceInfo: text("source_info"),
    contributorName: text("contributor_name"),
    contributorEmail: text("contributor_email"),
    /** sha256 of (daily salt + IP); never the IP itself. Used for rate limiting only. */
    ipHash: text("ip_hash").notNull(),
    spamReasons: jsonb("spam_reasons").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    mediaCandidateId: integer("media_candidate_id").references(() => mediaCandidate.id, { onDelete: "set null" }),
    /** Detected from the text ("Ansage", "Sendeschluss", "Ident" …): an interstitial suggestion. */
    suggestedKind: text("suggested_kind"),
  },
  (t) => [index("contribution_status_created_idx").on(t.status, t.createdAt), index("contribution_ip_created_idx").on(t.ipHash, t.createdAt)],
);

/** Attachments of a contribution (photos/scans of TV guides, PDFs, text files). Stored outside the web root. */
export const contributionFile = pgTable(
  "contribution_file",
  {
    id: serial("id").primaryKey(),
    contributionId: integer("contribution_id")
      .notNull()
      .references(() => contribution.id, { onDelete: "cascade" }),
    /** Sanitized original name, for display only. */
    originalName: text("original_name").notNull(),
    /** Detected from the content, not the upload's claim. */
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** Path relative to the upload directory: "<contributionId>/<random>.<ext>". */
    storageKey: text("storage_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contribution_file_contribution_idx").on(t.contributionId)],
);

/** off_topic: in the Chronik, the video doesn't belong to the event (media_report.event_id names it). */
export const mediaReportReason = pgEnum("media_report_reason", ["unavailable", "wrong_programme", "wrong_offset", "other", "off_topic"]);

/**
 * "Video defekt / falsch" reports from viewers (and automatic ones when a player fails).
 * Keyed by video URL, not by media_candidate id: candidates are recreated on every re-import.
 */
export const mediaReport = pgTable(
  "media_report",
  {
    id: serial("id").primaryKey(),
    url: text("url").notNull(),
    reason: mediaReportReason("reason").notNull(),
    note: text("note"),
    /** Where it was seen (context for the moderator). */
    tvDate: date("tv_date"),
    channel: text("channel"),
    broadcastStart: text("broadcast_start"),
    broadcastTitle: text("broadcast_title"),
    /** Chronik event (core HISTORY_EVENTS id) the video was seen in; set for "off_topic". */
    eventId: text("event_id"),
    /** true when sent by the player after a load error, not by a person. */
    automatic: boolean("automatic").notNull().default(false),
    /** sha256 of (daily salt + IP); never the IP itself. */
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    /** "dead" | "ignored" | "review" | "excluded" (taken out of its Chronik event) */
    handledAction: text("handled_action"),
  },
  (t) => [index("media_report_url_idx").on(t.url, t.createdAt), index("media_report_ip_created_idx").on(t.ipHash, t.createdAt)],
);

/**
 * Videos a moderator took out of one Chronik event (core events.ts) because they don't report on it.
 * They stay on the TV everywhere else. Keyed by URL like blocked_video, so it survives re-imports.
 */
export const eventExclusion = pgTable(
  "event_exclusion",
  {
    eventId: text("event_id").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.url] })],
);

/** Videos taken out of the TV (defective or wrong). Survives re-imports, unlike media_candidate.status. */
export const blockedVideo = pgTable("blocked_video", {
  url: text("url").primaryKey(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Admin switches per station (slug from the station registry): hidden stations leave the channel list. */
export const stationSetting = pgTable("station_setting", {
  slug: text("slug").primaryKey(),
  hidden: boolean("hidden").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Site-wide admin switches (e.g. CRT filter, TV sounds), key → JSON value; missing keys use the defaults in stats.ts. */
export const siteSetting = pgTable("site_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Failed admin logins (per daily IP hash), for the per-address and global throttle; kept one window. */
export const adminLoginAttempt = pgTable(
  "admin_login_attempt",
  {
    id: serial("id").primaryKey(),
    ipHash: text("ip_hash").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_login_attempt_at_idx").on(t.at)],
);

/** Admin decisions on uploads the curation left out (groups in seed/upload-review.json). */
export const uploadReview = pgTable("upload_review", {
  groupId: text("group_id").primaryKey(),
  decision: text("decision", { enum: ["include", "exclude"] }).notNull(),
  note: text("note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Daily snapshot of the database's key figures, for the growth trend on the admin dashboard. */
export const statsSnapshot = pgTable("stats_snapshot", {
  day: date("day").primaryKey(),
  data: jsonb("data").$type<Record<string, number>>().notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
});
