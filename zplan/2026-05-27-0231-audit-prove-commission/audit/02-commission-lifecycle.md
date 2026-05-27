# Domain 02-commission-lifecycle — Commission Lifecycle

## Endpoints / Procedures

### packages/api/src/routers/commission-splits/index.ts
Aggregator only — re-exports the four sub-procedure objects:
`read.procedures`, `lifecycle.procedures`, `analytics.procedures`, `review.procedures`.
No procedures defined here.

### packages/api/src/routers/commission-splits/lifecycle.procedures.ts
| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `approve` (L21) | tenant + perm `commission_management:approve` | Bulk-approve up to 100 pending splits (single staff, ≤31-day window) | `approveCommissionSplits` |
| `markPaid` (L50) | tenant + perm `commission_management:process` | Bulk-mark approved splits paid, optional FK `payoutId` | `markCommissionSplitsPaid` |
| `void` (L83, exported as `void`) | tenant + perm `commission_management:approve` | Void one split with reason | `voidCommissionSplit` |
| `createManualAdjustment` (L118) | tenant + perm `commission_payout:create` | Create manual bonus/clawback split (auto-routes to `pending_review` ≥ RM 500) | `createManualAdjustment` |
| `markPaidBatch` (L159) | tenant + perm `commission_payout:update` | Batch-mark approved splits paid by memberIds + `earnedAt` window | `markPaidBatch` |
| `markPaidById` (L199) | tenant + perm `commission_management:process` | Mark up to 50 IDs paid with a `paymentReference` string | `markCommissionSplitsPaid` |
| `voidById` (L238) | tenant + perm `commission_management:approve` | Void single split by ID (duplicate of `void`) | `voidCommissionSplit` |

### packages/api/src/routers/commission-splits/review.procedures.ts
| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `listPendingReview` (L17) | tenant + perm `commission_management:read` | Paginated list of `pending_review` splits | `listPendingReview` |
| `resolveReview` (L47) | tenant + perm `commission_review:resolve` | Promote `pending_review`→`pending` (approve) or `pending_review`→`void` (reject) | `resolvePendingReview` |

## Logic Functions

### packages/services/src/refunds.service.ts
- `computeRemainingRefundable()` (L189) — pure helper: max(0, total − alreadyRefunded). Used internally only; **exported but no external callers found** [ORPHAN].
- `requestRefund()` (L336) — insert pending refund row + items + audit. Called by `refunds/lifecycle.procedures.ts`.
- `approveRefund()` (L539) — lock + approve refund (full/partial) + chain `reverseForRefund` + flip `salesOrders.refundStatus='pending'`. Called by `refunds/lifecycle.procedures.ts` and `bulkApproveRefunds`.
- `rejectRefund()` (L680) — set status='rejected'. Called by `refunds/lifecycle.procedures.ts`.
- `processRefund()` (L760) — settle refund: update `payments.refundAmount`, `salesOrders.cancelledAmount`/`refundStatus`, `packageInstances.paymentStatus`, write audit. Called by `refunds/lifecycle.procedures.ts` and `installments.ts`.
- `listRefunds()` (L994) — paginated list with sales-order-number join + name enrichment. Called by `refunds/read.procedures.ts`.
- `getRefundById()` (L1142) — fetch one. Called by `refunds/read.procedures.ts`.
- `createPartialRefund()` (L1190) — request a per-credit partial refund against a package instance. Called by `refunds/bulk.procedures.ts`.
- `bulkApproveRefunds()` (L1356) — sequential per-row independent TX wrapper around `approveRefund`. Called by `refunds/bulk.procedures.ts`.

### apps/server/src/services/payment-side-effects.service.ts
- `onAppointmentPaid()` (L68) — appointment payment post-processing: pending→confirmed, status-history row, best-effort receipt email. Called from `apps/server/src/routes/webhooks.routes.ts:633`.
- `formatMoney()` (L57) — private helper.
- `resolveCustomerEmail()` (L169) — private helper (member or walk-in lookup).
- `sendPaymentReceiptEmail()` (L220) — private helper, invoked from `onAppointmentPaid`.
- `escapeHtml()` (L272) — private helper.

