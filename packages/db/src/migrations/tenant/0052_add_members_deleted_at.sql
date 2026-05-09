ALTER TABLE "members" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "members_deleted_at_idx" ON "members" USING btree ("deleted_at");