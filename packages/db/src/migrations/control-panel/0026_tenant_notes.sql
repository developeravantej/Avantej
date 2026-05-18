-- Plan F.1 — tenant_notes.
--
-- Internal platform-admin notes attached to a tenant org. Pinned,
-- append-only audit trail, 1-hour edit-own window then frozen.
-- Soft-delete via deleted_at to keep audit history intact.

CREATE TABLE tenant_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_user_id text NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  deleted_at timestamp
);
CREATE INDEX tenant_notes_org_idx ON tenant_notes (organization_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX tenant_notes_pinned_idx ON tenant_notes (organization_id, is_pinned, created_at DESC) WHERE deleted_at IS NULL;
