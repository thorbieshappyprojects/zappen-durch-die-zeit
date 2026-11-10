CREATE TABLE "tv_day_channel" (
	"tv_day_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"name" text NOT NULL,
	"display_number" integer NOT NULL,
	CONSTRAINT "tv_day_channel_tv_day_id_channel_id_pk" PRIMARY KEY("tv_day_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "tv_day_channel" ADD CONSTRAINT "tv_day_channel_tv_day_id_tv_day_id_fk" FOREIGN KEY ("tv_day_id") REFERENCES "public"."tv_day"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_day_channel" ADD CONSTRAINT "tv_day_channel_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Seed matches used to be programme-wide; they are now per broadcast. Drop the old rows.
DELETE FROM "media_candidate" WHERE "found_by" = 'seed' AND "broadcast_id" IS NULL;--> statement-breakpoint
-- Backfill the lineup of existing days from the channel table.
INSERT INTO "tv_day_channel" ("tv_day_id", "channel_id", "name", "display_number")
SELECT DISTINCT b."tv_day_id", c."id", c."name", c."display_number"
FROM "broadcast" b JOIN "channel" c ON c."id" = b."channel_id"
ON CONFLICT DO NOTHING;
