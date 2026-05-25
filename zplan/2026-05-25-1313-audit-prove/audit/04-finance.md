# Domain: Finance

Audit date: 2026-05-25
Auditor: subagent (Finance domain)
Conventions: amounts in integer cents; tax rates in basis points; cross-DB user refs as plain text; soft-delete via isActive boolean; withTimezone: true on timestamps.

---

## Endpoints / Procedures

### packages/api/src/routers/payouts.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | tenantProcedure + commission_payout:read | List payouts with status/recipient filter; enriches recipientName from control-panel | inline DB query + controlPanelDb enrich |
| `previewBatch` | tenantProcedure + commission_payout:read | Dry-run batch preview — no writes | `previewBatch()` in payouts.service |
| `runBatch` | tenantProcedure + commission_payout:process | Execute payout batch; marks splits paid inside TX | `runBatch()` in payouts.service |
| `recipientSummary` | tenantProcedure + commission_payout:read | Lifetime stats for one recipient | `recipientSummary()` in payouts.service |
| `processForRecipient` | tenantProcedure + commission_payout:process | Single-recipient batch (thin wrapper) | `processForRecipient()` in payouts.service |

Missing: no `cancel` / `void` payout procedure; no `markFailed` or `markProcessing` transition.

---

### packages/api/src/routers/refunds/read.procedures.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | tenantProcedure + refund_management:read | Paginated refund list with status/customer/date filters | `listRefunds()` in refunds.service |
| `getById` | tenantProcedure + refund_management:read | Single refund fetch | `getRefundById()` in refunds.service |

---

### packages/api/src/routers/refunds/lifecycle.procedures.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `request` | tenantProcedure + refund_management:create | Create pending refund; auto-pulls customer/branch from target | `requestRefund()` |
| `approve` | tenantProcedure + refund_management:approve | Approve (full or partial) — triggers commission reversal inside TX | `approveRefund()` |
| `reject` | tenantProcedure + refund_management:approve | Reject pending refund; requires reviewNotes | `rejectRefund()` |
| `process` | tenantProcedure + refund_management:process | Mark approved → processed; writes back to sales_orders/payments | `processRefund()` |

Missing: no `cancel` procedure — `cancelled` is a valid status in the enum and the read filter, but there is no endpoint to transition a refund into `cancelled`. This is a lifecycle dead-end.

---

### packages/api/src/routers/refunds/bulk.procedures.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `createPartial` | tenantProcedure + refund_management:create | Credit-based partial refund against a package instance | `createPartialRefund()` |
| `bulkApprove` | tenantProcedure + refund_management:approve | Approve up to 50 refunds; independent per-row TXs | `bulkApproveRefunds()` |

---

### packages/api/src/routers/commission-splits/read.procedures.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | tenantProcedure + commission_management:read | Basic commission split list (legacy) | `listCommissionSplits()` |
| `getByAppointment` | tenantProcedure + commission_management:read | Splits for a specific appointment | `getCommissionsByAppointment()` |
| `getMyCommissions` | tenantProcedure + commission_management:read | Caller's own splits with totals | `getMyCommissions()` |
| `listLedger` | tenantProcedure + commission_management:read | Enriched ledger with status/staff/branch filter + control-panel name hydration | `listCommissionLedger()` |

---

### packages/api/src/routers/commission-splits/lifecycle.procedures.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `approve` | tenantProcedure + commission_management:approve | Bulk-approve pending splits | `approveCommissionSplits()` |
| `markPaid` | tenantProcedure + commission_management:process | Mark splits paid, optional payoutId link | `markCommissionSplitsPaid()` |
| `void` | tenantProcedure + commission_management:approve | Void one split | `voidCommissionSplit()` |
| `createManualAdjustment` | tenantProcedure + commission_payout:create | Create manual adjustment split | `createManualAdjustment()` |
| `markPaidBatch` | tenantProcedure + commission_payout:update | Batch-mark paid by member IDs + date range | `markPaidBatch()` |
| `markPaidById` | tenantProcedure + commission_management:process | Batch ≤50 by IDs + paymentReference | `markCommissionSplitsPaid()` |
| `voidById` | tenantProcedure + commission_management:approve | Void single split by ID | `voidCommissionSplit()` |

Note: `markPaidById` accepts a `paymentReference` string but the field is silently dropped — it passes `payoutId: undefined` to `markCommissionSplitsPaid`, so the reference is never persisted. (lifecycle.procedures.ts:219)

