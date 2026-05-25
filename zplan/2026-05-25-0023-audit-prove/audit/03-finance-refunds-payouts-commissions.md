# Domain Finance: Refunds, Payouts, Commissions, Tax, Expenses

Scope: refunds, payouts, commission-splits, category-commission, tax-rates, expenses routers + their backing services and the commission calculator/math.
All procedures are `tenantProcedure` (= protected: session + tenant context + RBAC via `accessibleNodeIds`). Amounts are integer cents. Cross-DB ids (`staffId`, `recipientId`, `submittedBy`, `requestedBy`) are plain `text` = `members.userId`.

Note on api-overview drift: `base-router.ts` registers all six routers (`payouts`, `expenses`, `commissionSplits`, `categoryCommission`, `taxRates`, `refunds`). `zhub/shared/api-overview.md` is STALE for `payouts` (see Gap P2-DOC).

---

## Endpoints / Procedures

### refunds (`packages/api/src/routers/refunds/`)
Aggregated in `index.ts` from read/lifecycle/bulk modules; re-export shim at `refunds.ts`.

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (`refund_management:read`) | List refunds, RBAC by branchId, status/date/customer filters | `listRefunds` (refunds.service) |
| `getById` | protected (`refund_management:read`) | Single refund by id | `getRefundById` |
| `request` | protected (`refund_management:create`) | Create pending refund vs SO/payment/package; caps to remaining-refundable | `requestRefund` |
| `approve` | protected (`refund_management:approve`) | Approve pending (optional partial `approveAmountCents`); chains commission reversal | `approveRefund` → `reverseForRefund` |
| `reject` | protected (`refund_management:approve`) | Reject pending; reviewNotes required | `rejectRefund` |
| `process` | protected (`refund_management:process`) | Mark approved→processed; writes back to SO/payment/package | `processRefund` |
| `createPartial` | protected (`refund_management:create`) | Partial refund by package session credits | `createPartialRefund` |
| `bulkApprove` | protected (`refund_management:approve`) | Approve ≤50, per-row independent tx | `bulkApproveRefunds` |

### payouts (`packages/api/src/routers/payouts.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (`commission_payout:read`) | List payouts w/ recipient-name enrichment + RBAC via appointment branch | inline handler (no service fn) |
| `previewBatch` | protected (`commission_payout:read`) | Preview approved-unpaid splits per staff in range (read-only) | `previewBatch` (payouts.service) |
| `runBatch` | protected (`commission_payout:process`) | Lock approved splits, insert payout/staff, mark splits paid | `runBatch` |
| `recipientSummary` | protected (`commission_payout:read`) | Lifetime paid + avg/cycle for one recipient | `recipientSummary` |
| `processForRecipient` | protected (`commission_payout:process`) | Single-recipient wrapper over runBatch (defaults to month-to-date) | `processForRecipient` |

### commission-splits (`packages/api/src/routers/commission-splits/`)
Aggregated from read/lifecycle/analytics/review modules.

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (`commission_management:read`) | List splits w/ RBAC join | `listCommissionSplits` |
| `getByAppointment` | protected (`commission_management:read`) | Splits for an appointment | `getCommissionsByAppointment` |
| `getMyCommissions` | protected (`commission_management:read`) | Caller's own splits + total | `getMyCommissions` |
| `listLedger` | protected (`commission_management:read`) | Enriched ledger + totals | `listCommissionLedger` |
| `approve` | protected (`commission_management:approve`) | Bulk approve pending (single-staff, ≤31-day batch) | `approveCommissionSplits` |
| `markPaid` | protected (`commission_management:process`) | Bulk mark approved→paid; optional payoutId | `markCommissionSplitsPaid` |
| `void` | protected (`commission_management:approve`) | Void one split (blocks paid) | `voidCommissionSplit` |
| `createManualAdjustment` | protected (`commission_payout:create`) | Manual bonus/clawback; ≥RM500→pending_review | `createManualAdjustment` |
| `markPaidBatch` | protected (`commission_payout:update`) | Mark approved→paid by member+earnedAt range | `markPaidBatch` |
| `markPaidById` | protected (`commission_management:process`) | Mark ≤50 by id + paymentReference | `markCommissionSplitsPaid` (see P2-REF) |
| `voidById` | protected (`commission_management:approve`) | Void one split by id | `voidCommissionSplit` |
| `liabilitySummary` | protected (`commission_management:read` OR `commission_payout:read`) | Aggregate liability for range | `liabilitySummary` |
| `liabilityByStaff` | protected (`commission_management:read`) | Per-staff pending/approved/paid totals | `liabilityByStaff` |
| `listPendingReview` | protected (`commission_management:read`) | pending_review splits, cursor-paginated | `listPendingReview` |
| `resolveReview` | protected (`commission_review:resolve`) | pending_review → pending (approve) or void (reject) | `resolvePendingReview` |

