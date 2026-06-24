-- Per-tenant Resend sending domains + outbound email log.
--
-- email_domains: one row per (org, sending domain). DNS records snapshot
-- comes verbatim from resend.domains.create(); the tenant adds them at their
-- DNS provider. Sends are gated server-side on status = 'verified'.
--
-- email_logs: one row per Resend send, keyed by Resend's message id for
-- idempotent webhook upserts. emailDomainId is nullable to handle sends
-- via the platform RESEND_FROM_EMAIL fallback before a tenant verifies.

CREATE TABLE email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resend_domain_id text NOT NULL UNIQUE,
  domain text NOT NULL,
  from_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  dns_records jsonb,
  verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX email_domains_organization_idx ON email_domains (organization_id);
CREATE INDEX email_domains_status_idx ON email_domains (status);
CREATE UNIQUE INDEX email_domains_org_domain_unique_idx ON email_domains (organization_id, domain);

CREATE TABLE email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_domain_id uuid REFERENCES email_domains(id) ON DELETE SET NULL,
  resend_message_id text NOT NULL UNIQUE,
  from_address text NOT NULL,
  to_address text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  last_event_type text,
  last_event_at timestamp,
  error_message text,
  last_event_payload jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX email_logs_organization_idx ON email_logs (organization_id);
CREATE INDEX email_logs_status_idx ON email_logs (status);
CREATE INDEX email_logs_created_at_idx ON email_logs (created_at);
