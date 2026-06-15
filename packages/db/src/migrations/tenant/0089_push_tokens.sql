-- 0089_push_tokens.sql
-- Backfill schema model for the push_tokens table (native push-notification
-- device tokens). The table already exists in the dev tenant branch (created
-- ahead of its schema model); this migration makes it official and is fully
-- idempotent for tenants in either state.

CREATE TABLE IF NOT EXISTS "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_tokens_user_idx" ON "push_tokens" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_unique" ON "push_tokens" ("token");
