# Plan F — Control-Panel Ops UX Expansion

**Status:** Scoped, ready for F.1 kickoff
**Branch (when started):** `plan-f-ops-ux` off `tenant-management` tip
**Estimated effort:** ~21h focused work (~4 phases × ~5d each)
**Author:** Scoped 2026-05-16 (post Plan E)

## What Plan F is

The **operational UX layer** on top of Plan E's tenant-management surface.
Plan E shipped the data + admin actions; Plan F sharpens how Avantej ops
*finds*, *cross-cuts*, and *operates* tenants at the speed of a real
mid-stage SaaS team. Same persona, denser tooling.

## Why now

Plan E gives ops every action they need but assumes they already know
which tenant to drill into. Plan F adds:

1. **Discovery** — ⌘K from any id → tenant. Notes for soft-state.
2. **Segmentation** — tags + bulk ops = ship one DM to "all MY enterprise tenants".
3. **Intelligence** — health score + risk flags surface *who to call*.
4. **Revenue lens** — MRR/ARR/churn dashboard for exec/board.
5. **Billing depth** — refunds, coupons, tier-change without leaving the app.
6. **Operational depth** — renewals calendar, webhook log, migration runner.

Without Plan F, ops still navigates by URL guess + Stripe Dashboard.

## Primary persona

**Avantej platform ops** (super_admin / support / billing roles). Same
persona as Plan C + E. No tenant-facing surface (per ADR-0022).

## Locked design decisions (confirm via /grill-me per phase as needed)

| Decision | Recommended choice | Reasoning |
|----------|--------------------|-----------|
| ⌘K backend | id-prefix matching + ILIKE on name/slug/email | No full-text infra; ~all real ops queries fit prefix+substring |
| ⌘K scope | Admin paths only | Avoid tenant-side hotkey collision |
| Notes storage | Dedicated `tenant_notes` table | Append-only audit, indexable; jsonb on org limits query |
| Notes edit window | 1h edit-own, then frozen | Audit integrity vs ergonomics balance |
| Tags storage | Dedicated `tenant_tags` table, unique (org, label) | Searchable, filterable, soft-deletable |
| Bulk op size cap | 100 rows | Above = paginate; protects audit log + Stripe rate limits |
| Bulk op audit | One row per target tenant | Mass operation visible per-tenant in audit log |
| Health score storage | Columns on `tenant_usage_snapshots` | Reuses E.2 cron + table; no new write path |
| Health backfill | None — cron writes forward | Pragmatic; trend appears in 30d |
| Risk flags shape | jsonb array on snapshot | Flexible without schema churn |
| Mission control caching | Real-time, no cache | One aggregator proc with parallel counts; tens of ms |
| Revenue MRR source | `subscriptions.tier × seat_count × tier_price` | Stripe-side rounding follows; close enough for ops view |
| Coupon mechanism | Stripe `coupon` + `customer.balance_transaction` | Existing E.3 issueCredit pattern + Stripe Promotions |

## Phase breakdown

Ordering: F.1 ships discovery + notes + tags (foundation). F.2 builds
revenue + segmentation on top. F.3 deepens billing. F.4 finishes
operational tooling. F.5 docs.

| # | Phase | What | Est | Deps |
|---|-------|------|-----|------|
| **F.1** | Quick wins | ⌘K cross-tenant search + Notes tab + Tags & bulk ops on `/tenants` list. (Stretch) mission-control home + health score + Risk tab. | 5d | Plan E shipped |
| **F.2** | Revenue + segmentation | `/revenue` MRR/ARR/churn page + cohort retention + `/comms` outbox + template library + bulk DM/announcement composer. | 5d | F.1 (tags filter) |
| **F.3** | Billing depth | Billing tab on drill-in (invoice history, refund, payment method) + `/billing` global page + tier change mid-period + coupons. | 5d | F.2 (revenue schema) |
| **F.4** | Operational depth | `/renewals` 90-day calendar + `/health` scoreboard + `/webhooks` log + `/migrations` runner + Members & Feature-flags tabs. | 5d | F.3 |
| **F.5** | ADRs + runbook | ADR-0027 (scope), 0028 (health-score formula), 0029 (tags-as-table), 0030 (revenue rollup) + runbook. | 1d | F.1-F.4 |

## New schemas (control-panel) — F.1 only

```sql
-- F.1 — Notes
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

-- F.1 — Tags
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

-- F.1 stretch — health score + risk flags on existing snapshot table
ALTER TABLE tenant_usage_snapshots
  ADD COLUMN IF NOT EXISTS health_score integer,
  ADD COLUMN IF NOT EXISTS risk_flags jsonb;
```

## Schema additions for F.2-F.4 (deferred to phase kickoff)

- F.2: no new tables — derived views over `platform_payment_ledger` + `subscriptions`.
- F.3: `tenant_billing_events` (refund/coupon history mirror; optional — can use Stripe API live).
- F.4: no new tables — surfaces existing `processed_webhook_events` + `tenant_usage_snapshots`.

## Reserved migration slots

- `0026_tenant_notes.sql` (F.1, Agent N)
- `0027_tenant_tags.sql` (F.1, Agent T)
- `0028_health_score_on_snapshots.sql` (F.1 stretch, Agent H)
- `0029_*` (F.3 billing — TBD at phase kickoff)
- `0030_*` (F.4 ops — TBD at phase kickoff)

## ADRs to author

- **ADR-0027 — Plan F scope** (platform-admin-only; self-serve still deferred to Plan G)
- **ADR-0028 — Health-score formula** (5-factor composite, daily recompute, no backfill)
- **ADR-0029 — Tenant tags as table not jsonb** (queryability + bulk ops)
- **ADR-0030 — Revenue rollup approach** (live Stripe vs control-panel ledger source-of-truth)

## Recommended commit sequence (per phase, via `/ship`)

Each phase = one `/ship` invocation = one PR. Within phase = parallel agents
per the DAG that `/ship` builds.

1. `feat(plan-f): F.1 quick wins — search + notes + tags + bulk`
2. `feat(plan-f): F.2 revenue + segmentation`
3. `feat(plan-f): F.3 billing depth`
4. `feat(plan-f): F.4 operational depth`
5. `docs(plan-f): F.5 ADRs 0027-0030 + runbook`

## What's NOT in Plan F (defer to Plan G+)

- Tenant self-serve management (own-sub cancel, own-data export, own-audit) — ADR-0022
- Self-serve tenant signup w/ KYC
- Cross-tenant analytics for Avantej growth (Mixpanel-style)
- Referral / affiliate program
- Hard quota enforcement (TIER_LIMITS soft)
- Per-tenant Neon region migration
- In-app dispute response UI
- Slack alerts (still email-only)

## Open questions

Locked tentatively above; revisit via `/grill-me` per phase as needed.

## When to start

**Now.** Plan E shipped + `/ship` pipeline installed globally. F.1 is the
first `/ship` real-world test.

Branch: `plan-f-ops-ux` off `tenant-management` tip.

Kickoff via `/ship` — handles its own DAG, parallel agents, e2e+video,
draft PR. User runs `/ultrareview` + merge manually.

## F.1 locked scope (for first /ship invocation)

**Must-have (3):**
1. ⌘K cross-tenant search palette
2. Notes tab on tenant drill-in
3. Tags + bulk ops on `/tenants` list

**Stretch (2 — skip for first /ship run):**
4. `/dashboard/platform-admin` mission-control home
5. Health score + Risk tab

Run F.1 stretch as F.1.5 patch after F.1 lands cleanly.
