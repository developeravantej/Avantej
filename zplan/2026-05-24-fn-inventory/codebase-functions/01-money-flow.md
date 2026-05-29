# Domain 01 — Transactions & Money Flow

Audit date: 2026-05-24. Owned files only. Amounts are integer cents.
Router assembly: all tenant routers registered in `packages/api/src/routers/base-router.ts`; server `payments` merged via `packages/api/src/routers/index.ts:28`.

## Routers & Procedures

### pos (`packages/api/src/routers/pos.ts`)
| Procedure | Auth | Purpose | Service fn |
|-----------|------|---------|------------|
| `recordSale` | protected (`pos:create` + branch guard) | Atomic single-tx POS sale (order+payment+invoice+package+installments) | `recordPosSale` |
| `searchCustomers` | protected (`pos:create`) | Member + walk-in customer lookup, RBAC-scoped | `searchPosCustomers` |
| `getReceiptData` | protected (`pos:create`) | Receipt DTO for a sale (joins order/items/payment/invoice/package/installments) | **inline in router** (no service fn) |

### sales-orders (`packages/api/src/routers/sales-orders.ts`)
| Procedure | Auth | Purpose | Service fn |
|-----------|------|---------|------------|
| `list` | protected (`sales:read`) | List sales orders + createdBy/firstItem enrichment | `listSalesOrders` |
| `getById` | protected (`sales:read`) | Single order + createdBy name | `getSalesOrderById` |
| `create` | protected (`sales:create`) | Create sales order | `createSalesOrder` |
| `update` | protected (`sales:update`) | Update sales order | `updateSalesOrder` |
| `cancel` | protected (`sales:delete`) | Cancel order with refund amount + reason category | `cancelSalesOrder` |
| `statusHistory` | protected (`sales:read`) | Cursor-paginated status transition log | `getSalesOrderStatusHistory` |
| `kpiSummary` | protected (`sales:read`) | KPI strip for period | `getSalesOrderKpiSummary` |
| `largestToday` | protected (`sales:read`) | Largest sale today | `getLargestSaleToday` |
| `getLatest` | protected (`sales:read`) | Most recent completed order (POS last-receipt) | `getLatestCompletedSalesOrder` |

### invoices (`packages/api/src/routers/invoices.ts`)
| Procedure | Auth | Purpose | Service fn |
|-----------|------|---------|------------|
| `list` | protected (`payments:read`) | List invoices + createdBy enrichment | `listInvoices` |
| `getById` | protected (`payments:read`) | Single invoice | `getInvoiceById` |
| `create` | protected (`payments:create`) | Create invoice | `createInvoice` |
| `update` | protected (`payments:update`) | Update invoice (status/amounts/eInvoice) | `updateInvoice` |
| `paymentStatusHistory` | protected (`payments:read`) | Cursor-paginated payment-status log (keyed by paymentId) | `getPaymentStatusHistory` (payments.service) |

### installments (`packages/api/src/routers/installments.ts`)
| Procedure | Auth | Purpose | Service fn |
|-----------|------|---------|------------|
| `adjustCredits` | protected (admin only) | Manually adjust unlocked/used credits | `adjustCredits` |
| `confirmPayment` | protected (`service_management:update`) | Confirm an installment payment received | `confirmInstallmentPayment` |
| `listByPackageInstance` | protected (owner OR `service_management:read`) | List installments for a package; auto-locks if overdue on open | `getInstallmentsByPackageInstance` (+ `evaluateAndLockIfOverdue`) |
| `manualUnlock` | protected (admin only) | Admin-override unlock a locked package | `unlockPackage` |
| `processRefund` | protected (admin only) | Refund + cancel remaining installments for a package | `processRefund` (installment.service) |
| `reschedule` | protected (`service_management:update`) | Move an installment due date | `rescheduleInstallment` |
| `waive` | protected (`service_management:update`) | Waive an installment | `waiveInstallment` |
| `resetOverride` | protected (`service_management:update`) | Reset manual credits override | `resetCreditsOverride` |
| `adminOverview` | protected (`service_management:read`) | Admin overview list (status/search/due filters) | `getAdminInstallmentOverview` |
| `getEvents` | protected (`service_management:read`) | Installment event log for a package | **inline query** (installmentEvents) |
| `suggestRefund` | protected (admin only) | Suggested refund amount for a package | `getSuggestedRefund` |
| `setOverdraft` | protected (admin only) | Toggle package overdraft allowance | `setPackageOverdraft` |

