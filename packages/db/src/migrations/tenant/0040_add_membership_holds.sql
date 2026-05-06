-- migration: 0040_add_membership_holds
-- description: Agent 3.1 (Phase 3 — J4) — membership freeze/resume audit trail.
--   * membership_holds: one row per freeze (medical / travel / other).
--   * Cron `auto-resume-holds` reads the (end_date, status) index nightly
--     to flip expired holds back to 'completed' and revert package_instances.status.
--   * No new enum types — `reason` and `status` are free-text validated at the
--     service layer (Drizzle/Zod), keeping migrations idempotent.

CREATE TABLE IF NOT EXISTS "membership_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_instance_id" uuid NOT NULL,
	"member_id" uuid,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"fee_waived" boolean NOT NULL DEFAULT false,
	"status" text NOT NULL DEFAULT 'active',
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"resumed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "membership_holds"
		ADD CONSTRAINT "membership_holds_package_instance_id_fk"
		FOREIGN KEY ("package_instance_id") REFERENCES "package_instances"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "membership_holds"
		ADD CONSTRAINT "membership_holds_member_id_fk"
		FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_holds_package_idx"
	ON "membership_holds" ("package_instance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_holds_resume_idx"
	ON "membership_holds" ("end_date", "status");