---

### packages/api/src/routers/commission-splits/analytics.procedures.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `liabilitySummary` | tenantProcedure + (commission_management:read OR commission_payout:read) | Aggregate liability for a date range | `liabilitySummary()` |
| `liabilityByStaff` | tenantProcedure + commission_management:read | Per-staff pending/approved/paid totals | `liabilityByStaff()` |

---

### packages/api/src/routers/commission-splits/review.procedures.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `listPendingReview` | tenantProcedure + commission_management:read | Cursor-paginated `pending_review` splits | `listPendingReview()` |
| `resolveReview` | tenantProcedure + commission_review:resolve | Promote `pending_review` → `pending` (approve) or `void` (reject) | `resolvePendingReview()` |

---

### packages/api/src/routers/tax-rates.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | tenantProcedure; clients: none; staff: tax_configuration:read | List all tax rates (active/category filter) | `listTaxRates()` |
| `getById` | tenantProcedure (same auth as list) | Fetch single tax rate | `getTaxRateById()` |
| `getDefault` | tenantProcedure (same auth as list) | Fetch the default active tax rate | `getDefaultTaxRate()` |
| `create` | tenantProcedure + tax_configuration:create | Insert new rate; single-tx default swap | `createTaxRate()` |
| `update` | tenantProcedure + tax_configuration:update | Patch mutable fields (not isDefault via this route) | `updateTaxRate()` |
| `setDefault` | tenantProcedure + tax_configuration:update | Swap default flag atomically; writes audit | `setDefaultTaxRate()` |
| `deactivate` | tenantProcedure + tax_configuration:delete | Soft-delete; silently clears isDefault | `deactivateTaxRate()` |

---

### packages/api/src/routers/installment-plans.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | clients: none; staff: service_management:read | List installment plans | `listInstallmentPlans()` |
| `getById` | (same) | Fetch single plan | `getInstallmentPlanById()` |
| `getByCode` | (same) | Fetch plan by code string | `getInstallmentPlanByCode()` |
| `create` | service_management:update | Create plan; validates pricePremiumBps range | `createInstallmentPlan()` |
| `update` | service_management:update | Patch plan (code immutable) | `updateInstallmentPlan()` |
| `setDefault` | service_management:update | Swap default flag | `setDefaultInstallmentPlan()` |
| `deactivate` | service_management:delete | Soft-delete | `deactivateInstallmentPlan()` |

---

### packages/api/src/routers/installments.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `confirmPayment` | service_management:update | Mark one installment paid; optionally set next interval | `confirmInstallmentPayment()` |
| `listByPackageInstance` | session + service_management:read (staff) or owner | Fetch installments; triggers lock-if-overdue on load | `getInstallmentsByPackageInstance()` + `evaluateAndLockIfOverdue()` |
| `manualUnlock` | admin role | Override-unlock a package | `unlockPackage()` |
| `processRefund` | admin role | Cancel unpaid installments; marks package refunded | `processRefund()` |
| `adminOverview` | service_management:read | Paginated overview of all installment packages with status filters | `getAdminInstallmentOverview()` |
| `getEvents` | service_management:read | Audit event log for a package instance | direct DB query |
| `suggestRefund` | admin role | Compute suggested refund amount (read-only) | `getSuggestedRefund()` |
| `adjustCredits` | admin role | Manual credit correction | `adjustCredits()` |
| `setOverdraft` | admin role | Enable/disable overdraft mode | `setPackageOverdraft()` |
| `reschedule` | service_management:update | Move a single installment due-date | `rescheduleInstallment()` |
| `waive` | service_management:update | Waive one installment | `waiveInstallment()` |
| `resetOverride` | service_management:update | Clear credits override | `resetCreditsOverride()` |

---

### packages/api/src/routers/expenses.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | expense_management:read | Paginated expense list | `listExpenses()` |
| `getById` | expense_management:read | Single expense | `getExpenseById()` |
| `create` | expense_management:create | Submit new expense (status=pending) | `createExpense()` |
| `approve` | expense_management:update | Pending → approved; records approvedBy | `approveExpense()` |
| `reject` | expense_management:update | Pending → rejected; records rejectionReason | `rejectExpense()` |
| `markPaid` | expense_management:update | Approved → paid; records paidBy | `markExpensePaid()` |

---

