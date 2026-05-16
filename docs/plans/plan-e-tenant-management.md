# Plan E — Tenant Management & Platform Operations

**Status:** Scoped, kickoff in progress
**Branch (when started):** `tenant-management` (off `payment-integrity` tip)
**Estimated effort:** ~47h focused work (~1.5 weeks)
**Author:** Scoped 2026-05-16 (after Plan C shipped, Plan D deferred)

## What Plan E is

The **platform-admin surface for managing tenants** as first-class entities.
Plan C shipped the payment-integrity admin UI. Plan E ships the broader
"manage all our tenants" admin UI — usage metrics, lifecycle ops, activation
funnel, audit, communications, provisioning, deletion.

Distinct from Plan D (customer-facing + recurring revenue) — Plan E is
Avantej-internal.

## Why now

Plan B + C made payments production-safe. To **operate the SaaS at scale**,
Avantej ops needs:

1. Cross-tenant visibility — see all tenants, status, tier, usage.
2. Lifecycle control — suspend, resume, cancel, re-trial, change tier.
3. Activation funnel — see where new tenants get stuck before payment.
4. Audit trail — every admin action is reviewable.
5. Provisioning — replace ad-hoc tenant creation w/ a UI flow.
6. Deletion / GDPR — soft delete + 30-day restore + hard delete sweeper.

Without Plan E, Avantej ops scales linearly with tenant count and DB queries.

## Primary persona

**Avantej platform ops.** Same persona as Plan C, different surface — Plan C
is payment-specific, Plan E is the rest of the tenant relationship.

## Locked design decisions (proposed — confirm via /grill-me before each phase)

| Decision | Recommended choice | Reasoning |
|----------|--------------------|-----------|
| Usage metrics cadence | Daily snapshots via cron | Real-time billing-usage feed is overkill for current scale; daily is enough for trend visibility + over-limit detection |
| Suspend semantics | Block charges AND block app login (read-only mode) | Half-suspend is confusing for tenant + their customers; clean cut is operationally simpler |
| Tenant owner comms | Email + in-app notification + admin audit row | Triple-delivery same as Plan C dispute pattern |
| Provisioning wizard | Admin-driven only for v1 (no self-serve signup yet) | Self-serve needs more guardrails (fraud, vetting, KYC); admin-mediated covers MVP |
| GDPR export format | JSON dump per tenant DB table → ZIP | Re-import path possible; CSV-per-table is auditor-friendly but heavier |
| Usage cross-DB fan-out | Sequential workers with concurrency=5 per cron run | Parallel-by-default risks N×Neon connections at scale; sequential is bounded |
| Tier change mid-period | Prorate via Stripe (`proration_behavior: "create_prorations"`) | Stripe-native, no DIY math |

## Phase breakdown

Ordering: E.1 ships the foundation (list + drill-in shell). E.2-E.5 add tabs
+ data layers. E.6-E.8 are parallelizable once E.1 lands.

| # | Phase | What | Est | Deps |
|---|-------|------|-----|------|
| **E.1** | Tenant list + drill-in foundation | `/platform-admin/tenants` page (searchable table) + `/platform-admin/tenants/$id` drill-in (Overview tab w/ org metadata, owner, Connect rollup from Phase 4, subscription state, last activity). Backend procs: `listTenants` + `getTenantDetail`. | 6h | none |
| **E.2** | Tenant usage metrics | New `tenant_usage_snapshots` control-panel table. Daily cron writes snapshots (cross-DB fan-out, concurrency=5). Drill-in "Usage" tab shows trend charts + tier-limit overlay. | 8h | E.1 |
| **E.3** | Tenant lifecycle ops | Drill-in actions: Suspend / Resume / Force-cancel / Issue credit / Re-trial. Each writes `admin_session_actions` audit row. Suspend = block charges + read-only app login (middleware update). | 6h | E.1 |
| **E.4** | Activation funnel view | Drill-in "Funnel" tab: milestone checklist (email verified → hierarchy seeded → first member → first customer → GHL connected → first appointment → first payment). Cross-tenant KPI on Overview top. | 5h | E.1, E.2 (for cross-DB queries) |
| **E.5** | Tenant communications | Direct-message owner (email + tenant in-app notification + audit row). Broadcast via existing `announcements` table. | 4h | E.1 |
| **E.6** | Admin audit log UI | `/platform-admin/audit` page over existing `admin_session_actions` + `admin_sessions` tables. Filterable by admin/action/target/date. | 4h | (E.3+E.5 generate audit rows; can ship parallel) |
| **E.7** | Tenant provisioning wizard | `/platform-admin/tenants/new` flow: name + slug + country + owner email → spins up Neon project + seeds RBAC + sends owner invite. Reuses `migrate-existing-tenant.ts` + Neon API. | 8h | E.1 (returns to list) |
| **E.8** | Tenant data export / GDPR | "Export all data" → background job → email admin a ZIP. "Delete tenant" → 30-day soft delete w/ restore, hard-delete cron sweeper. | 6h | E.3 (lifecycle plumbing) |

