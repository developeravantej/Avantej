CREATE TABLE "ghl_user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ghl_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"member_id" uuid NOT NULL,
	"branch_node_id" uuid NOT NULL,
	"ghl_location_id" text NOT NULL,
	"last_error" text,
	"sync_status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "ghl_contact_links_sync_status_idx";--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD COLUMN "branch_node_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD COLUMN "ghl_location_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_user_links_ghl_user_id_unique" ON "ghl_user_links" USING btree ("ghl_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_user_links_member_branch_unique" ON "ghl_user_links" USING btree ("member_id","branch_node_id");--> statement-breakpoint
CREATE INDEX "ghl_user_links_user_idx" ON "ghl_user_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ghl_user_links_member_idx" ON "ghl_user_links" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "ghl_user_links_branch_idx" ON "ghl_user_links" USING btree ("branch_node_id");--> statement-breakpoint
CREATE INDEX "ghl_user_links_ghl_location_idx" ON "ghl_user_links" USING btree ("ghl_location_id");--> statement-breakpoint
CREATE INDEX "ghl_user_links_sync_status_idx" ON "ghl_user_links" USING btree ("sync_status","last_synced_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_contact_links_customer_branch_unique" ON "ghl_contact_links" USING btree ("customer_profile_id","branch_node_id");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_branch_idx" ON "ghl_contact_links" USING btree ("branch_node_id");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_ghl_location_idx" ON "ghl_contact_links" USING btree ("ghl_location_id");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_sync_status_idx" ON "ghl_contact_links" USING btree ("sync_status","last_synced_at");