### packages/api/src/routers/invoices.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | payments:read | List invoices with optional filters | `listInvoices()` |
| `getById` | payments:read | Single invoice | `getInvoiceById()` |
| `create` | payments:create | Insert invoice | `createInvoice()` |
| `update` | payments:update | Patch invoice | `updateInvoice()` |
| `paymentStatusHistory` | payments:read | Cursor-paginated payment status history | `getPaymentStatusHistory()` |

Missing: no `delete` / `cancel` / `void` invoice procedure; no `sendInvoice` or e-invoice submission webhook.

---

### packages/api/src/routers/category-commission.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `getByCategory` | category_commission_management:read | Fetch commission config for a service category | `getCategoryCommissionConfig()` |
| `upsert` | category_commission_management:create | Create or replace commission config + slots/rates/conditions | `upsertCategoryCommissionConfig()` |
| `delete` | category_commission_management:delete | Delete commission config | `deleteCategoryCommissionConfig()` |

---

### packages/api/src/routers/walk-in-customers.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `list` | none (stub) | Returns empty list — walk-in customers removed | stub |
| `getById` | none | Always throws BAD_REQUEST | deprecated stub |
| `create` | none | Always throws BAD_REQUEST | deprecated stub |
| `update` | none | Always throws BAD_REQUEST | deprecated stub |
| `deactivate` | none | Always throws BAD_REQUEST | deprecated stub |
| `convertToPackage` | walk_in_customer_management:update | Convert walk-in payment to package | `convertWalkInPaymentToPackage()` |

---

### packages/api/src/routers/category-buffer-overrides.ts

| Name | Auth | Purpose | Logic fn |
|---|---|---|---|
| `listForMember` | user_management:read OR service_management:read | List buffer overrides for a member | `listCategoryBufferOverridesForMember()` |
| `upsert` | user_management:update OR service_management:update | Set buffer override for member + service | `upsertCategoryBufferOverride()` |

---

## Logic Functions

### packages/services/src/payouts.service.ts

- `processCommissionReversals(tenantDb, actor)` — Batch-process unlinked commission reversal rows; creates negative payout rows per staff and flips splits to `reversed`. **ORPHAN** — no router calls this function; it is not wired to any endpoint.
- `previewBatch(tenantDb, controlPanelDb, params)` — Read-only preview of qualifying approved splits for a batch window.
- `runBatch(tenantDb, params)` — Execute payout batch in a single TX; marks splits `paid`, inserts payout rows.
- `recipientSummary(tenantDb, recipientId)` — Lifetime stats (lifetime paid, avg per cycle, last payout date).
- `processForRecipient(tenantDb, params)` — Thin wrapper over `runBatch` scoped to a single staff member.

### packages/services/src/refunds.service.ts

- `computeRemainingRefundable(target)` — Pure helper: remaining refundable cents. [exported]
- `requestRefund(tenantDb, input)` — Create pending refund; validates cap; auto-fills customer/branch; inserts audit row.
- `approveRefund(tenantDb, id, params)` — Approve (full or partial); SELECT FOR UPDATE; triggers `reverseForRefund()` atomically.
- `rejectRefund(tenantDb, id, params)` — Reject pending refund; requires reviewNotes.
- `processRefund(tenantDb, id, params)` — Mark approved → processed; writes back to sales_orders/payments/package_instances; appends payment status history.
- `listRefunds(tenantDb, controlPanelDb, params)` — Paginated list with actor name enrichment and salesOrderNumber join.
- `getRefundById(tenantDb, id)` — Single refund fetch.
- `createPartialRefund(tenantDb, params)` — Credit-based partial refund; SELECT FOR UPDATE on package_instances.
- `bulkApproveRefunds(tenantDb, items, actor)` — Approve up to 50 refunds sequentially with independent TXs.
- `generateRefundNumber(tx, date)` — Internal. Generate RF-YYYYMMDD-NNNN refund number.
- `generateCancellationNumber(tx, date)` — Internal. Generate CN-YYYYMMDD-NNNN cancellation number.
- `computeRemainingBySalesOrder(tx, salesOrderId)` — Internal. Remaining refundable for a sales order.
- `computeRemainingByPayment(tx, paymentId)` — Internal. Remaining refundable for a payment.
- `computeRemainingByPackageInstance(tx, packageInstanceId)` — Internal. Remaining refundable for a package instance.

### packages/services/src/commission-splits.service.ts (selected exports)

