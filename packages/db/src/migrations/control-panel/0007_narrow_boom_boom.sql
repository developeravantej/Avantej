CREATE TABLE "organization_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tenant_node_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_branches" ADD CONSTRAINT "organization_branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_branches_name_unique_idx" ON "organization_branches" USING btree ("name");--> statement-breakpoint
CREATE INDEX "org_branches_org_idx" ON "organization_branches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_branches_tenant_node_idx" ON "organization_branches" USING btree ("tenant_node_id");