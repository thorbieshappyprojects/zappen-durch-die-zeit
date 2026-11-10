CREATE TABLE "contribution_file" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribution_id" integer NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_file_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "contribution_file" ADD CONSTRAINT "contribution_file_contribution_id_contribution_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contribution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contribution_file_contribution_idx" ON "contribution_file" USING btree ("contribution_id");