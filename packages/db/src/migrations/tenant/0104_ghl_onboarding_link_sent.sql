-- 0104_ghl_onboarding_link_sent (GHL approval → onboarding hand-off)
-- Persists the onboarding-link hand-off state on the approval-queue row so the
-- "Sent ✓ / Resend" state survives a reload instead of living only in the
-- browser session. `status='approved'` already marks the member as created;
-- these columns track whether the sign-in link that starts registration has
-- been dispatched, and by whom. Idempotent — safe to re-run on partially
-- migrated tenant branches.

ALTER TABLE "ghl_pending_contacts"
	ADD COLUMN IF NOT EXISTS "onboarding_link_sent_at" timestamp;

ALTER TABLE "ghl_pending_contacts"
	ADD COLUMN IF NOT EXISTS "onboarding_link_sent_by" text;
