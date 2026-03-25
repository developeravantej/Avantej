ALTER TABLE "organization_branches" ADD COLUMN "country" text;--> statement-breakpoint
CREATE INDEX "org_branches_country_idx" ON "organization_branches" USING btree ("country");