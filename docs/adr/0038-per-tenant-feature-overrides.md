# ADR 0038 — Per-Tenant Feature-Flag Overrides

Date: 2026-05-17
Status: Accepted
Extends: F.4 Agent Ff feature-flags tab (read-only)

## Context

F.4 shipped a read-only Feature flags tab that derived a tenant's
feature set from `TIER_LIMITS[tier].features`. Ops asked for two
real-world capabilities the read-only surface didn't support:

1. **Concession**: enable a paid-tier feature for a basic-tier
   customer as a sales/retention move ("we'll throw in
   commissionSplits for your renewal").
2. **Enforcement**: disable a feature for a tenant abusing it (e.g.,
   `apiAccess` for a tenant hammering rate limits while ops figures
   out next steps).

Both need per-tenant overrides that win over the tier default.

## Decision

New table `tenant_feature_overrides` + 3 procs on the existing
`platformAdminTenantsFeatureFlagsRouter`. Effective feature value is
the merge: `override?.enabled ?? tier_default`.

### Schema (slot 0031, additive)

```sql
CREATE TABLE tenant_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,            -- 'ghl' | 'googleCalendar' | 'commissionSplits' | 'memberships' | 'apiAccess'
  enabled boolean NOT NULL,
  set_by_user_id text NOT NULL,
  notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE (organization_id, feature_key)
);
CREATE INDEX tenant_feature_overrides_org_idx ON tenant_feature_overrides (organization_id);
```

UNIQUE constraint = upsert semantics. One override per (org, feature).

### Merge rule

```ts
features[k] = override[k]?.enabled ?? TIER_LIMITS[tier].features[k]
```

`source` field on `get` return:
- `'tier_default'` — no overrides; features pure from TIER_LIMITS
- `'mixed'` — ≥1 override active; some features may diverge from
  tier default

The original F.4 spec had `'override'` as a value but it was never
returned in production. F.6 changes to `'tier_default' | 'mixed'`
since "mixed" better describes per-feature merging.

### RBAC

- `get` / `listOverrides` — any platform-admin (read)
- `setOverride` / `clearOverride` — **super_admin only**

Rationale: features are core product capabilities. Support shouldn't
unilaterally grant paid features (commercial implication) or revoke
them (customer-facing impact).

### Audit

One row per mutation:
- `tenant_feature_override_set` — metadata `{ featureKey, enabled, notes? }`
- `tenant_feature_override_clear` — metadata `{ featureKey }`

`targetOrgId` set on both. Mirrors the audit pattern from Agents I/T2/C2.

### UI (extends F.4 Feature flags tab)

- Each feature card visible to all platform-admin roles.
- For super_admin: card shows toggle button + (if overridden) "Reset
  to tier default" link.
- For non-super-admin: card shows "Overridden" badge if applicable
  but no toggle (read-only).
- Confirm dialog on toggle: "Override [feature] to ENABLED for this
  tenant? (Tier default is DISABLED.) Optional notes input."
- Header strip shows "N overrides active" badge when source = 'mixed'.

## Consequences

- New table + 3 new procs. No breaking changes to F.4's read API.
- All clients that read `features` from `get` automatically pick up
  the merged value — no consumer code change needed.
- Override metadata (who set it, when, optional notes) surfaces in
  audit + the new `overrides` field on `get` response. Ops can see
  *why* an override was made.
- The UNIQUE constraint prevents accidental duplicate overrides per
  feature; `setOverride` is upsert-safe.
- `clearOverride` is idempotent — clearing a non-existent override is
  a no-op (return ok). Avoids race-condition errors when ops clicks
  reset multiple times.

## Alternatives considered

- **Boolean column per feature on `organizations`** (e.g.,
  `commission_splits_override boolean`). Rejected — adds a column per
  feature, doesn't carry metadata (who/when/why), schema churn every
  time a new feature is added.
- **JSONB `feature_overrides` on `organizations`**. Rejected for same
  reasons as ADR-0029 (tags as table, not jsonb) — per-feature audit
  granularity matters; UNIQUE constraint per (org, feature) gives
  idempotent upserts; new features add naturally.
- **Bulk override proc** (apply same override to N orgs). Rejected
  for v1 — most overrides are one-off concessions or one-off
  enforcement. If a tier-wide feature change is needed, edit
  `TIER_LIMITS` directly (one-line code change). Defer bulk if
  demanded.
- **Tier-aware overrides** (override only valid for specific tier).
  Rejected — overrides intentionally bypass tier; that's the point.
  No tier-validity check.
- **Allow support to set overrides with confirmation**. Rejected —
  commercial implication is too high. Confirmation modal doesn't
  meaningfully gate against an unauthorized support admin.

## Open follow-ups

- **Bulk overrides** — if ops needs to apply the same override to N
  orgs (e.g., "enable beta feature X for the 10 enterprise tenants
  who opted in"), add `bulkSetOverride` with 100-row cap mirroring
  Agent T's bulk pattern.
- **Override expiration** — currently overrides are forever-active
  until cleared. If ops wants "trial commissionSplits for 30 days",
  add an `expires_at` column + cron that auto-clears.
- **Override audit history per row** — today only the latest state is
  stored. If ops asks for "show me the history of overrides on
  tenant X", the audit log has it but isn't UI-surfaced. Open a
  follow-up surface.
