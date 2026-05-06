-- NOVEL: adds package_instances.preferred_trainer_id with FK to members.id.
-- Rewritten with idempotent guards so re-running on a tenant that already has
-- the column / constraint succeeds.
ALTER TABLE "package_instances" ADD COLUMN IF NOT EXISTS "preferred_trainer_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "package_instances" ADD CONSTRAINT "package_instances_preferred_trainer_id_members_id_fk" FOREIGN KEY ("preferred_trainer_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
