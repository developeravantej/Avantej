ALTER TABLE "hierarchy_nodes" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "hierarchy_deleted_at_idx" ON "hierarchy_nodes" USING btree ("deleted_at");