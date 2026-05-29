# Domain POS, Sales & Installments

Audit date: 2026-05-25. Read-only. Repo root `C:\Project\Avantej`.

Scope: `pos.ts`, `sales-orders.ts`, `invoices.ts`, `cancelled-sales.ts`, `installment-plans.ts`, `installments.ts` (routers) + `pos.service.ts`, `sales-order.service.ts`, `invoice.service.ts`, `cancelled-sales.service.ts`, `installment-plan.service.ts`, `installment.service.ts`, `payments.service.ts`, `pricing.service.ts`, `tax.service.ts` (logic).

All procedures use `tenantProcedure` (= protected: session + tenant context). All call `assertOrgContextMatch` then a permission/role gate.

---

## Endpoints / Procedures

### pos.ts (`packages/api/src/routers/pos.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `recordSale` | protected (`pos:create` + `guardInputBranchForContext`) | Atomic in-store sale: order+items+payment+payment_items+invoice+package+installments+commission | `recordPosSale()` |
| `searchCustomers` | protected (`pos:create` + `guardBranchAccessible`) | Customer combobox lookup (members cross-DB; walk-ins) | `searchPosCustomers()` |
| `getReceiptData` | protected (`pos:create`) | Receipt DTO joining order/items/payment/invoice/package/installments | inline handler (no service fn) |

### sales-orders.ts (`packages/api/src/routers/sales-orders.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (`sales:read`) | List orders + enrich createdByName + first line-item desc | `listSalesOrders()` |
| `getById` | protected (`sales:read`) | Single order + createdByName | `getSalesOrderById()` |
| `create` | protected (`sales:create`) | Create bare sales order (header only, no items/payment) | `createSalesOrder()` |
| `update` | protected (`sales:update`) | Update order header / status (+ status history) | `updateSalesOrder()` |
| `cancel` | protected (`sales:delete`) | Cancel order, void commissions, write history + audit | `cancelSalesOrder()` |
| `statusHistory` | protected (`sales:read`) | Cursor-paginated status transition log | `getSalesOrderStatusHistory()` |
| `kpiSummary` | protected (`sales:read`) | Sales KPI strip (period/branch scoped) | `getSalesOrderKpiSummary()` |
| `largestToday` | protected (`sales:read`) | Largest non-cancelled sale today | `getLargestSaleToday()` |
| `getLatest` | protected (`sales:read`) | Most-recent **completed** order for POS "Last Receipt" seed | `getLatestCompletedSalesOrder()` |

NOTE (doc drift): api-overview.md lists only list/getById/create/update/cancel/statusHistory for sales-orders. `kpiSummary`, `largestToday`, `getLatest` are undocumented. See P3-DOC.

### invoices.ts (`packages/api/src/routers/invoices.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (`payments:read`) | List invoices + createdByName, branch-scoped via sales_orders join | `listInvoices()` |
| `getById` | protected (`payments:read`) | Single invoice | `getInvoiceById()` |
| `create` | protected (`payments:create`) | Create invoice | `createInvoice()` |
| `update` | protected (`payments:update`) | Update invoice | `updateInvoice()` |
| `paymentStatusHistory` | protected (`payments:read`) | Cursor-paginated payment status transition log | `getPaymentStatusHistory()` (payments.service.ts) |

NOTE (doc drift): doc names this procedure as keyed on an invoice, but the input is `paymentId` and it queries `payment_status_history`. There is no invoice-level status history. See P3-DOC.

### cancelled-sales.ts (`packages/api/src/routers/cancelled-sales.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (`sales:read`) | List cancelled orders + line items + repeat-offender count | `listCancelledSales()` |
| `getById` | protected (`sales:read`) | Single cancelled sale (scoped) | `getCancelledSaleById()` |
| `exportCsv` | protected (`sales:read`) | Stream CSV export of cancelled sales | `exportCancelledSalesCsv()` |

NOTE (doc drift): api-overview lists only list/getById. `exportCsv` undocumented.

