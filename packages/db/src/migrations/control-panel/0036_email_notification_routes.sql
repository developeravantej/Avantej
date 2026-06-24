-- 0036_email_notification_routes.sql
-- Per-tenant notification -> sender routing (alias + from-name + subject
-- override). See docs/superpowers/specs/2026-06-18-tenant-notification-routing-design.md

CREATE TABLE email_notification_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  alias_id uuid REFERENCES email_domain_aliases(id) ON DELETE SET NULL,
  from_name_override text,
  subject_override text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX email_notification_routes_organization_idx
  ON email_notification_routes (organization_id);
CREATE UNIQUE INDEX email_notification_routes_org_type_unique_idx
  ON email_notification_routes (organization_id, notification_type);

ALTER TABLE email_logs ADD COLUMN notification_type text;
