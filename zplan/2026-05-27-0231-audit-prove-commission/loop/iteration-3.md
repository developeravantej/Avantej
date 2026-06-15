# Iteration 3 — S-cycle-window-alignment (deferred → fixed)

## Target
**F-03 / S-cycle-window-alignment** — `applyCommissionCaps` hardcoded UTC calendar-month bounds for the per-cycle commission cap. Finance teams running non-standard payout periods (e.g. 22nd→22nd semi-monthly) silently over- or under-capped trainers because the cycle window didn't match the payout window.

## Architectural decision
Three storage candidates considered:
- (A) Anchor on `payout_batches` — chicken-and-egg (splits earn before the batch exists at runBatch time).
- (B) Dedicated `commission_cycle_configs` table — chosen.
- (C) `organization_settings` JSON blob — cheapest, but loses type safety and queryability.

**Chose B** for finance-policy governance: typed columns, FK to `hierarchy_nodes`, per-(branch | tenant) policy from day one, queryable for ops rollouts. The "scaling" argument was a wash between B and C — neither bottlenecks reads — so type safety + queryability won.

## Schema
New migration **`0077_commission_cycle_configs.sql`** (idempotent):
- `id uuid PK`, `branch_id uuid REFERENCES hierarchy_nodes(id) ON DELETE CASCADE` (NULL = tenant-wide).
- `cycle_type text NOT NULL` — CHECK enum: `calendar_month | monthly_anchored | semi_monthly | weekly`.
- `anchor_day integer` — CHECK ranges depend on cycle_type (`monthly_anchored` 1–28, `semi_monthly` 1–15, `weekly` 0–6, `calendar_month` NULL).
- Two partial unique indexes: one tenant-wide row + one row per branch.
- `created_at`, `updated_at` (with timezone).

## Service layer
New file `packages/services/src/commission-cycle.service.ts`:
- `resolveCyclePolicy(db, branchId | null)` — single SELECT, prefers branch-specific over tenant-wide via `ORDER BY branch_id IS NULL`. Falls back to `DEFAULT_POLICY` (calendar month) when no row.
- `deriveCycleBounds(policy, earnedAt)` — pure function. Handles all 4 cycle types including year-boundary wrapping for `monthly_anchored`.
- `resolveCycleBoundsForDate(db, branchId, date)` — convenience composition for the cap path.

## Caller refactor
`packages/services/src/commission-splits.service.ts`:
- `getCycleBoundsForDate` (private, hardcoded UTC month) — **removed**.
- `applyCommissionCaps.params` — added optional `branchId?: string | null`. When caller passes it, no extra DB hop. When omitted, the function derives `branchId` from the appointment / sales-order parent in a single SELECT — package-instance-tied splits still fall back to tenant-wide policy.
- The cap query's `[start, end)` bounds now come from `resolveCycleBoundsForDate(tdb, resolvedBranchId, params.earnedAt)`.

## Gate
- `cd packages/services && bun run build` — clean.
- `bunx tsc --noEmit -p packages/services` on the changed files — clean.
- Full `bun run check-types` is red on PRE-EXISTING errors in `apps/server/src/tests/helpers/check-stale.ts` + `payments.integration.test.ts` (unrelated parallel-session work). Confirmed by stashing the cycle-window diff and re-running — same errors persist.

## Runtime proof
File: `packages/services/src/commission-cycle.service.test.ts` — 11 bun-test cases, all pass.

Key assertions:
- `calendar_month` matches legacy UTC behavior.
- `monthly_anchored(22)`: split on May 21 → cycle is **Apr 22 → May 22** (not the calendar May 1–31). The exact defect S-cycle-window-alignment described.
- `monthly_anchored` wraps Dec→Jan correctly.
- `semi_monthly(1)`: first half 1–15, second half 16–end-of-month-into-next.
- `weekly(1)` (Monday): start = most-recent Monday 00:00 UTC, end = +7 days.
- Same-day anchor returns same-day midnight.
- **Explicit regression test** asserts the May-21 split's bounds DIFFER between `calendar_month` and `monthly_anchored(22)` — directly captures the audit's described defect.

```
bun test src/commission-cycle.service.test.ts
 11 pass · 0 fail · 20 expect() calls · 77ms
```

## Status
- S-cycle-window-alignment → **fixed**.
- 3 deferred S-findings remain: stripe-payout-webhooks, partner-stripe-onboarding, payouts-state-machine (next iteration).

## Notes for follow-up
- An admin UI for editing the cycle policy is NOT in this PR (no design lift). The setting is configurable via direct DB insert or future Drizzle Studio session until a route lands.
- Time-zone awareness: the resolver currently uses UTC for all math. A tenant-timezone field on `organizations` could be plumbed later if franchises in different regions need their cycle anchored to local midnight.
