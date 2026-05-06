-- Marker migration: superseded by embedded historical migrations.
-- Originally a phantom drizzle-kit recreation of: member_category_buffer_overrides
-- (0012_member_category_buffer), member_service_buffer_overrides (0014_service_member_buffer),
-- installments + installment_events + organization_settings + package_instances ALTER COLs
-- (0011_installments), google_calendar_connections + google_calendar_event_mappings +
-- appointments.google_calendar_event_id (0013_google_calendar), services.available_payment_plans
-- + services.installment_interval_days (0011_installments), service_members.buffer_time_minutes
-- DROP (0012_member_category_buffer). Idempotent no-op for tenants past the historical baseline.
SELECT 1;
