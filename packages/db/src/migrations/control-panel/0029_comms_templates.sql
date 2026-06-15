-- Plan F.2.5 — Comms templates library (Agent C).
--
-- Reusable templates for direct-message and announcement composers.
-- The bulk composer (Agent B, next) and per-tenant compose flows pull
-- from this table. Soft-delete via archived_at — archived templates are
-- hidden from the picker but remain visible in the admin "All" view.
--
-- See docs/plans/plan-f-ops-ux.md (F.2.5 scope: outbox + template
-- library + bulk DM/announcement composer).

CREATE TABLE IF NOT EXISTS comms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body_markdown text NOT NULL,
  kind text NOT NULL,
  priority text,
  target_audience text,
  created_by_user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  archived_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS comms_templates_kind_idx
  ON comms_templates (kind)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS comms_templates_name_idx
  ON comms_templates (name);