- `listCommissionSplits(tenantDb, params)` — Basic paginated list with hierarchy RBAC.
- `getCommissionsByAppointment(tenantDb, appointmentId, opts)` — Splits for one appointment.
- `getMyCommissions(tenantDb, memberId, params)` — Caller's own splits + total.
- `listCommissionLedger(tenantDb, controlPanelDb, params)` — Enriched ledger for UI.
- `approveCommissionSplits(tenantDb, ids, actor)` — Bulk approve pending splits.
- `markCommissionSplitsPaid(tenantDb, ids, opts)` — Mark splits paid; optionally link payoutId.
- `voidCommissionSplit(tenantDb, id, reason, actor)` — Void one split.
- `createManualAdjustment(tenantDb, params)` — Insert manual adjustment split.
- `markPaidBatch(tenantDb, params)` — Batch-mark paid by member IDs + date range.
- `reverseForRefund(tx, refundId, params)` — Called by `approveRefund`; creates commission reversal rows.
- `listPendingReview(tenantDb, controlPanelDb, params)` — Cursor-paginated `pending_review` splits.
- `resolvePendingReview(tenantDb, id, action, reason, actor)` — Transition `pending_review` → `pending` or `void`.
- `liabilitySummary(tenantDb, controlPanelDb, params)` — Aggregate liability totals.
- `liabilityByStaff(tenantDb, controlPanelDb, params)` — Per-staff liability breakdown.

### packages/services/src/tax-rates.service.ts

- `listTaxRates(tenantDb, params)` — List with isActive/category filter.
- `getTaxRateById(tenantDb, id)` — Single fetch.
- `getDefaultTaxRate(tenantDb)` — Fetch default active rate.
- `createTaxRate(tenantDb, data)` — Insert with single-tx default swap. Missing audit row.
- `updateTaxRate(tenantDb, id, data)` — Patch mutable fields. Missing audit row.
- `setDefaultTaxRate(tenantDb, id, actor)` — Atomic default swap; writes audit.
- `deactivateTaxRate(tenantDb, id)` — Soft-delete; silently clears isDefault. Missing audit row.

### packages/services/src/tax.service.ts

- `resolveTaxRate(tenantDb, _branchId, at)` — Resolve the active tax rate at a given timestamp. Called by POS service at checkout. `_branchId` parameter accepted but unused.

### packages/services/src/installment-plan.service.ts

- `listInstallmentPlans(tenantDb, params)` — List with optional activeOnly filter.
- `getInstallmentPlanById(tenantDb, id)` — Single fetch.
- `getInstallmentPlanByCode(tenantDb, code)` — Fetch by code.
- `createInstallmentPlan(tenantDb, data)` — Insert; validates numInstallments ≥ 1, pricePremiumBps 0–10000. Missing audit row.
- `updateInstallmentPlan(tenantDb, id, data)` — Patch (code immutable). Missing audit row.
- `setDefaultInstallmentPlan(tenantDb, id)` — Swap default; no audit row.
- `deactivateInstallmentPlan(tenantDb, id)` — Soft-delete; silently clears isDefault. Missing audit row.

### packages/services/src/expenses.service.ts

- `listExpenses(tenantDb, params)` — Paginated list with branchId/status/submittedBy/date/RBAC filters.
- `getExpenseById(tenantDb, id)` — Single fetch.
- `createExpense(tenantDb, params)` — Insert expense at status=pending. No audit row.
- `approveExpense(tenantDb, id, approvedBy)` — pending → approved. No audit row.
- `rejectExpense(tenantDb, id, _rejectedBy, rejectionReason)` — pending → rejected. `_rejectedBy` parameter is accepted but prefixed with `_` and never persisted to the database — the schema has no `rejected_by` column. No audit row.
- `markExpensePaid(tenantDb, id, paidBy, paymentReference?)` — approved → paid. No audit row.

---

## Gaps (prioritized P1/P2/...)

---

### P1 — `processCommissionReversals` is exported but never called from any router  (packages/services/src/payouts.service.ts:38)  [status: missing | testable: true]

`processCommissionReversals` creates negative payout adjustment rows for unlinked commission split reversals (commissions reversed when a refund is approved). The function exists and is tested, but no API endpoint calls it. As a result:

- Commission reversal rows accumulate with `payoutAdjustmentId IS NULL` indefinitely.
- Clawbacks never surface in the payouts ledger.
- Staff payout summaries are overstated — approved splits are reversed but the negative offset payout is never created.

