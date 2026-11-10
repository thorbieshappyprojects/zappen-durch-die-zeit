CREATE TABLE "station_setting" (
	"slug" text PRIMARY KEY NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stats_snapshot" (
	"day" date PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
