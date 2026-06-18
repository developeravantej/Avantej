-- Tenant migration: scheduled_reports
-- Stores admin-configured recurring email-report schedules.
-- The apps/server Cloudflare Cron Trigger scans by (is_active, next_run_at) hourly.
-- Idempotent: safe to re-run on partially migrated tenants.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scheduled_report_frequency') THEN
    CREATE TYPE scheduled_report_frequency AS ENUM ('daily', 'weekly', 'monthly');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scheduled_report_format') THEN
    CREATE TYPE scheduled_report_format AS ENUM ('pdf', 'csv');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipients    text NOT NULL,
  report_name   text NOT NULL,
  window_key    text NOT NULL,
  format        scheduled_report_format NOT NULL DEFAULT 'pdf',
  frequency     scheduled_report_frequency NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  next_run_at   timestamptz NOT NULL,
  last_sent_at  timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text
);

CREATE INDEX IF NOT EXISTS scheduled_reports_due_idx
  ON scheduled_reports(is_active, next_run_at);
