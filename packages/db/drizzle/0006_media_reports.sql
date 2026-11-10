CREATE TYPE "public"."media_report_reason" AS ENUM('unavailable', 'wrong_programme', 'wrong_offset', 'other');--> statement-breakpoint
CREATE TABLE "blocked_video" (
	"url" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_report" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"reason" "media_report_reason" NOT NULL,
	"note" text,
	"tv_date" date,
	"channel" text,
	"broadcast_start" text,
	"broadcast_title" text,
	"automatic" boolean DEFAULT false NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone,
	"handled_action" text
);
--> statement-breakpoint
CREATE INDEX "media_report_url_idx" ON "media_report" USING btree ("url","created_at");--> statement-breakpoint
CREATE INDEX "media_report_ip_created_idx" ON "media_report" USING btree ("ip_hash","created_at");