### category-commission (`packages/api/src/routers/category-commission.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `getByCategory` | protected (`category_commission_management:read`) | Read config + slots + rates/conditions | `getCategoryCommissionConfig` |
| `upsert` | protected (`category_commission_management:create`) | Create/replace config (delete+reinsert) | `upsertCategoryCommissionConfig` |
| `delete` | protected (`category_commission_management:delete`) | Delete config for category | `deleteCategoryCommissionConfig` |

### tax-rates (`packages/api/src/routers/tax-rates.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (clients skip; else `tax_configuration:read`) | List rates | `listTaxRates` |
| `getById` | protected (clients skip; else `tax_configuration:read`) | Single rate | `getTaxRateById` |
| `getDefault` | protected (clients skip; else `tax_configuration:read`) | Active default rate | `getDefaultTaxRate` |
| `create` | protected (`tax_configuration:create`) | Create rate; clears prior default if isDefault | `createTaxRate` |
| `update` | protected (`tax_configuration:update`) | Update mutable fields | `updateTaxRate` |
| `setDefault` | protected (`tax_configuration:update`) | Set default (+audit) | `setDefaultTaxRate` |
| `deactivate` | protected (`tax_configuration:delete`) | Soft-deactivate (isActive=false) | `deactivateTaxRate` |

### expenses (`packages/api/src/routers/expenses.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (`expense_management:read`) | List w/ filters + RBAC | `listExpenses` |
| `getById` | protected (`expense_management:read`) | Single expense | `getExpenseById` |
| `create` | protected (`expense_management:create`) | Submit pending expense | `createExpense` |
| `approve` | protected (`expense_management:update`) | pending→approved | `approveExpense` |
| `reject` | protected (`expense_management:update`) | pending→rejected | `rejectExpense` |
| `markPaid` | protected (`expense_management:update`) | approved→paid | `markExpensePaid` |

---

## Logic Functions

### refunds.service.ts
- `computeRemainingRefundable()` — pure cap helper. **ORPHAN in this domain** (only callers are the e2e/test/zplan docs; internal code uses the DB-backed `computeRemainingBy*` instead). Exported but unused by app code.
- `requestRefund()` — create pending refund; auto-derives customer/branch; caps vs remaining.
- `approveRefund()` — approve (full/partial) under FOR UPDATE; flips `sales_orders.refundStatus='pending'`; chains `reverseForRefund`.
- `rejectRefund()` — reject pending.
- `processRefund()` — the critical tx: writes back to sales_orders / payments / package_instances + cancels package instances on full SO refund.
- `listRefunds()` — list + control-panel name enrichment.
- `getRefundById()` — single fetch (returns raw row, no enrichment).
- `createPartialRefund()` — package-credit partial refund; increments creditsUsed.
- `bulkApproveRefunds()` — loop over `approveRefund` (independent tx per row).
- (internal) `computeRemainingBySalesOrder/ByPayment/ByPackageInstance`, `generateRefundNumber`, `generateCancellationNumber`, `formatDateYYYYMMDD`.

### payouts.service.ts
- `processCommissionReversals()` — batch unlinked reversals → negative payout adjustments + flip splits to `reversed`. **ORPHAN**: no production caller anywhere (only `payouts.test.ts` + zplan docs). No router exposes it and no cron/job invokes it. See P1-PAYOUT-REVERSAL.
- `previewBatch()` — read-only batch preview.
- `runBatch()` — execute batch payout (FOR UPDATE; 23505→CONFLICT).
- `recipientSummary()` — lifetime stats.
- `processForRecipient()` — single-recipient runBatch wrapper.

