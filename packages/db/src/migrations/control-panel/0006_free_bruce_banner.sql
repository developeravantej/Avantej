CREATE TABLE "ghl_location_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"webhook_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ghl_location_links" ADD CONSTRAINT "ghl_location_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_location_links_location_id_unique" ON "ghl_location_links" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "ghl_location_links_org_idx" ON "ghl_location_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ghl_location_links_active_idx" ON "ghl_location_links" USING btree ("is_active");