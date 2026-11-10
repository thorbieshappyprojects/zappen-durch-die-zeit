CREATE TABLE "admin_login_attempt" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_login_attempt_at_idx" ON "admin_login_attempt" USING btree ("at");