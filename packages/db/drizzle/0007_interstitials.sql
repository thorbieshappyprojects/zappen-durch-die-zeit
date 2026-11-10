-- F4: generalise ad breaks into interstitials (ad breaks, idents, announcers, trailers, sign-off/on).
CREATE TYPE "public"."interstitial_kind" AS ENUM('ad_break', 'ident', 'announcer', 'trailer', 'sign_off', 'sign_on', 'test_card');--> statement-breakpoint
CREATE TABLE "interstitial" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer,
	"kind" "interstitial_kind" NOT NULL,
	"aired_on" date,
	"aired_period" text,
	"valid_from" date,
	"valid_to" date,
	"url" text NOT NULL,
	"provider_video_id" text,
	"in_s" real,
	"out_s" real,
	"duration_s" real,
	"rank" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"status" "media_status" DEFAULT 'proposed' NOT NULL,
	CONSTRAINT "interstitial_channel_kind_url_in_key" UNIQUE NULLS NOT DISTINCT("channel_id","kind","url","in_s")
);
--> statement-breakpoint
ALTER TABLE "interstitial" ADD CONSTRAINT "interstitial_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Keep every existing ad break (they were curated, so approved).
INSERT INTO "interstitial" ("channel_id", "kind", "aired_on", "aired_period", "url", "provider_video_id", "rank", "notes", "status")
SELECT "channel_id", 'ad_break', "aired_on", "aired_period", "url", "provider_video_id", "rank", "notes", 'approved' FROM "ad_break";--> statement-breakpoint
-- ad_spot was never filled: recreate it on top of interstitial.
DROP TABLE "ad_spot";--> statement-breakpoint
CREATE TABLE "ad_spot" (
	"id" serial PRIMARY KEY NOT NULL,
	"interstitial_id" integer NOT NULL,
	"brand" text,
	"product" text,
	"in_s" real NOT NULL,
	"out_s" real NOT NULL,
	"quarter" text
);
--> statement-breakpoint
ALTER TABLE "ad_spot" ADD CONSTRAINT "ad_spot_interstitial_id_interstitial_id_fk" FOREIGN KEY ("interstitial_id") REFERENCES "public"."interstitial"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP TABLE "ad_break";