### commission-splits.service.ts
- `listCommissionSplits()`, `getCommissionsByAppointment()`, `getMyCommissions()` — reads.
- `applyCommissionCaps()` — discount opt-out + per-cycle cap (used by createCommissionSplit AND calculator `_buildSplits`).
- `createCommissionSplit()` — single insert w/ comp-order guard + caps + onConflictDoNothing. (Used by pos.service per memory; hot POS path uses calculator instead.)
- `approveCommissionSplits()`, `markCommissionSplitsPaid()`, `voidCommissionSplit()`, `voidCommissionSplitsForSalesOrder()` — lifecycle.
- `createManualAdjustment()` — manual bonus/clawback; ≥RM500 → pending_review.
- `liabilitySummary()`, `liabilityByStaff()`, `listCommissionLedger()` — analytics.
- `getLatestConfigVersionForCategory()` — config-version resolver. Used by `appointment.service` (grep hit) — NOT orphan.
- `getOrCreatePayoutBatch()`, `attachPayoutsToBatch()` — payout-batch helpers. **ORPHAN**: only referenced by `index.ts` re-export + tests/zplan; no app code calls them. `runBatch` (payouts.service) inserts payouts WITHOUT a batch row, so the `payout_batches` table is never populated by the live flow. See P2-BATCH.
- `reverseForRefund()` — refund→reversal chain. Used by refunds.service. NOT orphan.
- `listPendingReview()`, `resolvePendingReview()` — review tab.

### commission-calculator.service.ts
- `calculateCommissionForAppointment()` — appointment completion → splits.
- `calculateCommissionForPos()` — POS sale → splits.
- (internal) `_buildSplits()` — shared engine: slot redistribution, tier/condition rate lookup, caps, direct insert.

### commission-math.ts
- `assertConfigSumIs10000()`, `dedupeBySlotIndex()`, `computeEffectiveWeightages()`, `computeFinalAmountCents()` — pure helpers, used by calculator.

### category-commission.service.ts
- `getCategoryCommissionConfig()`, `upsertCategoryCommissionConfig()` (delete+reinsert in tx), `deleteCategoryCommissionConfig()`.
- (internal) `toHalfOpen()`, `intervalsOverlap()` — condition-overlap validation.

### tax-rates.service.ts
- `listTaxRates()`, `getTaxRateById()`, `getDefaultTaxRate()`, `createTaxRate()`, `updateTaxRate()`, `setDefaultTaxRate()` (audited), `deactivateTaxRate()`.

### expenses.service.ts
- `listExpenses()`, `getExpenseById()`, `createExpense()`, `approveExpense()`, `rejectExpense()`, `markExpensePaid()`. **None write audit; none create a ledger/payout entry.** See P1-EXPENSE-LEDGER + P2-EXPENSE-AUDIT.

---

## Gaps (prioritized)

### P1 — Approved commission reversals never reach a payout (orphan automation)  (`packages/services/src/payouts.service.ts:38`)  [partial | testable:true]
`approveRefund` → `reverseForRefund` inserts `commission_split_reversals` rows with `payoutAdjustmentId = NULL` and (critically) does NOT change the originating `commission_splits.status`. The ONLY function that settles those reversals — `processCommissionReversals()` — is an **orphan**: no router, no job, no service calls it (grep: only `payouts.test.ts` + zplan docs). Consequences:
1. The clawback never produces a negative `payouts` row, so a trainer who was refunded keeps the full commission liability in `liabilityByStaff`/`liabilitySummary` (those query `commission_splits`, which still show `approved`/`pending`).
2. `runBatch`/`processForRecipient` pay out `status='approved'` splits in range — a reversed-but-not-flipped split is still `approved`, so it gets PAID despite the refund. Money leak.
This is a genuine lifecycle dead-end: reversals are created but nothing in the live system consumes them.
persistence: { tenant, table: commission_split_reversals, where: "payoutAdjustmentId IS NULL", expect: "rows accumulate and are never linked to a payout; originating commission_splits.status stays approved/pending" }
Testable via: request+approve a refund against a SO that has an approved split, then call `payouts.runBatch` for that staff/period and observe the reversed split is still paid (or assert `processCommissionReversals` has no invocation path).

