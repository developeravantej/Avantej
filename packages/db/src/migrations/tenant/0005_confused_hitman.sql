CREATE TABLE "ghl_contact_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ghl_contact_id" text NOT NULL,
	"user_id" text NOT NULL,
	"customer_profile_id" uuid,
	"sync_status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ghl_sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"ghl_contact_id" text,
	"email" text,
	"status" text NOT NULL,
	"error_message" text,
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "deleted_source" text;--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD CONSTRAINT "ghl_contact_links_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_contact_links_ghl_contact_id_unique" ON "ghl_contact_links" USING btree ("ghl_contact_id");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_user_idx" ON "ghl_contact_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_customer_profile_idx" ON "ghl_contact_links" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_sync_status_idx" ON "ghl_contact_links" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_last_synced_idx" ON "ghl_contact_links" USING btree ("last_synced_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_sync_events_event_key_unique" ON "ghl_sync_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "ghl_sync_events_event_type_idx" ON "ghl_sync_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "ghl_sync_events_contact_idx" ON "ghl_sync_events" USING btree ("ghl_contact_id");--> statement-breakpoint
CREATE INDEX "ghl_sync_events_status_idx" ON "ghl_sync_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ghl_sync_events_created_idx" ON "ghl_sync_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_profiles_is_deleted_idx" ON "customer_profiles" USING btree ("is_deleted");