NOTE on commission: file's own header (L17-19) admits "Commission ledger entry (Phase 3b)" is deferred. `onAppointmentPaid` does **not** create commission splits when an appointment is paid through Stripe Connect — the commission ledger entry that the file documents as a side effect is **missing**.

### apps/server/src/services/reconciler.service.ts
- `runReconciliation()` (L68) — Stripe-vs-ledger drift scan per `org_country_stripe_accounts` for `charge`, `refund`, `application_fee`. Called by cron `30 2 * * *` in `apps/server/src/index.ts:432` AND by `platformAdminPayments.runReconciliationNow` in `apps/server/src/routers/platform-admin-payments.ts:296`.
- `reconcileResource()` (L151) — private per-resource scan + drift insert + checkpoint advance.
- `computeDrift()` (L262) — private severity classifier.
- `fetchStripeResource()` (L323) — private Stripe paginator.

No commission lifecycle code in `reconciler.service.ts` — it operates on Stripe charges/refunds vs `platform_payment_ledger`, never touches `commission_splits` or `commission_split_reversals`.

---

## Gaps (prioritized P1/P2/...)

### P1 — `createManualAdjustment` produces rows that violate DB CHECK constraint (packages/services/src/commission-splits.service.ts:1246-1261) [status: partial | testable: true]
The handler inserts a `commission_splits` row with `appointmentId` and `salesOrderId` both **possibly null** (both parameters are optional in `lifecycle.procedures.ts:124-127`). Migration `0033` (or `0024`) installed CHECK `commission_splits_must_target_one` (tenant-migrations.generated.ts:2635-2640) that requires **exactly one** of `appointment_id`/`sales_order_id`/`package_instance_id` to be non-null. A pure manual adjustment (e.g. "bonus to staff X") has none of the three set and is rejected at the DB layer with constraint violation. The condition is documented in `e2e/payouts-confirm-creates-row.journey.spec.ts:13-17` and `zplan/test-coverage-audit-20260527.md:190` and `.playwright/reports/latest-run.md:62`. The procedure itself has no DB-side validation of the target XOR rule before insert, so the failure surfaces as a raw Postgres error, not BAD_REQUEST. **Reproduce:** call `client.commissionSplits.createManualAdjustment({ staffId, amountCents: 10_000, note: "bonus" })` without `salesOrderId`/`appointmentId`. Expect 500/CONFLICT.
persistence: { tenant: org_id, table: commission_splits, where: { staffId, splitType: 'manual' }, expect: { (NEVER INSERTED — CHECK violation) } }

### P1 — `markPaidById.paymentReference` is silently discarded (lifecycle.procedures.ts:199-231) [status: partial | testable: true]
The procedure documents (L194-198) that it stores `paymentReference` for audit. The handler explicitly passes `payoutId: undefined` (L218) with the comment "paymentReference is a reference string, not a UUID FK". Nothing else in the path writes the reference: `markCommissionSplitsPaid` (commission-splits.service.ts:725) accepts only `payoutId` and writes only `payoutId` to the row (L753) and into the audit `changes` payload (L771). The user-supplied `paymentReference` is dropped on the floor. The audit row therefore claims the split was paid but does not record which external transfer/cheque it was reconciled against — the very gap the procedure was added to close.
persistence: { tenant: org_id, table: commission_splits, where: { id }, expect: { status: 'paid', paidAt: now, payoutId: null } }
persistence: { tenant: org_id, table: audit_log, where: { entityId: split.id, action: 'commission.mark_paid' }, expect: { changes.payoutId: null, changes.paymentReference: MISSING } }