### P1 — Expense approval/payment produces no ledger entry and no audit trail  (`packages/services/src/expenses.service.ts:106,160`)  [partial | testable:true]
`approveExpense` and `markExpensePaid` only mutate `expenses.status`/`paidAt`/`paidBy`. Unlike every sibling in this domain (refunds, payouts, commissions, tax setDefault all call `writeAudit`), expenses write ZERO audit rows. There is also no financial side-effect: an approved+paid expense does not create a `payouts` row, GL entry, or any cross-table record — it is a status flag only. For a "submit + approval" finance flow this means paid reimbursements are invisible to payout reconciliation and have no immutable approval record.
persistence: { tenant, table: expenses, where: "id = :id", expect: "status='paid', paidAt set; NO row in audit_logs, NO payouts/ledger row created" }

### P1 — `processRefund` moves no money for card/bank and never restocks product  (`packages/services/src/refunds.service.ts:760`)  [partial | testable:true]
`processRefund` is documented (line 757) and confirmed in code to NOT trigger any gateway for `card_reversal`/`bank_transfer` — operator must reverse manually. Separately, for a refund against a sales order containing physical products, processing updates `sales_orders.cancelledAmount`/status and cancels package instances, but does NOT return stock to inventory (no `products.adjustStock`/stock movement). A fully refunded product sale leaves stock decremented. This is intentional-for-v1 on the gateway side but a real missing side-effect on the stock side (no code path, no TODO acknowledging it).
persistence: { tenant, table: sales_orders, where: "id = :soId", expect: "cancelledAmount/refundStatus updated, status may flip cancelled; product stock NOT incremented in products/stock tables" }