### installment-plans.ts (`packages/api/src/routers/installment-plans.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (clients exempt; else `service_management:read`) | List plans | `listInstallmentPlans()` |
| `getById` | protected (clients exempt; else `service_management:read`) | Plan by id | `getInstallmentPlanById()` |
| `getByCode` | protected (clients exempt; else `service_management:read`) | Plan by code (used at purchase) | `getInstallmentPlanByCode()` |
| `create` | protected (`service_management:update`) | Create plan (validates bps/numInstallments) | `createInstallmentPlan()` |
| `update` | protected (`service_management:update`) | Update plan (code immutable) | `updateInstallmentPlan()` |
| `setDefault` | protected (`service_management:update`) | Set default plan | `setDefaultInstallmentPlan()` |
| `deactivate` | protected (`service_management:delete`) | Soft-deactivate plan | `deactivateInstallmentPlan()` |

### installments.ts (`packages/api/src/routers/installments.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `confirmPayment` | protected (`service_management:update`) | Confirm an installment paid; unlock credits | `confirmInstallmentPayment()` |
| `listByPackageInstance` | protected (owner OR `service_management:read`) | List installments; lazily evaluates overdue on open | `getInstallmentsByPackageInstance()` + `evaluateAndLockIfOverdue()` |
| `manualUnlock` | protected (**admin role only**) | Admin unlock a locked package | `unlockPackage()` |
| `processRefund` | protected (**admin role only**) | Refund package, cancel remaining installments | `processRefund()` |
| `adjustCredits` | protected (**admin role only**) | Admin override creditsUnlocked/used | `adjustCredits()` |
| `reschedule` | protected (`service_management:update`) | Reschedule a pending/overdue installment | `rescheduleInstallment()` |
| `waive` | protected (`service_management:update`) | Waive an installment | `waiveInstallment()` |
| `resetOverride` | protected (`service_management:update`) | Clear admin credit override | `resetCreditsOverride()` |
| `adminOverview` | protected (`service_management:read`) | Paginated installment overview for admin page | `getAdminInstallmentOverview()` |
| `getEvents` | protected (`service_management:read`) | Installment event log for a package | inline (`installmentEvents` query) |
| `suggestRefund` | protected (**admin role only**) | Suggested refund calc | `getSuggestedRefund()` |
| `setOverdraft` | protected (**admin role only**) | Toggle credit overdraft flag | `setPackageOverdraft()` |

NOTE (doc drift): api-overview lists only 3 installments procedures (`adjustCredits`, `confirmPayment`, `processRefund`). 9 others (`listByPackageInstance`, `manualUnlock`, `reschedule`, `waive`, `resetOverride`, `adminOverview`, `getEvents`, `suggestRefund`, `setOverdraft`) are undocumented. See P2-DOC.

---

## Logic Functions

### pos.service.ts
- `recordPosSale()` — orchestrates the entire sale in one tx: validate customer/items, promo, tax, insert order/items/payment/payment_items/invoice/package_instances/installments, auto-confirm installment #1, audit; then per-item product commission + branch-stats refresh. **Contains P1 compile/runtime bug — see below.**
- `searchPosCustomers()` — search active client members (cross-DB name/email/phone) within accessible nodes. NOTE: walk-in search is documented in the docstring but **not implemented** — only members are returned (see P2-WALKIN-SEARCH).