### installment-plans (`packages/api/src/routers/installment-plans.ts`)
| Procedure | Auth | Purpose | Service fn |
|-----------|------|---------|------------|
| `list` | protected (client read-open; staff `service_management:read`) | List installment plans | `listInstallmentPlans` |
| `getById` | protected (same) | Plan by id | `getInstallmentPlanById` |
| `getByCode` | protected (same) | Plan by code | `getInstallmentPlanByCode` |
| `create` | protected (`service_management:update`) | Create plan | `createInstallmentPlan` |
| `update` | protected (`service_management:update`) | Update plan | `updateInstallmentPlan` |
| `setDefault` | protected (`service_management:update`) | Set default plan | `setDefaultInstallmentPlan` |
| `deactivate` | protected (`service_management:delete`) | Deactivate plan | `deactivateInstallmentPlan` |

### refunds (`packages/api/src/routers/refunds/` — index merges read+lifecycle+bulk)
| Procedure | Auth | Purpose | Service fn |
|-----------|------|---------|------------|
| `list` | protected (`refund_management:read`) | List refunds, RBAC-scoped | `listRefunds` |
| `getById` | protected (`refund_management:read`) | Single refund | `getRefundById` |
| `request` | protected (`refund_management:create`) | Create pending refund request | `requestRefund` |
| `approve` | protected (`refund_management:approve`) | Approve (optionally partial) a pending refund | `approveRefund` |
| `reject` | protected (`refund_management:approve`) | Reject pending refund (notes required) | `rejectRefund` |
| `process` | protected (`refund_management:process`) | Mark approved refund processed; writes back to payments/sales order | `processRefund` (refunds.service) |
| `createPartial` | protected (`refund_management:create`) | Partial credit refund vs package instance | `createPartialRefund` |
| `bulkApprove` | protected (`refund_management:approve`) | Bulk-approve ≤50 pending refunds (per-row tx) | `bulkApproveRefunds` |

### cancelled-sales (`packages/api/src/routers/cancelled-sales.ts`)
| Procedure | Auth | Purpose | Service fn |
|-----------|------|---------|------------|
| `list` | protected (`sales:read`) | List cancelled sales | `listCancelledSales` |
| `getById` | protected (`sales:read`) | Single cancelled sale | `getCancelledSaleById` |
| `exportCsv` | protected (`sales:read`) | CSV export of cancelled sales | `exportCancelledSalesCsv` |

### payouts (`packages/api/src/routers/payouts.ts`)
| Procedure | Auth | Purpose | Service fn |
|-----------|------|---------|------------|
| `list` | protected (`commission_payout:read`) | List payouts + recipient name enrichment | **inline query** (payouts/appointments/members) |
| `previewBatch` | protected (`commission_payout:read`) | Dry-run batch of approved splits | `previewBatch` |
| `runBatch` | protected (`commission_payout:process`) | Execute payout batch (locks splits, inserts payouts, marks paid) | `runBatch` |
| `recipientSummary` | protected (`commission_payout:read`) | Lifetime payout stats for a recipient | `recipientSummary` |
| `processForRecipient` | protected (`commission_payout:process`) | Single-recipient batch (thin wrapper) | `processForRecipient` |

### payments (server-only — `apps/server/src/routers/payments.ts`)
| Procedure | Auth | Purpose | Service fn |
|-----------|------|---------|------------|
| `createPaymentIntent` | protected | Stripe Direct Charge PI for an appointment | Stripe + `connect-account.service` (out of domain) |
| `sendPaymentLink` | protected | Stripe Payment Link for an appointment | Stripe |
| `getPaymentStatus` | protected | Read appointment payment status fields | inline |
| `refund` | protected | Stripe refund of an appointment charge | Stripe (relies on webhook to flip row) |
| `createSetupIntent` | protected | Card-on-file SetupIntent | `customer-stripe.service` (out of domain) |
| `listSavedCards` | protected | List saved cards for a customer profile | Stripe |
| `chargeSavedCard` | protected | Off-session charge of saved card | Stripe |
| `createSalesOrderPaymentLink` | protected | Payment Link for a POS sale's payment row | Stripe |
| `purchasePackage` | protected | Create pending package + Stripe Payment Link | `createPackageInstance` (out of domain) |

