-- Marker migration: superseded by embedded historical migrations.
-- Originally a phantom drizzle-kit recreation of: audit_logs (0019_audit_logs),
-- check_ins (0022_check_ins), member_sessions (0025_member_sessions), refunds (0023_refunds),
-- commission_splits ALTERs + indexes (0024_commission_splits_status), and
-- installment_plans.price_premium_bps (0018_installment_plan_premium). Idempotent no-op
-- for tenants past the historical baseline.
SELECT 1;
