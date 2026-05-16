# ADR 0031 — Revenue Rollup Approach (MRR / ARR / Cohort)

Date: 2026-05-17
Status: Accepted

## Context

Plan F.2 surfaces a `/dashboard/platform-admin/revenue` page for Avantej
platform ops: MRR/ARR KPIs, recent-churn list, cohort retention grid.
Source data:

- `subscriptions` — one row per tenant sub (Stripe-synced via webhook).
  Has `tier` (basic/professional/enterprise), `status`, `canceledAt`,
  `createdAt`, etc. NO unit price column (Stripe is the price source of
  truth).
- `organizations` — one row per tenant. Has `createdAt` for cohort
  bucketing, `subscriptionId → subscriptions.id` link.
- `platform_payment_ledger` — payment history. Plan F.2 does not read
  this directly (deferred to F.3 billing depth).

Three open questions:

1. **MRR/ARR source.** Stripe live API vs. `subscriptions` table + a
   local TIER_PRICES constant?
2. **Cohort retention query shape.** Single SQL with `generate_series`
   + lateral joins, or N+1 in JS over months?
3. **Caching.** Real-time per-render, or memoized with a TTL?

## Decision

### MRR/ARR: local `TIER_PRICES_USD_CENTS` × active/trialing sub counts

We added `TIER_PRICES_USD_CENTS` in `packages/types/src/tiers.ts`
(Agent P, F.2-prep). The aggregator sums tier prices across subs where
`status ∈ {active, trialing}`. ARR = MRR × 12.

```ts
mrr = sum(getTierPriceUsdCents(sub.tier)) for sub in activeOrTrialing
arr = mrr × 12
```

**Why not Stripe live API:**
- Network call per render = ~hundreds of ms latency. Mission-control
  + revenue page both want sub-second response.
- Stripe rate limits — at any non-trivial tenant count, surfacing
  every render to Stripe is fragile.
- Stripe data is authoritative for **billing** (what we charge);
  TIER_PRICES is sufficient for **display** (what ops sees).

**Caveat:** TIER_PRICES values shipped are placeholders ($49 / $199 /
$499 monthly). Real values land when wired to Stripe Dashboard. UI
labels MRR/ARR with "(estimate)" sub-text to make the placeholder
nature visible to ops.

**`estimateAvailable: true`** in the return shape — the formula is now
wired even though the input numbers are placeholders. Once real prices
land, no schema or API change is needed.

### Cohort retention: single SQL window + JS aggregation

```sql
SELECT
  organizations.id      AS org_id,
  organizations.created_at AS org_created_at,
  subscriptions.canceled_at AS sub_canceled_at
FROM organizations
LEFT JOIN subscriptions
  ON subscriptions.id = organizations.subscription_id
WHERE organizations.created_at >= <oldest cohort month>
```

One query, then aggregate in JS:

- Group orgs by `monthKey(createdAt)` → cohort buckets.
- For each cohort C, for each month-index k from 0 to (current month -
  C):
  - `retained[k]` = count of orgs in C whose sub is either null,
    uncancelled, or cancelled-after-bucket-start.

This is one round-trip + O(orgs × months) JS work. For our tenant
count (~tens to low hundreds), JS aggregation is trivially fast.

**Why not generate_series + lateral SQL:**
- Harder to get semantics right ("retained at month k = sub not yet
  cancelled by start of month C+k" is easy in JS, fiddly in SQL with
  `generate_series` + interval arithmetic).
- Drizzle's SQL builder is awkward for `generate_series` — would
  require `sql\`\`` template literals + manual type casting.
- The invariant `retained[0] === cohortSize` is enforced in JS at
  build-time of the matrix — clearer than a SQL constraint.

**Why not N+1 in JS:**
- ≤24 round-trips per call for max `monthsBack=24`. Each round-trip
  is ~10ms over local network. Total ~240ms which competes with the
  single-query path but for less code clarity.

If tenant counts grow past ~1k orgs, revisit — the single query
becomes the dominant cost and may need `WHERE created_at` index
optimization (the column is already indexed).

### Caching: real-time, no cache

Aggregator runs per-render. No memoization, no TTL cache. Same call
pattern as mission-control (`platformAdminDashboard.getOverview`).

**Why:**
- Latency is fine: KPI query is ~3 parallel Drizzle SELECTs, total
  tens of ms.
- Cache invalidation is harder than the latency we'd save. With
  real-time, ops never sees a stale MRR.
- TanStack Query on the client has its own `staleTime: 0` + manual
  refetch behavior; we don't want server-side cache layering on top.

If revenue page becomes a hot path (e.g. embedded in a screen that
auto-refreshes every 5s), add `@orpc/server` middleware-level cache
then. Not before.

## Consequences

- New router `platformAdminRevenue` at top-level namespace (NOT under
  `platformAdminTenants` — revenue is org-wide rollup, not
  tenant-scoped).
- Three procs (`getKpis`, `getCohortRetention`, `getRecentChurn`) —
  all read-only, all platform-admin-gated, no audit rows (no
  mutations).
- ChurnWaterfall component decomposes net MRR delta into separate
  `newMrrLast30dCents` + `churnedMrrLast30dCents` for visual clarity;
  router returns both as discrete fields.
- Cohort grid sorts newest-first (most recent cohort at top — that's
  the actionable one for "who's churning soon").
- TIER_PRICES_USD_CENTS values are PLACEHOLDERS until Stripe wiring.
  ADR-0031 follow-up: confirm with Stripe Dashboard and update
  `packages/types/src/tiers.ts`. No code change required beyond the
  constant — every call site reads from the same source.

## Alternatives considered

- **Stripe live API for MRR/ARR.** Rejected for latency + rate
  limits + because Stripe doesn't store ARR — we'd compute it anyway.
- **Per-tenant MRR table.** Rejected: redundant with
  `subscriptions.tier` + `TIER_PRICES`. Adds write-path cost
  (denormalized cache) for marginal read-path gain.
- **Materialized view for cohort retention.** Rejected at F.2 ship —
  query is cheap enough live. Revisit at >1k tenants.
- **Pre-computed daily revenue snapshots.** Rejected: same trade-off
  as cohort materialized view. Revisit if scale demands.

## Open follow-ups

- Replace placeholder TIER_PRICES values with real Stripe prices
  (`packages/types/src/tiers.ts` TODO line). Done as part of F.3
  billing depth or earlier if ops needs accurate MRR.
- F.3 will likely add real billing event history (refunds, coupons,
  tier changes mid-period). When that lands, revenue page should
  consume the ledger directly for "actual revenue this month" vs.
  "scheduled MRR".
- Currency: today we assume USD across all tiers. Multi-currency
  support requires either a `currency` column on `subscriptions`
  (already exists, default 'usd') being respected by the formula or
  a per-tenant FX rate lookup. Defer.