The lifecycle is: `approveRefund` → `reverseForRefund` (creates `commissionSplitReversals` rows) → **stuck**. There is no endpoint or scheduled job that calls `processCommissionReversals` to turn those reversals into negative payout adjustment rows.

**Fix needed**: expose a `payouts.processReversals` endpoint (or a scheduled job) that calls this function. Until then, commission clawbacks are silently swallowed.

persistence: `{ table: "commission_split_reversals", where: { payoutAdjustmentId: null }, expect: { payoutAdjustmentId: "<non-null uuid>" } }` — this update never happens.

---

### P1 — `markPaidById.paymentReference` is accepted but never persisted  (packages/api/src/routers/commission-splits/lifecycle.procedures.ts:219)  [status: partial | testable: true]

The `markPaidById` procedure documents itself as storing a `paymentReference` string on the split for traceability. However it calls `markCommissionSplitsPaid(context.tenantDb, input.ids, { payoutId: undefined, actor: ... })`. The `paymentReference` is accepted in the input schema but thrown away. The comment explicitly acknowledges "no dedicated column yet" — but because the value is never written anywhere, callers who pass `paymentReference` get silent data loss.

persistence: `{ table: "commission_splits", where: { id: "<any of input.ids>" }, expect: { payoutId: "<some persisted reference>" } }` — payoutId remains null.

---

### P1 — `refunds.cancel` endpoint missing — `cancelled` status is a dead-end  (packages/api/src/routers/refunds/read.procedures.ts:17-19)  [status: missing | testable: true]

The read procedure's status enum includes `"cancelled"` and the list endpoint filter supports it, but there is no lifecycle procedure to transition a refund into `cancelled`. Staff cannot cancel an approved-but-not-yet-processed refund (e.g., customer withdraws the request after approval). Any row that somehow reaches `cancelled` (e.g., via direct DB write or a future migration) is permanently stuck — it can never be reprocessed or un-cancelled.

A `cancel` endpoint should exist for `pending` → `cancelled` and optionally `approved` → `cancelled` transitions.

---

### P1 — `rejectExpense` silently drops `rejectedBy` — no column exists in schema  (packages/services/src/expenses.service.ts:134-136)  [status: partial | testable: true]

`rejectExpense(tenantDb, id, _rejectedBy, rejectionReason)` accepts a `rejectedBy` userId as a required parameter (called with `context.member.userId` from the router), but the parameter is prefixed `_` and is never written to the DB. The `expenses` table has no `rejected_by` column. Auditors cannot determine who rejected an expense.

persistence: `{ table: "expenses", where: { id: "<id>", status: "rejected" }, expect: { rejected_by: "<actor userId>" } }` — column does not exist; value is lost.

---

### P2 — Expense lifecycle: no audit trail for any state transition  (packages/services/src/expenses.service.ts:81-187)  [status: missing | testable: false]

`createExpense`, `approveExpense`, `rejectExpense`, and `markExpensePaid` write no audit rows. Every other financial domain (refunds, commissions, payouts) uses `writeAudit()`. Expenses silently change status with no recoverable history. This is inconsistent and breaks the platform's audit-trail contract.

---

### P2 — Tax rate CRUD missing audit rows for create/update/deactivate  (packages/services/src/tax-rates.service.ts:57-193)  [status: partial | testable: false]

`createTaxRate`, `updateTaxRate`, and `deactivateTaxRate` make no calls to `writeAudit`. Only `setDefaultTaxRate` writes an audit entry. Tax configuration changes (including rate changes that affect all future sales) are untracked in the audit log.

---

### P2 — Installment plan CRUD has zero audit coverage  (packages/services/src/installment-plan.service.ts)  [status: missing | testable: false]

`createInstallmentPlan`, `updateInstallmentPlan`, `setDefaultInstallmentPlan`, and `deactivateInstallmentPlan` write no audit rows. Changing `pricePremiumBps` or `numInstallments` on an active plan affects all future package purchases but leaves no record.

---

### P2 — Payouts: no `cancel`/`void` endpoint; `pending` payouts are stuck  (packages/api/src/routers/payouts.ts)  [status: missing | testable: false]

