CREATE TABLE "upload_review" (
	"group_id" text PRIMARY KEY NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