## Service Functions

### packages/services/src/pos.service.ts
- `recordPosSale()` — atomic POS sale creation (order, payment, invoice, package, installment schedule, commission, branch-stats refresh). Exposed via `pos.recordSale`.
- `searchPosCustomers()` — combobox customer search. Exposed via `pos.searchCustomers`.

### packages/services/src/sales-order.service.ts
- `CANCELLATION_REASON_CATEGORIES` (const) / `SALES_ORDER_REFUND_STATUSES` (const) — enum sources reused by router zod schemas.
- `listSalesOrders()` — list with filters. Exposed via `sales-orders.list`.
- `getSalesOrderById()` — single order. Exposed.
- `createSalesOrder()` — create. Exposed.
- `updateSalesOrder()` — update. Exposed.
- `cancelSalesOrder()` — cancel + refund-amount handling. Exposed via `sales-orders.cancel`.
- `getSalesOrderKpiSummary()` — KPI. Exposed.
- `getLargestSaleToday()` — largest sale today. Exposed.
- `getLatestCompletedSalesOrder()` — latest completed. Exposed.
- `getSalesOrderStatusHistory()` — status log. Exposed.

### packages/services/src/invoice.service.ts
- `listInvoices()` — list. Exposed.
- `getInvoiceById()` — single. Exposed.
- `createInvoice()` — create. Exposed.
- `updateInvoice()` — update. Exposed.
  (No `deleteInvoice` / no status-transition helper — see Gaps P2-A.)

### packages/services/src/installment.service.ts
- `DEFAULT_GRACE_PERIOD_DAYS` (const) — default grace days.
- `getGracePeriodDaysForPackage()` — resolve grace days; internal helper used by overdue eval. **ORPHAN (internal-only)** — not router-exposed (expected).
- `calculateCreditsUnlocked()` — pure math; used by `recordPosSale`/`confirmInstallmentPayment`. **ORPHAN (internal-only)**.
- `calculateInstallmentAmounts()` — pure split math. **ORPHAN (internal-only)**.
- `calculateSuggestedRefund()` — pure refund math behind `getSuggestedRefund`. **ORPHAN (internal-only)**.
- `createInstallmentSchedule()` — build schedule rows during sale; called by `recordPosSale`. **ORPHAN (internal-only)**.
- `confirmInstallmentPayment()` — confirm a payment. Exposed via `installments.confirmPayment`.
- `evaluateAndExpireIfOverdue()` — expire package if overdue. **ORPHAN from this domain's routers** — only caller is `appointment.service.ts:311` (check-in path). NOT called by the installment sweep cron (which uses the *lock* variant). See Gap P1-B.
- `evaluateAndLockIfOverdue()` — lock package after grace expiry; called by `installments.listByPackageInstance` (lazy, on open) AND by the daily cron `installment-sweep.service`. Exposed indirectly.
- `unlockPackage()` — admin unlock. Exposed via `installments.manualUnlock`.
- `adjustCredits()` — manual credit adjust. Exposed via `installments.adjustCredits`.
- `processRefund()` — refund + cancel remaining installments. Exposed via `installments.processRefund`.
- `rescheduleInstallment()` — change due date. Exposed via `installments.reschedule`.
- `syncPackagePaymentStatus()` — recompute package payment status. **ORPHAN (internal-only)** — called within confirm/waive paths; no direct procedure.
- `waiveInstallment()` — waive. Exposed via `installments.waive`.
- `resetCreditsOverride()` — reset override. Exposed via `installments.resetOverride`.
- `setPackageOverdraft()` — toggle overdraft. Exposed via `installments.setOverdraft`.
- `getInstallmentsByPackageInstance()` — list. Exposed via `installments.listByPackageInstance`.
- `getAdminInstallmentOverview()` — admin overview. Exposed via `installments.adminOverview`.
- `getSuggestedRefund()` — suggested refund. Exposed via `installments.suggestRefund`.

### packages/services/src/installment-plan.service.ts
- `listInstallmentPlans()` / `getInstallmentPlanById()` / `getInstallmentPlanByCode()` / `createInstallmentPlan()` / `updateInstallmentPlan()` / `setDefaultInstallmentPlan()` / `deactivateInstallmentPlan()` — all exposed by the matching `installment-plans` procedures. (No hard-delete — deactivate only; intentional.)