`runBatch` inserts payout rows with `status: "paid"` immediately — so existing batch payouts cannot get stuck in `pending`. However `processCommissionReversals` inserts adjustment rows with `status: "pending"` and there is no endpoint to cancel or mark them. If a reversal adjustment is incorrect, there is no API path to fix it except a direct DB update.

---

### P2 — `commission_review:resolve` permission is defined but not seeded in any default role  [status: partial | testable: false]

`review.procedures.ts:69` requires `commission_review:resolve`. The permission resource `commission_review` exists in `permission.service.ts:51`. However, there is no evidence from the DB schema or seed data that any default role (admin, staff, client) is granted this permission. If no role has it, the `resolveReview` endpoint is permanently inaccessible without a manual DB grant.

---

### P2 — Installment view page is a redirect stub — no functional UI  (apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx:1-6)  [status: partial | testable: false]

The route at `/dashboard/packages/installments/view` is a tab-redirect shim pointing elsewhere (`makeTabRedirect`). The admin installment overview that `installments.adminOverview` serves has no dedicated rendered page in this route. The comment "LEGACY — slated for rewrite; do not extend" confirms this is known but unresolved.

---

### P2 — Tax rate `_branchId` parameter is accepted but unused in `resolveTaxRate`  (packages/services/src/tax.service.ts:43-44)  [status: partial | testable: false]

`resolveTaxRate(tenantDb, _branchId, at)` documents that per-branch tax rates are planned but the parameter is silently ignored. At POS checkout the branch is always passed (packages/services/src/pos.service.ts:351), so the API behaves correctly today, but the interface is misleading and future callers may incorrectly assume branch-scoped resolution is active.

---

### P3 — Payout UI `processForRecipient` uses hardcoded `paymentMethod: "bank_transfer"` without prompt  (apps/web/src/routes/_authenticated/dashboard/_layout/payouts/view.tsx:344)  [status: partial | testable: false]

In `PerRecipientTab.handleProcessPending()`, the "Process Pending" button fires `processForRecipient.mutate({ ..., paymentMethod: "bank_transfer" })` with no dialog or field for the operator to choose the payment method or add a reference. Operators who pay by cash or check will have the wrong method recorded in the payout row.

---

### P3 — Refund Export button is a no-op  (apps/web/src/routes/_authenticated/dashboard/_layout/refunds/view.tsx:1090-1095)  [status: missing | testable: false]

The refunds list page has an "Export" button that renders as a plain `<button>` with no `onClick` handler or mutation. Clicking it does nothing.

---

### P3 — Installment due-date reminder job is absent  [status: missing | testable: false]

No scheduled job, cron hook, or background task sends overdue/due-soon notifications to customers. `evaluateAndLockIfOverdue` is called on-demand when the installments list is opened, which means a package is only locked when someone happens to view it. Customers with imminent due dates receive no proactive reminder. This was flagged in the plan at `zplan/05-17_20-46_installment-system-completeness/plan/plan.md`.

---

### P3 — `walk-in-customers` router: `list` returns an empty stub, not deprecated  (packages/api/src/routers/walk-in-customers.ts:17)  [status: partial | testable: false]

`list` returns `{ items: [], total: 0 }` with no auth check. It is not a `deprecated()` stub like the other CRUD procedures. Any client that calls `walkInCustomers.list` will silently receive empty results rather than a clear "removed" error, making debugging difficult.

---

## Summary table

| Gap | Status | Testable |
|---|---|---|
| `processCommissionReversals` orphan — clawbacks never surface in payout ledger | missing | true |
| `markPaidById.paymentReference` silently dropped | partial | true |
| `refunds.cancel` endpoint missing — `cancelled` status dead-end | missing | true |
| `rejectExpense` drops `rejectedBy` — no schema column | partial | true |
| Expense lifecycle: zero audit trail | missing | false |
| Tax rate create/update/deactivate: no audit rows | partial | false |
| Installment plan CRUD: no audit rows | missing | false |
| Payouts: no cancel/void endpoint for adjustment rows | missing | false |
| `commission_review:resolve` permission likely ungranted in default roles | partial | false |
| Installment view page is a redirect stub | partial | false |
| `_branchId` in `resolveTaxRate` silently unused | partial | false |
| Payout UI hardcodes `paymentMethod: "bank_transfer"` | partial | false |
| Refund Export button is a no-op | missing | false |
| Installment due-date reminder job absent | missing | false |
| Walk-in list returns empty stub instead of deprecated error | partial | false |

**Testable findings: 4**
