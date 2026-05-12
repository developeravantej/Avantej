-- Marker migration: superseded by embedded historical migrations.
-- Originally a phantom drizzle-kit recreation of tables already created by
-- 0005_schema_enhancement (member_profiles, service_members, service_category_config,
-- customer_profiles, notification_preferences, notifications, user_activity_log,
-- package_instances, preferred_times, class_slots, waitlist_entries, recurrence_rules,
-- announcements, expenses, payment_items + ALTER COLUMN additions to services/appointments/payments
-- + indexes/FKs). Idempotent no-op for tenants past the historical baseline.
SELECT 1;