### packages/services/src/refunds.service.ts
- `computeRemainingRefundable()` — pure cap helper. **ORPHAN (internal-only)**; re-exported from index but never router-called.
- `requestRefund()` — create pending refund. Exposed via `refunds.request`.
- `approveRefund()` — approve. Exposed via `refunds.approve`.
- `rejectRefund()` — reject. Exposed via `refunds.reject`.
- `processRefund()` — process approved refund (writes back; no gateway call). Exposed via `refunds.process`.
- `listRefunds()` — list. Exposed.
- `getRefundById()` — single. Exposed.
- `createPartialRefund()` — package credit refund. Exposed via `refunds.createPartial`.
- `bulkApproveRefunds()` — bulk approve. Exposed via `refunds.bulkApprove`.

### packages/services/src/cancelled-sales.service.ts
- `listCancelledSales()` / `getCancelledSaleById()` / `exportCancelledSalesCsv()` — all exposed by `cancelled-sales` procedures.

### packages/services/src/payouts.service.ts
- `processCommissionReversals()` — batch clawback runner for negative/reversed commission. **ORPHAN** — exported and unit-tested (`apps/server/src/tests/unit/services/payouts.test.ts`) but invoked by **no router and no cron**. Dead/unwired. See Gap P1-A.
- `previewBatch()` — exposed via `payouts.previewBatch`.
- `runBatch()` — exposed via `payouts.runBatch`.
- `recipientSummary()` — exposed via `payouts.recipientSummary`.
- `processForRecipient()` — exposed via `payouts.processForRecipient`.

### packages/services/src/payments.service.ts
- `getPaymentStatusHistory()` — payment status transition log. Exposed via `invoices.paymentStatusHistory`.
  (This is the ONLY function in this file — it does NOT contain the Stripe charge/refund logic, which lives in the server router + `apps/server/src/services/*`.)

### packages/services/src/branch-stats-cache.service.ts
- `refresh()` — fire-and-forget cache invalidation (revenue/members/staff); called by pos/sales-order/member/hierarchy services. **ORPHAN (internal-only)** — correct.
- `refreshNow()` — synchronous recompute of a branch stat. **ORPHAN** — not called by any owned service or router; only the backfill script (`apps/server/scripts/backfill-branch-stats-cache.ts`) does its own inline insert, not via this fn. Likely dead. See Gap P3-A.

## Gaps (prioritized)

### P1 — `processCommissionReversals` is fully unwired (dead code path)  (`packages/services/src/payouts.service.ts:38`)
A complete clawback/reversal batch runner exists (gross/deduction-aware, unit-tested at `apps/server/src/tests/unit/services/payouts.test.ts:284`) but **no router procedure and no cron** ever calls it. The `payouts` router only exposes preview/run/recipientSummary/processForRecipient — none route to reversals. Negative commission (refund-driven clawbacks) therefore can never be paid out/recovered through the API. Either expose a `payouts.processReversals` procedure or wire it into the payout batch flow. Definitely missing.

### P1 — Overdue installment lifecycle: expire-path is orphaned from automation  (`packages/services/src/installment.service.ts:470`, `apps/server/src/services/installment-sweep.service.ts:89`)
Two overdue handlers exist: `evaluateAndLockIfOverdue` (grace → lock) and `evaluateAndExpireIfOverdue` (overdue → expire). The daily cron (`0 2 * * *`) only calls the **lock** variant. `evaluateAndExpireIfOverdue` is invoked solely from `appointment.service.ts:311` (a check-in side effect), so a package with unpaid installments that is never opened/checked-in is **locked but never expired** by automation. Confirm whether expiry is intended to be cron-driven; if so, the sweep is incomplete. Likely a real gap.

### P1 — Refund `cancelled` status is unreachable (lifecycle dead-end)  (`packages/services/src/refunds.service.ts:115`)
`status: "cancelled"` is a valid refund state (declared in `ListRefundsParams`, accepted by `refunds.list`, and excluded from the refund cap) but **no service function or procedure ever transitions a refund to `cancelled`**. `rejectRefund` only sets `rejected`. A pending refund request that should be withdrawn/voided (e.g. customer changed mind, duplicate) has no cancel path — the only exits are approve, reject, or processed. Add a `refunds.cancel` procedure or document that `cancelled` is reserved/unused.

