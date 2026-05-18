# ADR 0029 — Tenant Tags as a Dedicated Table

Date: 2026-05-17
Status: Accepted

## Context

Plan F.1 adds tags + bulk ops on the `/tenants` list. Tags let ops
label segments ("enterprise", "trial", "high-risk") and run bulk
actions on filtered subsets ("DM every enterprise tenant about a
maintenance window").

Two storage options:

1. **`jsonb` array on `organizations`** — e.g. `org.tags = ['enterprise', 'trial']`.
2. **Dedicated `tenant_tags` table** — one row per (org, label) pair.

## Decision

Use a **dedicated `tenant_tags` table**:

```sql
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
```

Each tag attachment is one row. The `UNIQUE (organization_id, label)`
gives idempotent `add` (re-applying the same tag is a no-op rather than
an error) and prevents duplicate badges on the same org.

No separate "tags catalog" table — the set of labels is the `DISTINCT
label FROM tenant_tags`. A label exists if at least one org has it; it
disappears from the filter strip when its last attachment is removed.
This is the simplest design that matches how ops actually thinks about
tags ("'enterprise' is a tag because some tenant is enterprise").

## Why dedicated table over jsonb

- **Filterability.** `WHERE EXISTS (SELECT 1 FROM tenant_tags WHERE
  organization_id = o.id AND label = 'enterprise')` uses
  `tenant_tags_label_idx` and runs in O(matching-rows). The jsonb
  equivalent (`org.tags @> '["enterprise"]'::jsonb`) needs a GIN index
  on the column, and tag-strip aggregation (`SELECT label,
  COUNT(distinct org)`) does not work cleanly on a jsonb array
  without unnest.
- **Bulk attach idempotence.** With a UNIQUE constraint, bulk-add to
  100 orgs handles "already tagged" naturally — `ON CONFLICT DO
  NOTHING`. With jsonb you re-read the array, push the label, dedupe,
  write back — a read-modify-write cycle per row, prone to lost
  updates under concurrent bulk ops.
- **Bulk audit.** One audit row per (org, tag-applied) target is
  trivial from a one-row insert. From jsonb you'd audit the org-row
  UPDATE — once per org but the audit row's "what changed" is opaque
  ("tags went from ['trial'] to ['trial', 'enterprise']").
- **Per-tag metadata.** Color is on the tag row, set by the person who
  first created the tag for an org. Future fields (priority, expiry,
  created-by) attach naturally. jsonb arrays of plain strings can't
  carry metadata.
- **Future global rename.** "Rename 'enterprise' to 'platinum'" with a
  dedicated table is `UPDATE tenant_tags SET label = 'platinum' WHERE
  label = 'enterprise'`. With jsonb it's a sequential rewrite of every
  org row containing the string.

## Why no separate "catalog" table

A `tag_definitions` table (label, color, created_at, ...) and a
`tenant_tag_assignments` junction table would be the textbook
many-to-many design. We rejected it for Plan F.1:

- Most labels are created opportunistically ("add 'high-risk' to this
  one org") — forcing a two-step "create the tag" then "attach it"
  flow is friction for ops.
- The set of distinct labels is small (~tens, not thousands) — the
  cost of `DISTINCT label FROM tenant_tags` is trivial.
- Color is stored on the first-attached row. New attachments inherit
  the existing color (the router's `add` proc looks up an existing
  row with the same label and reuses its color if one exists). Good
  enough; if ops needs to recolor globally, an UPDATE sweeps all rows.

If F.2+ surfaces a tag-catalog UI ("manage tags globally, set color
once, rename label, ..."), promote to a two-table design then.

## Consequences

- New table, new router with 7 procs (list / listForOrg / add / remove
  / bulkAdd / bulkRemove / bulkSuspend), new components (tag-chip,
  tag-filter-strip, bulk-actions-bar).
- `bulkSuspend` is the only proc gated to `super_admin` only — it
  reuses the existing single-org suspend flow per target tenant. The
  100-row cap is enforced by `z.array(uuid).max(100)` at validation
  (HTTP 400 on overflow) and a belt-and-suspenders runtime guard.
- Bulk procs write one audit row per target tenant, matching the
  pattern from `platform-admin-tenants-comms.ts`.
- Tag-filter-strip URL params are managed via TanStack Router — tags
  apply additively (multiple tag filters = orgs that have all of them).

## Alternatives considered

- **jsonb array on `organizations`.** Rejected for the reasons above.
- **Two-table catalog + junction.** Rejected as premature; revisit at
  F.2 if a "manage tags" page lands.
- **No cap on bulk ops.** Rejected: protects audit log throughput and
  Stripe rate limits (the `bulkSuspend` proc fan-outs to Stripe sub
  cancels for each org).
