-- Curated sending-address aliases per email_domains row. Used by the UI so
-- tenants pick from a curated list (e.g. "support", "noreply", "billing")
-- instead of hardcoding strings in every code path.

CREATE TABLE email_domain_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_domain_id uuid NOT NULL REFERENCES email_domains(id) ON DELETE CASCADE,
  local_part text NOT NULL,
  label text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX email_domain_aliases_domain_idx ON email_domain_aliases (email_domain_id);
CREATE UNIQUE INDEX email_domain_aliases_domain_local_unique_idx
  ON email_domain_aliases (email_domain_id, local_part);
