CREATE TYPE "public"."license_status" AS ENUM('unknown', 'requested', 'pending', 'granted', 'denied', 'not_required');--> statement-breakpoint
CREATE TYPE "public"."match_level" AS ENUM('exact', 'same_show_period', 'same_show');--> statement-breakpoint
CREATE TYPE "public"."media_provider" AS ENUM('youtube', 'zdf', 'ard', 'rtlplus', 'joyn', 'bundestag', 'bpb', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('proposed', 'approved', 'rejected', 'dead');--> statement-breakpoint
CREATE TYPE "public"."programme_kind" AS ENUM('series_episode', 'show_edition', 'film', 'live_event', 'news', 'other');--> statement-breakpoint
CREATE TYPE "public"."tv_day_completeness" AS ENUM('full', 'partial', 'series_only');--> statement-breakpoint
CREATE TABLE "ad_break" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"aired_on" date,
	"aired_period" text,
	"url" text NOT NULL,
	"provider_video_id" text,
	"rank" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "ad_spot" (
	"id" serial PRIMARY KEY NOT NULL,
	"ad_break_id" integer NOT NULL,
	"brand" text,
	"product" text,
	"in_s" real NOT NULL,
	"out_s" real NOT NULL,
	"quarter" text
);
--> statement-breakpoint
CREATE TABLE "broadcast" (
	"id" serial PRIMARY KEY NOT NULL,
	"tv_day_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"flags" jsonb,
	"raw" jsonb,
	"programme_id" integer
);
--> statement-breakpoint
CREATE TABLE "channel" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"display_number" integer NOT NULL,
	"is_private" boolean NOT NULL,
	"logo_era" jsonb,
	"active_from" date,
	"active_to" date,
	CONSTRAINT "channel_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media_candidate" (
	"id" serial PRIMARY KEY NOT NULL,
	"programme_id" integer,
	"broadcast_id" integer,
	"provider" "media_provider" NOT NULL,
	"url" text NOT NULL,
	"provider_video_id" text,
	"title" text,
	"duration_s" integer,
	"embeddable" boolean NOT NULL,
	"match_level" "match_level" NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"status" "media_status" DEFAULT 'proposed' NOT NULL,
	"found_by" text NOT NULL,
	"verified_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "programme" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "programme_kind" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"series_title" text,
	"season" integer,
	"episode" integer,
	"episode_title" text,
	"year" integer,
	"ext_ids" jsonb
);
--> statement-breakpoint
CREATE TABLE "schedule_source" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"license_status" "license_status" DEFAULT 'unknown' NOT NULL,
	"notes" text,
	CONSTRAINT "schedule_source_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "takedown_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"media_candidate_id" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tv_day" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"source_id" integer NOT NULL,
	"completeness" "tv_day_completeness" NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_break" ADD CONSTRAINT "ad_break_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_spot" ADD CONSTRAINT "ad_spot_ad_break_id_ad_break_id_fk" FOREIGN KEY ("ad_break_id") REFERENCES "public"."ad_break"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_tv_day_id_tv_day_id_fk" FOREIGN KEY ("tv_day_id") REFERENCES "public"."tv_day"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_candidate" ADD CONSTRAINT "media_candidate_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_candidate" ADD CONSTRAINT "media_candidate_broadcast_id_broadcast_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcast"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_request" ADD CONSTRAINT "takedown_request_media_candidate_id_media_candidate_id_fk" FOREIGN KEY ("media_candidate_id") REFERENCES "public"."media_candidate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_day" ADD CONSTRAINT "tv_day_source_id_schedule_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."schedule_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_break_channel_url_idx" ON "ad_break" USING btree ("channel_id","url");--> statement-breakpoint
CREATE INDEX "broadcast_day_channel_start_idx" ON "broadcast" USING btree ("tv_day_id","channel_id","start_min");--> statement-breakpoint
CREATE INDEX "broadcast_programme_idx" ON "broadcast" USING btree ("programme_id");--> statement-breakpoint
CREATE INDEX "broadcast_normalized_title_trgm_idx" ON "broadcast" USING gin ("normalized_title" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "media_candidate_programme_url_idx" ON "media_candidate" USING btree ("programme_id","url");--> statement-breakpoint
CREATE INDEX "media_candidate_programme_status_idx" ON "media_candidate" USING btree ("programme_id","status");--> statement-breakpoint
CREATE INDEX "media_candidate_broadcast_status_idx" ON "media_candidate" USING btree ("broadcast_id","status");--> statement-breakpoint
CREATE INDEX "programme_normalized_title_trgm_idx" ON "programme" USING gin ("normalized_title" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "tv_day_date_source_idx" ON "tv_day" USING btree ("date","source_id");