### P1 — App (Stripe) refund flow is disconnected from the refund ledger  (`apps/server/src/routers/payments.ts:411`)
`payments.refund` issues a Stripe refund against an appointment and relies on the `charge.refunded` webhook to flip `appointments.payment_status`. It writes **nothing** to the `refunds` ledger (`refunds.service`). Conversely `refunds.process` explicitly does NOT call any gateway (`lifecycle.procedures.ts:177-180`). Result: two parallel refund systems with no reconciliation — a Stripe-refunded appointment never appears in the refund ledger/reports, and a ledger-processed refund never moves money. No reconciliation job bridges them (the `30 2 * * *` reconciler is Stripe↔control-panel, not ledger). High-impact money-flow gap.

### P2 — Invoices: no delete and no overdue automation  (`packages/services/src/invoice.service.ts`, router `invoices.ts:18`)
The `invoice_status` enum includes `overdue`, but nothing transitions an invoice to `overdue` automatically — there is no cron and no service helper; it can only be set manually via `invoices.update`. There is also no `invoices.delete`/void procedure (only create/update). No automated reconciliation between `payments` rows and `invoices.amountPaid`/`status`. If overdue tracking is a product requirement, it is unimplemented.

### P2 — Cancelled-sales is read-only with no restore/reverse path  (`packages/api/src/routers/cancelled-sales.ts`)
`cancelled-sales` exposes only list/getById/exportCsv. A sale cancelled in error has no un-cancel/restore path in this router (would require going through sales-orders.update status back to a prior state, which `cancelSalesOrder` may not cleanly reverse — refund/cancellation numbers already burned). Possibly intentional (cancellations are terminal), but worth confirming there's an operational correction path.

### P2 — `getReceiptData` and `payouts.list` are heavy inline router logic with no service backing  (`pos.ts:155`, `payouts.ts:26`)
Both procedures hand-roll multi-table joins + cross-DB enrichment directly in the router instead of a service function (unlike every sibling procedure). This is a testability/consistency gap (router-layer DB logic can't be unit-tested at the service boundary, and the project convention is procedures→services). Not broken, but inconsistent and fragile.

### P2 — Catalog drift in the API overview (enumerate from `packages/api/src/routers/`)
The catalog is materially stale vs. the actual owned routers:
- **sales-orders**: catalog lists 6 procedures; actual router has 9 — missing `kpiSummary`, `largestToday`, `getLatest`.
- **installments**: catalog lists only 3 (`adjustCredits`, `confirmPayment`, `processRefund`); actual router has 12 — missing `listByPackageInstance`, `manualUnlock`, `reschedule`, `waive`, `resetOverride`, `adminOverview`, `getEvents`, `suggestRefund`, `setOverdraft`.
- **payouts**: catalog lists only `list`; actual has 5 — missing `previewBatch`, `runBatch`, `recipientSummary`, `processForRecipient`.
- **refunds**: catalog omits `createPartial` and `bulkApprove`.
- **cancelled-sales**: catalog omits `exportCsv`.
- **invoices**: catalog's `paymentStatusHistory` is keyed by `paymentId` (not invoice id) — note the mismatch.
- The server **`payments`** router (9 procedures incl. `refund`, card-on-file, package purchase) is entirely absent from the catalog.

### P3 — Debug `console.log` left in production installment service  (`packages/services/src/installment.service.ts:227,271,281,322,442,508,527,533,539,584,603` and more)
At least 11 `console.log("[installment] …")` statements remain in the hot path (schedule creation, payment confirmation, overdue eval). These run on Cloudflare Workers in production. Noise / minor perf, not a correctness bug.

### P3 — `branch-stats-cache.service.refreshNow()` appears dead  (`packages/services/src/branch-stats-cache.service.ts:70`)
Exported synchronous recompute that no service, router, or script calls (the backfill script does its own inline upsert). Verify and remove or wire if intended as the cron/backfill primitive.

## Notes on "possibly intentional" items
- `installment-plan` deactivate-only (no hard delete), `refunds.process` not calling a gateway (manual reversal model, documented in-code), and the pure `calculate*` helpers being internal are all consistent with documented design — not flagged as gaps.
- `processRefund` exists in BOTH `installment.service` and `refunds.service` with different signatures and purposes (package-credit cancellation vs. ledger processing). Routers import the correct one each; no collision, but the name overlap is a readability trap.
