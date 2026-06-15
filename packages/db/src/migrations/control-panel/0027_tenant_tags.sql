-- Plan F.1 — tenant_tags.
--
-- Platform-admin labels attached to a tenant org (e.g. "enterprise",
-- "trial", "high-risk"). UNIQUE per (organization_id, label) so the
-- chip set per org is naturally deduped. No junction table — labels
-- are denormalised onto the org row via this 1:N table.
--
-- color is optional UI hint (e.g. "#ef4444" or tailwind token).
-- created_by_user_id is the Better-Auth user id (no FK so the tag
-- survives admin user deletion, mirroring tenant_notes).

CREATE TABLE tenant_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text,
  created_by_user_id text NOT NULL,
  created_at timestamp DEFAULT now(),
  UNIQUE (organization_id, label)
);
CREATE INDEX tenant_tags_label_idx ON tenant_tags (label);
CREATE INDEX tenant_tags_org_idx ON tenant_tags (organization_id);
