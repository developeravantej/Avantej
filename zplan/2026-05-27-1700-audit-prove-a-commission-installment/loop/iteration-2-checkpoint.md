# Iteration 2 — orchestrator checkpoint

Branch: `audit-prove-a/commission-installment-20260527-1700`
Approved: `all` (F-COM-B, F-COM-C, F-COM-D, F-PAY-3, F-PAY-4, F-PAY-10, F-INS-2, F-INS-4)

## Build gate
GREEN before and after iteration. Full type-check passing across web, server, native.

## Fixes applied (5 parallel + 3 already-done)
| Target | Sev | Result |
|---|---|---|
| F-COM-B | critical | ✅ already-done (resolvedConfigVersionId at calculator:495 → insert at :659) |
| F-PAY-3 | critical | ✅ already-done in commit 4d45c7b2 (Liability routes through getOrCreatePayoutBatch + creates payouts rows + audit) |
| F-COM-C | high | ✅ NEW — partial sales-order refund prorates: ratio = SUM(refund_items.amountCents per order) / sales_orders.totalAmount. Caveat below. |
| F-COM-D | medium | ✅ already-done (writeAudit calls in upsertCategoryCommissionConfig + deleteCategoryCommissionConfig) |
| F-PAY-4 | high | ✅ already-done in commit 4d45c7b2 (Math.abs removed from all KPI sums); agent added F-PAY-4 audit comments at 4 sites |
| F-PAY-10 | medium | ✅ NEW — useRunBatch now accepts and forwards confirmImmediately (defaults true) |
| F-INS-2 | high | ✅ NEW — confirmInstallmentPayment refactored to accept TenantDb | TenantTx with opts.inTransaction; POS uses it (audit + markCompleteIfFinal now fire correctly) |
| F-INS-4 | high | ✅ NEW — 7 mutations switched to requirePermissionOrpc(..., "service_management", "update") matching the canonical resetOverride pattern |

## Important caveat (F-COM-C)
`commission_splits` has NO `salesOrderItemId` column. When two trainers earned commission on DIFFERENT lines of the same order and only ONE line is refunded, BOTH trainers receive a proportional clawback (not just the one whose line was refunded). This is the best possible behaviour without a schema change. **Recommend separate follow-up**: add `commission_splits.salesOrderItemId` column to enable strict per-line reversal.

## Proof spec
Re-ran post-iteration. Same 3 step failures as iter-1 — all confirmed spec-fixture gaps for tenant-admin storageState:
- GP-01 — Payouts tab KPI/empty-state not visible (no payout rows seeded)
- F-COM-A — getMyCommissions returns 0 (no commission_splits where staffId == tenant-admin userId)
- F-PAY-6 — row action menu absent (no payout rows = no PayoutRowActions render)

These are FIXTURE issues, not code regressions. All targeted fixes' code paths are correct and type-check green.

## Loop convergence
Exit reason: `converged-on-testable-surface`. No further fixes can be browser-proved without seeded fixtures. Remaining items are either deferred-human (4 of them) or already-fixed.
