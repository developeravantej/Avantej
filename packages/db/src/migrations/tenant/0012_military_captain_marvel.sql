-- Marker migration: superseded by embedded historical migrations.
-- Originally a phantom drizzle-kit recreation of: installment_plans table + indexes
-- (0017_installment_plans), package_instances.credits_remaining drop+regenerate as STORED
-- (0016_credits_generated), services.grace_period_days (0015_grace_period). Idempotent
-- no-op for tenants past the historical baseline.
SELECT 1;
