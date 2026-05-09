ALTER TABLE "ghl_location_links" RENAME TO "ghl_branch_links";--> statement-breakpoint
ALTER TABLE "ghl_branch_links" RENAME COLUMN "location_id" TO "ghl_location_id";--> statement-breakpoint

-- Drop old indexes that reference the renamed table/column
DROP INDEX IF EXISTS "ghl_location_links_location_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_location_links_org_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_location_links_active_idx";--> statement-breakpoint

-- Add new columns. NOTE: NOT NULL adds work fine on a dev DB with 0 rows.
-- For prod (or dev DBs with existing rows) this would need a default + backfill;
-- out of scope for this task.
ALTER TABLE "ghl_branch_links" ADD COLUMN "tenant_branch_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ghl_branch_links" ADD COLUMN "ghl_api_key" text NOT NULL;--> statement-breakpoint

-- Rename FK constraint to match the new table name
ALTER TABLE "ghl_branch_links" DROP CONSTRAINT "ghl_location_links_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "ghl_branch_links" ADD CONSTRAINT "ghl_branch_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- New indexes matching the new schema definition
CREATE UNIQUE INDEX "ghl_branch_links_org_branch_unique" ON "ghl_branch_links" USING btree ("organization_id","tenant_branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_branch_links_ghl_location_unique" ON "ghl_branch_links" USING btree ("ghl_location_id");--> statement-breakpoint
CREATE INDEX "ghl_branch_links_org_idx" ON "ghl_branch_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ghl_branch_links_branch_idx" ON "ghl_branch_links" USING btree ("tenant_branch_id");--> statement-breakpoint
CREATE INDEX "ghl_branch_links_active_idx" ON "ghl_branch_links" USING btree ("is_active");
