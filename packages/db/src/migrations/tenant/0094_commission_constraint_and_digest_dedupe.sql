-- Migration 0094 — commission constraint cleanup + approval-digest dedupe.
--
-- (a) Drop the redundant `commission_splits_must_target_one` CHECK (added 0034).
--     It forces EXACTLY-ONE target for ALL splits, which silently overrides the
--     intended 0052 relaxation (`commission_splits_source_check`) that allows
--     MANUAL splits 0-or-1 target. With both live, the effective rule is
--     "exactly one for everything" — defeating 0052. `source_check` stays and
--     still enforces exactly-one for NON-manual (automatic) splits, so dropping
--     `must_target_one` only loosens manual splits to the 0-or-1 that 0052
--     intended. No integrity loss for automatic splits.
--
-- (b) Back the approval-digest dedupe (commission-approval-alert.service.ts)
--     with a PARTIAL unique index so two overlapping cron runs cannot
--     double-insert an unread digest. Scoped to the digest type + unread only —
--     it does NOT constrain any other notification type, nor read digests.
--
-- Both statements are idempotent (DROP IF EXISTS / CREATE IF NOT EXISTS).

ALTER TABLE "commission_splits"
  DROP CONSTRAINT IF EXISTS "commission_splits_must_target_one";

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_unread_commission_digest_uniq"
  ON "notifications" ("user_id")
  WHERE "type" = 'commission_pending_digest' AND "is_read" = false;
