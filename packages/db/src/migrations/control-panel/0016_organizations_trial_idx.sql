CREATE INDEX IF NOT EXISTS "organizations_trial_ends_at_idx" ON "organizations"("trial_ends_at") WHERE "trial_ends_at" IS NOT NULL;
