-- Plan F.6 (Agent Fo) — Per-tenant feature-flag overrides.
--
-- F.4 shipped a read-only Feature flags tab that derives features
-- from `TIER_LIMITS[tier]`. Ops needs per-tenant overrides so they can
-- enable `commissionSplits` for a basic-tier customer as a one-off
-- concession, or disable `apiAccess` for a tenant abusing rate limits,
-- without forcing a tier change.
--
-- Additive only. UNIQUE (organization_id, feature_key) gives us upsert
-- semantics via ON CONFLICT. Author stored as plain text Better-Auth
-- user id (no FK) so the override survives user deletion, mirroring
-- tenant_notes / admin_session_actions.
--
-- Valid feature_key values (enforced in the API layer, not DB, to
-- avoid an enum migration when new features are added):
--   'ghl' | 'googleCalendar' | 'commissionSplits'
--   | 'memberships' | 'apiAccess'

CREATE TABLE IF NOT EXISTS tenant_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL,
  set_by_user_id text NOT NULL,
  notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT tenant_feature_overrides_org_feature_unique
    UNIQUE (organization_id, feature_key)
);

CREATE INDEX IF NOT EXISTS tenant_feature_overrides_org_idx
  ON tenant_feature_overrides (organization_id);
