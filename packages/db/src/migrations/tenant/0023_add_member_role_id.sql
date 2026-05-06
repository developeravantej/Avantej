-- Wave 3a Agent 2.1 (Journey J1): adds members.role_id with FK to roles.id and an index.
-- Idempotent so re-running on a tenant that already has the column / constraint succeeds.
-- ON DELETE SET NULL: deleting a custom role preserves the member, falling permissions
-- back to the legacy text role.
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "role_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "members" ADD CONSTRAINT "members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_role_id_idx" ON "members" ("role_id");