## New schemas (control-panel)

```sql
-- E.2
CREATE TABLE tenant_usage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  customer_count integer NOT NULL DEFAULT 0,
  appt_count_30d integer NOT NULL DEFAULT 0,
  sales_total_30d_minor integer NOT NULL DEFAULT 0,
  sales_currency text NOT NULL DEFAULT 'MYR',
  storage_bytes bigint NOT NULL DEFAULT 0,
  ghl_active boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  UNIQUE (organization_id, snapshot_date)
);
CREATE INDEX tenant_usage_snapshots_org_idx ON tenant_usage_snapshots (organization_id, snapshot_date DESC);

-- E.8
CREATE TABLE tenant_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_at timestamp DEFAULT now(),
  requested_by text NOT NULL,           -- platform admin user id
  hard_delete_after timestamp NOT NULL, -- requested_at + 30d
  restored_at timestamp,
  hard_deleted_at timestamp,
  export_url text                       -- R2 URL when export job completes
);
CREATE INDEX tenant_deletions_hard_after_idx ON tenant_deletions (hard_delete_after)
  WHERE hard_deleted_at IS NULL AND restored_at IS NULL;
```

## Cron additions

```jsonc
"triggers": {
  "crons": [
    "0 * * * *",     // existing Plan C C.1
    "30 2 * * *",    // existing Plan C C.5
    "0 9 * * *",     // existing Plan C C.6
    "0 1 * * *",     // NEW E.2 daily tenant usage snapshot at 01:00 UTC
    "0 3 * * *"      // NEW E.8 hard-delete sweeper at 03:00 UTC
  ]
}
```

## ADRs to author

- **ADR-0022 — Tenant management surface scope** (platform-admin-only; tenant-side self-serve admin defers to Plan F)
- **ADR-0023 — Tenant usage snapshots** (daily cron, cross-DB fan-out, concurrency=5)
- **ADR-0024 — Tenant lifecycle state machine** (trial → active → past_due → suspended → cancelled → deleted; suspend = read-only app + no charges)
- **ADR-0025 — Activation funnel milestone definitions** (7 milestones, computed from existing tables, no new persistence)
- **ADR-0026 — Tenant deletion + GDPR workflow** (30-day soft + hard delete, JSON ZIP export)

## Recommended commit sequence

1. `feat(plan-e): tenant list + drill-in foundation (E.1)`
2. `feat(plan-e): tenant usage snapshots + drill-in tab (E.2 + ADR-0023)`
3. `feat(plan-e): tenant lifecycle ops + ADR-0024 (E.3)`
4. `feat(plan-e): activation funnel view (E.4 + ADR-0025)`
5. `feat(plan-e): tenant communications (E.5)`
6. `feat(plan-e): admin audit log UI (E.6)`
7. `feat(plan-e): tenant provisioning wizard (E.7)`
8. `feat(plan-e): tenant data export + GDPR delete (E.8 + ADR-0026)`
9. `docs(plan-e): runbook + ADR-0022 scope`

## What's NOT in Plan E (defer to Plan F+)

- Tenant self-service lifecycle (cancel own subscription, change own tier)
- Cross-tenant analytics for Avantej's own growth (Mixpanel-style)
- Tenant onboarding email drip campaigns
- Referral / affiliate program
- Per-tenant feature flags
- Tenant migration between Neon regions
- Hard quota enforcement (current TIER_LIMITS is soft)
- Self-serve tenant signup w/ KYC

## Open questions

Locked tentatively above; revisit via /grill-me per phase as needed.

## When to start

**Now.** Plan B + C are stable; payment-integrity is a clean base. Plan D
deferred per user. Plan E unblocks Avantej's operational scaling.

Branch: `tenant-management` off `payment-integrity` tip.

Implementing E.1 (tenant list + drill-in foundation) in this session.