### P2 — `payout_batches` table is dead in the live flow; batch helpers orphaned  (`packages/services/src/commission-splits.service.ts:1647,1694`)  [partial | testable:false]
`runBatch` inserts `payouts` rows with no `batchId` link and never calls `getOrCreatePayoutBatch`. `getOrCreatePayoutBatch`/`attachPayoutsToBatch` have no production caller (grep: tests + re-exports only). The payouts `list` handler surfaces `batchId` (payouts.ts:122) but it will always be null from the batch flow. So batch grouping/reconciliation is half-built: helpers exist, schema exists, nothing wires them. (Reversal adjustments via the orphaned `processCommissionReversals` also don't set batchId.)
persistence: { tenant, table: payout_batches, where: "any", expect: "table remains empty under normal payout operations; payouts.batchId stays NULL" }

### P2 — `markPaidById` ignores its own `paymentReference` input  (`packages/api/src/routers/commission-splits/lifecycle.procedures.ts:200,218`)  [partial | testable:true]
The `markPaidById` procedure accepts a required `paymentReference` (min 1) but discards it: it calls `markCommissionSplitsPaid` with `payoutId: undefined` and never persists the reference anywhere (comment at line 215 admits "no dedicated column yet"). The split is marked paid but the operator-entered payment reference is silently lost — no audit field, no column. Caller believes the reference was recorded.
persistence: { tenant, table: commission_splits, where: "id IN (:ids)", expect: "status='paid', paidBy set; payoutId NULL; paymentReference NOT stored on row or audit changes" }

### P2 — Refund customer/name fallbacks store raw IDs as human-facing names  (`packages/services/src/refunds.service.ts:387,399,1260`)  [partial | testable:true]
For payment- and package-targeted refunds, `customerName` falls back to the customerId / clientId (e.g. `customerName = payment.customerId`, `customerName = instance.clientId ?? "(unknown)"`). `listRefunds` surfaces `customerName` directly to the Refunds page, so these rows render a UUID/userId as the customer name. Functional but a data-quality defect on a finance screen.
persistence: { tenant, table: refunds, where: "paymentId IS NOT NULL OR packageInstanceId IS NOT NULL", expect: "customerName = a raw id string, not a display name" }

### P2 — `voidCommissionSplit` overwrites `notes` with the void reason, destroying calculation context  (`packages/services/src/commission-splits.service.ts:809,883`)  [implemented | testable:true]
Both `voidCommissionSplit` and `voidCommissionSplitsForSalesOrder` set `notes: reason` on void, clobbering any cap/calculation note previously stored in `notes` (e.g. the `applyCommissionCaps` reason). The original context survives only in audit `changes`, not on the row. Minor, but the ledger row loses provenance after a void.
persistence: { tenant, table: commission_splits, where: "id = :id", expect: "status='void', notes replaced by void reason (prior cap note lost)" }

### P2 — Refund target validation skips package/payment co-existence and tax overshoot  (`packages/services/src/refunds.service.ts:340,447`)  [implemented | testable:true]
`requestRefund` requires "at least one" target but does not reject supplying MULTIPLE targets simultaneously (salesOrderId + paymentId + packageInstanceId); it silently uses the first by priority and caps only against that one. `taxAmountCents` is validated `>= 0` but is never included in the remaining-refundable cap check (`amountCents` only) — so `amountCents + taxAmountCents` can exceed the order's total tax-inclusive value. Edge-case correctness gap on the cap.
persistence: { tenant, table: refunds, where: "id = :id", expect: "row inserted with second/third target ids retained but uncapped; taxAmountCents excluded from cap math" }

### P3 — `deactivateTaxRate` silently clears default instead of blocking; non-transactional  (`packages/services/src/tax-rates.service.ts:167`)  [implemented | testable:true]
Deactivating the default tax rate just unsets `isDefault` (no error, per Phase 3 memory note) and leaves the tenant with NO default rate — POS/purchase preview's `getDefaultTaxRate` then returns undefined and the router returns null. There is no auto-promotion of another rate and no warning. Also, unlike `createTaxRate`/`setDefaultTaxRate`, `deactivateTaxRate` and `updateTaxRate` are not wrapped in a transaction and write no audit row (inconsistent with `setDefaultTaxRate` which does audit).
persistence: { tenant, table: tax_rates, where: "isActive=true", expect: "after deactivating the default, zero rows with isDefault=true; getDefaultTaxRate returns undefined" }

### P3 — `upsertCategoryCommissionConfig` is delete+reinsert: breaks existing split config-version anchoring  (`packages/services/src/category-commission.service.ts:153`)  [implemented | testable:false]
`upsert` deletes the existing `categoryCommissionConfigs` row (cascading to slots/rates/conditions) and inserts a fresh one with a NEW id every save. Splits anchored via `configVersionId`/`getLatestConfigVersionForCategory` rely on the immutable `category_commission_config_versions` snapshot (populated by a DB trigger per the comment), so dispute reproduction depends on that trigger firing on every delete+reinsert. If the version trigger is keyed on the config row rather than category, historical anchoring may be lost on re-save. Flagged for verification — not provable from these files alone (trigger lives in a migration outside this domain's owned files).

### P2-DOC — api-overview.md omits 4 of 5 payouts procedures  (`zhub/shared/api-overview.md:331`)  [n/a | testable:false]
The `## payouts` section lists only `list`. The router also exposes `previewBatch`, `runBatch`, `recipientSummary`, `processForRecipient` (all in `payouts.ts`). Doc is stale vs code. (All other domain routers match the overview.)

---

## Status / testability summary
- testable:true findings: P1-PAYOUT-REVERSAL, P1-EXPENSE-LEDGER, P1-REFUND-NO-RESTOCK, P2-MARKPAIDBYID-REF, P2-REFUND-NAMES, P2-VOID-NOTES, P2-REFUND-CAP, P3-TAX-DEFAULT = **8 testable findings**.
- testable:false: P2-BATCH, P3-CONFIG-VERSION, P2-DOC = 3.
- Orphans: `processCommissionReversals` (P1), `getOrCreatePayoutBatch` + `attachPayoutsToBatch` (P2), `computeRemainingRefundable` (exported, unused by app code).