### P1 — Refund→commission reversal does NOT void the split or revert payouts (refunds.service.ts:644 + commission-splits.service.ts:1775) [status: partial | testable: true]
On `approveRefund`, the code calls `reverseForRefund` which inserts negative-amount rows into `commission_split_reversals`. However:
1. The source `commission_splits.status` is **left unchanged** (`approved`/`paid`/`pending`) — so listLedger and `liabilityByStaff` still count the original positive amount toward the liability (commission-splits.service.ts:1317 only filters `ne(status,'void')`, not subtracted reversals).
2. If the split was already `paid` and tied to a `payoutId`, no payout adjustment / clawback row is created. The schema has `commission_split_reversals.payout_adjustment_id` (tenant-migrations.generated.ts:2721) but `reverseForRefund` (L1933-1939) never populates it.
3. There is no caller that aggregates `commission_split_reversals.amountCents` into liability — `liabilityByStaff` (L1309) and `liabilitySummary` (L958) read only `commission_splits.calculatedAmount`, so reversed money still shows as owed.

Result: refunding a sale that already paid a commission produces a reversal row that is invisible to the payout system. The "reverse on refund" feature is half-wired.
persistence: { tenant: org_id, table: commission_split_reversals, where: { refundId }, expect: { amountCents: <negative>, payoutAdjustmentId: null } }
persistence: { tenant: org_id, table: commission_splits, where: { id: reversedSplitId }, expect: { status: UNCHANGED, calculatedAmount: UNCHANGED } }

### P1 — `bulkApproveRefunds` per-row TXs cannot enforce target-level remaining-refundable cap atomically (refunds.service.ts:1356-1394) [status: partial | testable: true]
Each item runs through `approveRefund` in its **own** transaction (intentional per docstring), and the cap check in `approveRefund` (L584-607) reads `computeRemainingBySalesOrder` which counts `inArray(status,['pending','approved','processed'])`. Two refunds against the same sales order, each within remaining cap individually but exceeding it in sum, can both be approved if `bulkApproveRefunds` enters the cap check before either has committed. Even sequentially executed (the for-loop at L1375), the cap check at item N+1 only sees committed rows from item N — so the loop is safe for itself but **two concurrent `bulkApproveRefunds` calls or a single call interleaved with `approveRefund`** can double-approve. No advisory lock or row lock on the parent `sales_orders` row exists in `approveRefund`.
persistence: { tenant: org_id, table: refunds, where: { salesOrderId }, expect: { SUM(amountCents) WHERE status IN ('approved','processed') ≤ salesOrders.totalAmount } — currently violated under concurrency }

### P2 — Two redundant void endpoints with identical behaviour (lifecycle.procedures.ts:83 vs L238) [status: implemented | testable: false]
`voidSplit` (exported as `void`) and `voidByIdProcedure` (exported as `voidById`) both take `{id, reason}` and both call `voidCommissionSplit` with the same actor. The only difference is the comment "§1.11" on `voidById`. Either deprecate one or rename for clarity. Low-risk but creates surface duplication.

### P2 — `approveCommissionSplits` MIXED_BATCH_STAFF + spreadDays guard is enforced AFTER the FOR-UPDATE lock (commission-splits.service.ts:668-683) [status: implemented | testable: true]
Guards are inside the TX after `select ... for update`, so they fire correctly. **However**, the 31-day spread test uses `(latest - earliest) / 86_400_000 > 31` which counts millisecond-precision days. A batch spanning a calendar period that crosses DST/leap boundaries may differ from operator expectation. Low priority but worth a unit test asserting exactly 31 days inclusive is accepted.

### P2 — `markPaidBatch` has no idempotency or duplicate-call guard (commission-splits.service.ts:1160-1213) [status: implemented | testable: true]
The single UPDATE filters by `status='approved'` so a second call is a no-op for already-paid rows. Safe. But the function does NOT take a `paymentReference` or `payoutId`, so two batch-pay calls in the same period produce two `commission.batch_paid` audit rows pointing at the same set of splits with no reconciliation key. No way to tell which physical payroll run the splits were paid in.
persistence: { tenant: org_id, table: commission_splits, where: { staffId IN memberIds, earnedAt BETWEEN [from, to], status: 'approved' }, expect: { status: 'paid', payoutId: NEVER SET, paidAt: now } }

### P2 — `listPendingReview` scope check uses correlated sub-selects on every row (commission-splits.service.ts:2007-2019) [status: implemented | testable: false]
The `(SELECT branch_id FROM appointments WHERE id = ...)` patterns inside `inArray` will not use any index when the planner can't push down — performance concern only on tenants with high pending_review counts. Not a correctness gap.

