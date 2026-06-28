-- 0099_ghl_pending_contacts (GHL inbound approval gate)
-- Holds inbound GHL ContactCreate webhooks when organizations.ghl_require_approval
-- is true, until staff approve (→ materialize via the normal create path) or
-- reject. No ghl_contact_links row is written while pending, so the live-sync
-- dedupe/retry path is unaffected. Idempotent — safe to re-run on partially
-- migrated tenant branches.

CREATE TABLE IF NOT EXISTS "ghl_pending_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ghl_contact_id" text NOT NULL,
	"ghl_location_id" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"proposed_name" text,
	"proposed_email" text,
	"proposed_phone" text,
	"resolved_branch_node_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "ghl_pending_contacts"
		ADD CONSTRAINT "ghl_pending_contacts_status_check"
		CHECK ("status" IN ('pending', 'approved', 'rejected'));
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ghl_pending_contacts_ghl_contact_id_unique"
	ON "ghl_pending_contacts" ("ghl_contact_id");
CREATE INDEX IF NOT EXISTS "ghl_pending_contacts_status_idx"
	ON "ghl_pending_contacts" ("status");
CREATE INDEX IF NOT EXISTS "ghl_pending_contacts_branch_idx"
	ON "ghl_pending_contacts" ("resolved_branch_node_id");
