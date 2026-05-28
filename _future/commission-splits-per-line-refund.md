# commission_splits.salesOrderItemId — strict per-line refund reversal

## Problem

A partial refund of a single POS line currently triggers a **proportional clawback against every commission split on the entire sales order**, not just the line that was refunded.

Concrete failure mode: Trainer A earns commission on Line 1 (personal training package), Trainer B earns commission on Line 2 (merchandise). The customer refunds only Line 2. Today, both Trainer A *and* Trainer B receive a proportional clawback. Trainer A is unfairly clawed back for a refund that has nothing to do with their service.

Root cause: `commission_splits` has no `salesOrderItemId` foreign key. `reverseForRefund` can only see "this split is linked to sales_order X" — it cannot tell which line of X the split belongs to. The current implementation in `packages/services/src/commission-splits.service.ts:reverseForRefund` (committed `2b8c88ec`) computes a proportional ratio `refundAmountCents / salesOrderTotalCents` and applies it across every split linked to the order. This is the best behaviour possible given the current schema; the code comment explicitly documents the gap.

This was flagged as a follow-up in:
- `zplan/2026-05-27-1700-audit-prove-a-commission-installment/REPORT.md` §F-COM-C caveat
- `zplan/2026-05-27-1700-audit-prove-a-commission-installment/loop/iteration-2-checkpoint.md` "Important caveat"

## Why deferred

1. **Tenant schema migration** — requires authoring an idempotent SQL file under `packages/db/src/migrations/tenant/`, regenerating `packages/db/src/generated/tenant-migrations.generated.ts`, and verifying `bun verify:migrations`. The migration is rolled out per-tenant at request time, so it must be safe to re-run on partially-migrated tenants.
2. **Backfill strategy needed** for existing splits — every commission_splits row in production today has `salesOrderItemId = NULL`. Backfilling requires walking `sales_orders.items` and matching by category (the rule that produced the split) — non-trivial and best-effort. Decision needed: backfill at all, leave NULL and treat as "legacy proportional", or require a manual reconciliation run per tenant.
3. **Touches the commission calculator** — `_buildSplits` in `commission-calculator.service.ts` must learn which `salesOrderItemId` is currently being processed when it inserts each split. The current call sites pass `salesOrderId` only; this is a parameter-plumbing change that ripples through `pos.service.ts` (POS recordSale) and any other entry that calls into the calculator.
4. **Touches the reversal path** — `reverseForRefund` switches from proportional to FK-scoped. Edge cases: refund-line maps to multiple splits (multi-trainer on same line via slotIndex), legacy split with NULL `salesOrderItemId` (must still apply proportional fallback for these), partial reversal of a single line.
5. **Test coverage** — needs integration tests for: multi-trainer multi-line orders, partial line refund, legacy NULL-fk fallback, full-order refund still equivalent to old behaviour.

Estimated effort: **3–5 days** for the schema + calculator + reversal path + integration tests + tenant rollout.

## Scope

**Schema:**
- New tenant migration: `packages/db/src/migrations/tenant/NNNN_commission_splits_sales_order_item_id.sql`
  - `ALTER TABLE commission_splits ADD COLUMN IF NOT EXISTS sales_order_item_id uuid NULL`
  - `CREATE INDEX IF NOT EXISTS commission_splits_sales_order_item_idx ON commission_splits(sales_order_item_id)`
  - FK to `sales_order_items(id)` — only if `sales_order_items.id` has a UNIQUE constraint (not just a unique index). If not, leave as plain `uuid NULL` with no FK constraint (project policy on cross-table refs without unique constraints).
- Drizzle schema update: `packages/db/src/schema/tenant/commission-splits.ts` — add the column + index.
- Regenerate `packages/db/src/generated/tenant-migrations.generated.ts` via `bun gen:migrations`.

**Backend services:**
- `packages/services/src/commission-calculator.service.ts`
  - `_buildSplits` (or whichever helper does the insert at ~line 659) accepts and stores `salesOrderItemId` per split when the trigger is a POS line.
  - The caller — `apps/server/src/services/pos.service.ts:recordSale` — passes the matched `salesOrderItemId` for each line into the calculator. POS already has the line ID at the point of split generation.
- `packages/services/src/commission-splits.service.ts`
  - `reverseForRefund` (currently ~line 1947) switches to: if `refund.lineItems[].salesOrderItemId` is provided, reverse only the splits whose `salesOrderItemId` matches. If the refund payload supplies `salesOrderItemId` and a split has `salesOrderItemId IS NULL` (legacy), fall back to proportional within that subset. Document the legacy fallback in a code comment.

**Migration script (one-shot, per-tenant):**
- `apps/server/scripts/backfill-commission-splits-sales-order-item-id.ts` — walks each tenant, joins `commission_splits → sales_orders → sales_order_items`, attempts to match by category. Surfaces unmatched splits as a CSV for manual review. Run manually per-tenant before flipping reverseForRefund's behaviour to FK-strict.

**Tests:**
- `apps/server/src/tests/integration/refund-line-scoping.integration.test.ts` — new integration test covering: (a) multi-trainer multi-line order, only one line refunded → only that line's trainer gets clawback; (b) legacy NULL-fk split + line refund → proportional fallback applied; (c) full-order refund regression — total clawback equals total commission.

**Code comment cleanup:**
- Remove the "per-line reversal awaits a `salesOrderItemId` FK" comment in `commission-splits.service.ts:reverseForRefund` once the strict path is the default.

## Out of scope

- **Backfilling all historical splits** — backfill is best-effort + manual-review. Tenants choose whether to run the script; the code path handles NULL-fk legacy splits via proportional fallback indefinitely.
- **UI for explaining proportional vs. per-line in the Refunds dialog** — the cashier flow does not surface this distinction; it's an internal accounting concern.
- **Changing reversal accounting for non-POS refunds** — appointment-driven splits already have `appointmentId`, not affected by this change.
- **Reworking how `sales_order_items` are identified at split-creation time** — assumes the line ID is available where the calculator runs (POS already has it; other entry paths may need a small refactor but should not become a blocker).

## Acceptance criteria

1. Tenant migration applied to dev DB; `bun verify:migrations` exits 0.
2. A new POS sale generates `commission_splits` rows with non-NULL `salesOrderItemId`.
3. Refunding one line of a two-line, two-trainer order produces a `commission_split_reversals` row only for the trainer on the refunded line. The other trainer's split remains untouched.
4. Refunding the only line / the entire order produces total-clawback equivalent to the current behaviour (regression test).
5. Existing splits with `salesOrderItemId IS NULL` fall back to proportional reversal with a logged note. No exceptions thrown.
6. New integration test covers all 3 cases (per-line, legacy-fallback, full-refund regression) and passes.
7. `bun check-types --force` clean across the monorepo.
8. Code comment in `reverseForRefund` updated to reflect the new strict-then-fallback behaviour.

## Reference

- Per-line FK gap first surfaced in: `zplan/2026-05-27-1700-audit-prove-a-commission-installment/audit/D-commission-engine.md` (F-COM-C)
- Proportional fix landed in: commit `2b8c88ec fix(audit-prove-a): commission + installment remediation across both iterations`
- Iteration-2 checkpoint flagged the schema follow-up: `zplan/2026-05-27-1700-audit-prove-a-commission-installment/loop/iteration-2-checkpoint.md`
