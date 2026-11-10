CREATE TYPE "public"."contribution_kind" AS ENUM('video_link', 'schedule', 'note');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('pending', 'approved', 'rejected', 'spam');--> statement-breakpoint
CREATE TABLE "contribution" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "contribution_kind" NOT NULL,
	"status" "contribution_status" DEFAULT 'pending' NOT NULL,
	"tv_date" date,
	"channel" text,
	"broadcast_start" text,
	"broadcast_title" text,
	"url" text,
	"body" text,
	"source_info" text,
	"contributor_name" text,
	"contributor_email" text,
	"ip_hash" text NOT NULL,
	"spam_reasons" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"media_candidate_id" integer
);
--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_media_candidate_id_media_candidate_id_fk" FOREIGN KEY ("media_candidate_id") REFERENCES "public"."media_candidate"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_status_created_idx" ON "contribution" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contribution_ip_created_idx" ON "contribution" USING btree ("ip_hash","created_at");