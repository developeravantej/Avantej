ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_deleted_at_idx" ON "members" USING btree ("deleted_at");
