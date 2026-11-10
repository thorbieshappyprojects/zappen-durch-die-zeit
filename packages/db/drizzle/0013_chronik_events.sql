ALTER TYPE "public"."media_report_reason" ADD VALUE 'off_topic';--> statement-breakpoint
CREATE TABLE "event_exclusion" (
	"event_id" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_exclusion_event_id_url_pk" PRIMARY KEY("event_id","url")
);
--> statement-breakpoint
ALTER TABLE "media_report" ADD COLUMN "event_id" text;