### P2 — `resolvePendingReview` reject path duplicates void audit + adds review_rejected audit (commission-splits.service.ts:2156-2186) [status: implemented | testable: true]
Inlining the void writes is intentional (plan.md cites atomicity). But the two audit rows (`commission.void` + `commission.review_rejected`) for one transition could be misread as two separate events in downstream reports. Documented in the planning artifacts but not in the function docstring. Confusing, not broken.

### P3 — `voidCommissionSplit` accepts already-`void` row as idempotent but emits no audit (commission-splits.service.ts:803-805) [status: implemented | testable: true]
The idempotency `return existing` is a silent no-op. If an operator re-runs the action, the audit log shows nothing — they have no way to confirm "I clicked again". Minor traceability gap.

### P3 — `processRefund` doesn't trigger commission reversal — only `approveRefund` does (refunds.service.ts:644 vs L760) [status: missing | testable: true]
The reversal is chained at **approve** time, not **process** time. If a refund is approved and then processed days later, the commission is reversed at approval — but if the operator rejects/cancels the refund after approve, the reversal sits orphan because there is no inverse of `reverseForRefund` (no "un-reverse" function exists in the file). **There is no path that flips an `approved` refund back to `pending` either**, so the orphan reversal is permanent. Status `cancelled` exists in `ListRefundsParams` (refunds.service.ts:110-117) but no function ever sets `status='cancelled'` — it's a state listed but unreachable.
persistence: { tenant: org_id, table: refunds, where: { status: 'cancelled' }, expect: { ROWS_EXIST: false — no producer } }

### P3 — Cron-driven `runReconciliation` ALERT-ONLY: surfaces drift but never auto-remediates (reconciler.service.ts:11-12, 38) [status: implemented | testable: true]
Documented behaviour ("Policy v1: ALERT-ONLY. No auto-fix.") — partial by design. Missing: no automatic ticket / no Sentry pipe-out / no SLA on `critical` drift backlog. `paymentDriftLog.severity='critical'` rows can accumulate forever with no escalation. Not strictly a Commission Lifecycle gap, but the reconciler is the only safety net for missed Stripe→commission events, and that net is purely informational.

### P3 — `onAppointmentPaid` documents but does NOT create commission split (payment-side-effects.service.ts:17-19) [status: missing | testable: true]
The header marks "Commission ledger entry (Phase 3b)" deferred. Stripe Connect payments for appointments never write a `commission_splits` row from this path. Commission creation happens elsewhere (in `appointment.service.ts` completion path and `pos.service.ts` POS path), but Stripe-paid-appointment is missing.
persistence: { tenant: org_id, table: commission_splits, where: { appointmentId }, expect: { ROWS_EXIST: false — Stripe-paid appointments never trigger commission_create } }

### P3 — `approveCommissionSplits` ID cap 100 vs `markPaidById` ID cap 50 — inconsistent (lifecycle.procedures.ts:26 vs L203) [status: implemented | testable: false]
No protection against the inconsistency; doc-only. Decide one limit.

### P3 — No "dispute" or auto-approve-after-N-days lifecycle automation [status: missing | testable: false]
State machine documented in task brief (pending → review → approved → paid; cancelled/void/disputed) lacks:
- No "dispute" status anywhere in commission_splits enum (read.procedures.ts:101 lists only `pending|approved|paid|void`); review.procedures.ts adds `pending_review`. Disputes are unmodeled.
- No cron that auto-approves stale `pending_review` rows after N days. Operator must manually resolve every adjustment.
- No reminder dispatch (notification-dispatch.service.ts has no commission-review reminder template).

---

## Summary
- Procedures audited: 9 lifecycle/review + 2 read aggregators.
- Logic functions: 9 in refunds.service, 1 (+helpers) in payment-side-effects.service, 1 (+helpers) in reconciler.service.
- Findings: 14 total. P1: 4, P2: 4, P3: 6.
- Testable=true: 11.