### sales-order.service.ts
- `listSalesOrders()` — paginated, RBAC + filters.
- `getSalesOrderById()` — single header.
- `createSalesOrder()` — bare header insert; uses legacy `count()+1` number generator (race-prone vs POS's atomic sequence — see P3).
- `updateSalesOrder()` — header/status update + status-history append.
- `cancelSalesOrder()` — cancel + void commissions + history + audit + stats refresh.
- `getSalesOrderKpiSummary()` — KPI aggregate. `outstandingCents` is hardcoded `0` (see P2-KPI).
- `getLargestSaleToday()` — largest non-cancelled today.
- `getLatestCompletedSalesOrder()` — latest status='completed' order (+items+paymentMethod). See P1-LIFECYCLE (almost always null for non-Stripe tenants).
- `getSalesOrderStatusHistory()` — cursor query.
- consts `CANCELLATION_REASON_CATEGORIES`, `SALES_ORDER_REFUND_STATUSES`.

### invoice.service.ts
- `listInvoices()` — list, branch-scoped via sales_orders join (orphan invoices hidden from scoped staff).
- `getInvoiceById()`, `createInvoice()`, `updateInvoice()` — CRUD.

### cancelled-sales.service.ts
- `listCancelledSales()` — list + line items + repeat-offender count.
- `getCancelledSaleById()` — single, scoped.
- `exportCancelledSalesCsv()` — chunked CSV (cap 50k rows).

### installment-plan.service.ts
- `listInstallmentPlans()`, `getInstallmentPlanById()`, `getInstallmentPlanByCode()`, `createInstallmentPlan()`, `updateInstallmentPlan()`, `setDefaultInstallmentPlan()`, `deactivateInstallmentPlan()` — full CRUD + default/deactivate.

### installment.service.ts
- `getGracePeriodDaysForPackage()`, `calculateCreditsUnlocked()`, `calculateInstallmentAmounts()`, `calculateSuggestedRefund()` — helpers.
- `createInstallmentSchedule()` — build N installment rows + update pkg metadata.
- `confirmInstallmentPayment()` — confirm + unlock credits + sync paymentStatus + auto-complete.
- `evaluateAndExpireIfOverdue()`, `evaluateAndLockIfOverdue()` — overdue/lock state machine (called lazily on open + by the daily sweep cron, see below).
- `unlockPackage()`, `adjustCredits()`, `processRefund()`, `rescheduleInstallment()`, `waiveInstallment()`, `resetCreditsOverride()`, `setPackageOverdraft()` — admin mutations.
- `syncPackagePaymentStatus()`, `getInstallmentsByPackageInstance()`, `getAdminInstallmentOverview()`, `getSuggestedRefund()` — queries/sync.
- All have callers (router or sweep). No ORPHANs.

### payments.service.ts
- `getPaymentStatusHistory()` — cursor query over `payment_status_history`. **This is the ONLY function in payments.service.ts** — there is no payment-creation service fn; payment rows are written inline inside `recordPosSale` (see P2-PAYMENT-SERVICE).

### pricing.service.ts
- `resolveServicePrice()`, `resolveProductPrice()`, `pickMostSpecific()` (private), `listServicePriceOverrides()`, `listProductPriceOverrides()`, `setServicePrice()`, `setProductPrice()`, `expireServicePrice()`, `expireProductPrice()`, `deleteServicePrice()`, `deleteProductPrice()` — price-override CRUD/resolution. Callers live in `products.ts` and `services/pricing.procedures.ts` (outside this domain but wired). No ORPHANs.
- NOTE: `recordPosSale` does NOT call `resolveServicePrice`/`resolveProductPrice`; POS trusts the `unitPriceCents` the client sends (see P2-PRICE-TRUST).

### tax.service.ts
- `resolveTaxRate()` — org-wide active rate at a timestamp (branchId param accepted but unused). Called by `recordPosSale`. No ORPHAN.

---

## Gaps (prioritized)

### P1 — `recordPosSale` references undefined `itemNet` → services package does not compile, package sales break  (packages/services/src/pos.service.ts:622, 652)  [status: partial | testable: true]
Working-tree change renamed `itemTotal` → `itemNet` at two `packageInstances.totalPrice` / installment-schedule call sites, but **`itemNet` is never declared**. `tsc -p packages/services/tsconfig.json` reports:
```
pos.service.ts(622,19): error TS2304: Cannot find name 'itemNet'.
pos.service.ts(652,20): error TS2304: Cannot find name 'itemNet'.
```
In scope only `itemTotal` (= `item.unitPriceCents * item.quantity`) and `itemTaxAmount` exist. Consequences:
1. The `@avantej-core/services` package fails type-check (CI `bun check-types` would fail; the prior POS audit's web-only gate masked this).
2. At runtime any sale containing a `package` item throws `ReferenceError: itemNet is not defined` → the whole sale transaction rolls back. Cash/card sales of services/products still work (the package branch is skipped).
Confirmed via `git diff HEAD -- packages/services/src/pos.service.ts` (the only change in this file is `itemTotal`→`itemNet` x2). Likely intent was to store a net (pre/post-tax) price; needs a declared `itemNet` or revert to `itemTotal`.
Repro: POS sale with one package + any installment plan, OR build the services package.
persistence: { tenant, table: "package_instances + installments", where: "salesOrderId = <new order>", expect: "rows created; currently throws before insert" }

### P1 — POS cash/card/transfer sales never reach `completed`; only Stripe does (lifecycle dead-end)  (packages/services/src/pos.service.ts:401; apps/server/src/routes/webhooks.routes.ts:490)  [status: partial | testable: true]
`recordPosSale` inserts `status: input.paymentMethod === "stripe" ? "pending" : "confirmed"`. The ONLY writer of `salesOrders.status = "completed"` in the codebase is the Stripe Connect webhook (`payment_intent.succeeded` for a `sales_order`). There is no automation, handler, or UI flow that transitions a cash/card/manual_transfer/fpx order from `confirmed` → `completed`. Effects:
- `salesOrders.getLatest` (POS "Last Receipt Preview", backed by `getLatestCompletedSalesOrder`, which filters `status='completed'`) returns `null` forever for any tenant that doesn't use Stripe at POS — the preview panel never seeds.
- KPIs split on `confirmed` vs `completed` (`getSalesOrderKpiSummary` counts `confirmedCount` and `completedCount` separately), so completed-revenue metrics under-report all non-Stripe POS revenue.
`sales-orders.update` *can* set `status:"completed"` manually, but nothing invokes it automatically. Either treat `confirmed` as terminal-success for cash POS (and have `getLatest` accept it) or add a completion step.
persistence: { tenant, table: "sales_orders", where: "payment_method != stripe", expect: "status stays 'confirmed'; never 'completed'" }

### P2 — `searchPosCustomers` only returns members; walk-in search is documented but unimplemented  (packages/services/src/pos.service.ts:855-920)  [status: partial | testable: true]
Function docstring (`:846-853`) and `PosCustomerResult.type: "member" | "walk_in"` promise walk-ins are "searched directly in the tenant DB filtered by branchId." The body only queries `members` (role=client) cross-DB and returns `results.slice(0,10)` — there is no `walk_in_customers` query at all. A cashier searching for a returning registered walk-in by name/phone will never find them, so every walk-in is treated as a fresh anonymous record. `walk_in_customers` table exists (per MEMORY Phase 2S) and `recordPosSale` accepts `customerType:"walk_in"` with a real `customerId`, so the lookup path is dangling.
persistence: read-only (no write); the gap means walk-in customers can't be reused.

### P2 — `getSalesOrderKpiSummary.outstandingCents` is hardcoded `0`  (packages/services/src/sales-order.service.ts:447)  [status: partial | testable: true]
```ts
const outstandingCents = 0; // Placeholder: requires payment_items join wired by payment router
```
Returned verbatim in the KPI payload. Any "Outstanding" tile on `/dashboard/sales/view` always shows 0 regardless of partially-paid installment orders. Comment acknowledges it's a stub. The data exists (installments with status pending/overdue, invoices.amountPaid < totalAmount) but is never aggregated.
persistence: read-only metric; misleading value.

### P2 — POS trusts client-supplied `unitPriceCents`; never re-resolves price server-side  (packages/services/src/pos.service.ts:289-300; pricing.service.ts:49-121)  [status: partial | testable: true]
`recordPosSale` validates only that `unitPriceCents >= 0` and `quantity >= 1`, then computes subtotal directly from the client values. It never calls `resolveServicePrice`/`resolveProductPrice` to confirm the price matches the configured branch/customer-type price. A tampered client (or a stale cart after a price change) can record a sale at an arbitrary non-negative price. The pricing resolver exists and is used elsewhere (products/services routers) but is not enforced at the POS write boundary. Distinguish: may be intentional (POS allows manual/custom pricing via `type:"custom"`), but service/product line items arguably should be validated against the resolved price or flagged.
persistence: { tenant, table: "sales_order_items.unit_price / payments.amount", where: "new order", expect: "stores whatever the client sent" }

### P2 — Doc drift: installments router exposes 12 procedures; API overview documents 3  (enumerate from `packages/api/src/routers/` vs packages/api/src/routers/installments.ts:381-394)  [status: implemented | testable: false]
Undocumented and live: `listByPackageInstance`, `manualUnlock`, `reschedule`, `waive`, `resetOverride`, `adminOverview`, `getEvents`, `suggestRefund`, `setOverdraft`. The installments admin page and refund dialog depend on several of these. Doc materially understates the surface.

### P2 — No payment-creation service; payment rows only written inline in POS  (packages/services/src/payments.service.ts)  [status: partial | testable: false]
`payments.service.ts` contains only `getPaymentStatusHistory`. There is no reusable `createPayment` / `recordManualPayment` service fn. The Payment History page (`/dashboard/payment/view`) and the invoices router can read payments and history, but there is no domain-level API to record a standalone payment against an existing invoice/order outside the all-in-one `recordPosSale`. An invoice created via `invoices.create` cannot be marked paid through a payment-recording flow in this domain (only `invoices.update` to flip `amountPaid`/`status` by hand). Confirm whether intentional (all payments flow through POS) before acting.

### P3 — Two divergent sales-order-number generators (race-prone legacy path)  (packages/services/src/sales-order.service.ts:48-62 vs pos.service.ts:141-146)  [status: partial | testable: false]
`sales-order.service.ts` uses `count()+1` with a 4-digit pad (`SO-YYYYMMDD-0001`) — the exact race condition MEMORY notes were fixed for POS, which uses `nextval('tenant_sales_order_seq')` with a 6-digit pad (`SO-YYYYMMDD-000001`). Bare `salesOrders.create` (and `generateCancellationNumber`) still use the racy count-based path and a different number format. Concurrent `createSalesOrder` calls in the same day can collide / produce duplicate numbers; formats are inconsistent across creation sites.
persistence: { tenant, table: "sales_orders.sales_order_number", where: "created via salesOrders.create", expect: "SO-YYYYMMDD-NNNN (4-digit, count-based)" }

### P3 — Doc drift: sales-orders (`kpiSummary`, `largestToday`, `getLatest`) and cancelled-sales (`exportCsv`) undocumented  (API overview — enumerate from `packages/api/src/routers/`)  [status: implemented | testable: false]
These procedures are live and wired to the sales-view KPI strip / dashboard / CSV export but are absent from the API overview. Also `invoices.paymentStatusHistory` is described as invoice-scoped but its input/query is `paymentId` against `payment_status_history` (no invoice-level history table exists).

### P3 — Carry-over from prior POS audit (`"online"` payment method)  (apps/web/src/components/pos/payment-step.tsx:61 — outside owned files)  [status: partial | testable: true]
Prior audit (`zplan/2026-05-24-2139-audit-prove-pos/REPORT.md` §3) flagged the web "Online (Stripe link)" option sending `"online"` which the server enum (`pos.ts:62`: cash|card|manual_transfer|bank_transfer|fpx|stripe) rejects. Within owned files this is consistent — the router enum and `recordPosSale` input type both lack `"online"` — confirming the server side is correct and the web cast is the bug. Flagged here only for cross-reference; fix lives in the web layer.

---

## Side-effect / persistence summary for `recordPosSale` (the money-flow core)
Within one tx it writes: `sales_orders` (1), `sales_order_items` (N, with tax snapshot + `commissionDeferred`), `payments` (1, currency forced `myr`, placeholder `stripePaymentIntentId=pos_<uuid>`), `payment_items` (N line + 1 tax + 1 discount), `promotion_usages` + `promotions.usageCount++` (if promo), `invoices` (1), `package_instances` (per package item — **currently throws on `itemNet`, P1**), `installments` (schedule, with installment #1 auto-confirmed paid) + `installment_events`, `audit_logs` (1). Post-tx (best-effort, non-fatal): product-line `commission_splits` via `calculateCommissionForPos`, and a debounced branch-stats revenue refresh. Service/package line commission is intentionally DEFERRED to appointment delivery (`commissionDeferred=true`) — **no stock movement is performed for product sales** (no inventory decrement in this path; confirm whether product POS sales should move stock — appears missing).
