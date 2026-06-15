# Domain: Sales, POS & Products

Audit date: 2026-05-25  
Auditor: Claude Sonnet 4.6 (read-only)

---

## Endpoints / Procedures

### packages/api/src/routers/pos.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `recordSale` | tenantProcedure + `pos:create` | Atomic POS sale: customer → items → promo → tax → sales_order + payment + invoice + package_instance + installments + audit | `recordPosSale` (pos.service.ts) |
| `searchCustomers` | tenantProcedure + `pos:create` | Combobox lookup: members (cross-DB) + walk-ins by name/email/phone | `searchPosCustomers` (pos.service.ts) |
| `getReceiptData` | tenantProcedure + `pos:create` | Receipt DTO: order + items + payment + invoice + packageInstance + installments | inline handler |

### packages/api/src/routers/sales-orders.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `sales:read` | Paginated sales order list with status/refundStatus/date/branch/customer filters | `listSalesOrders` |
| `getById` | tenantProcedure + `sales:read` | Single order detail with createdByName enrichment | `getSalesOrderById` |
| `create` | tenantProcedure + `sales:create` | Manual sales order creation (non-POS path) | `createSalesOrder` |
| `update` | tenantProcedure + `sales:update` | Mutable fields: date/customer/status/totalAmount/notes | `updateSalesOrder` |
| `cancel` | tenantProcedure + `sales:delete` | Cancel + set cancellation fields + void commissions + audit | `cancelSalesOrder` |
| `statusHistory` | tenantProcedure + `sales:read` | Cursor-paginated status change history with user name enrichment | `getSalesOrderStatusHistory` |
| `kpiSummary` | tenantProcedure + `sales:read` | KPI strip: total sales, refunded, outstanding, count for today/week/month | `getSalesOrderKpiSummary` |
| `largestToday` | tenantProcedure + `sales:read` | Largest single sale today for the dashboard widget | `getLargestSaleToday` |
| `getLatest` | tenantProcedure + `sales:read` | Most recent completed sales order for POS last-receipt seed | `getLatestCompletedSalesOrder` |

### packages/api/src/routers/cancelled-sales.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `sales:read` | Paginated cancelled orders with line items + repeat-offender count | `listCancelledSales` |
| `getById` | tenantProcedure + `sales:read` | Single cancelled sale detail | `getCancelledSaleById` |
| `exportCsv` | tenantProcedure + `sales:read` | Streaming CSV export up to 50 k rows | `exportCancelledSalesCsv` |

### packages/api/src/routers/products.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `inventory:read` | Product catalog with brand/category/supplier/status/search filters | `listProducts` |
| `getById` | tenantProcedure + `inventory:read` | Single product detail | `getProductById` |
| `create` | tenantProcedure + `inventory:create` | Create product with SKU/barcode/brand/category/supplier/uom | `createProduct` |
| `update` | tenantProcedure + `inventory:update` | Update product fields | `updateProduct` |
| `getStock` | tenantProcedure + `inventory:read` | Per-product per-branch stock level | `getProductStock` |
| `adjustStock` | tenantProcedure + `inventory:update` | Manual delta-based stock adjustment | `adjustProductStock` |
| `resolvePrice` | tenantProcedure (no explicit perm check) | Resolve effective price for product+branch+customerType | `resolveProductPrice` |
| `listPriceOverrides` | tenantProcedure + `inventory:read` | List all branch/customer-type price overrides for a product | `listProductPriceOverrides` |
| `setBranchPrice` | tenantProcedure + `inventory:update` | Set a branch-specific or customer-type price override | `setProductPrice` |
| `expireBranchPrice` | tenantProcedure + `inventory:update` | Set effectiveUntil on a price override row | `expireProductPrice` |
| `deleteBranchPrice` | tenantProcedure + `inventory:delete` | Hard-delete a price override row | `deleteProductPrice` |

### packages/api/src/routers/product-categories.ts

(Not listed as explicitly owned file but referenced; follows same CRUD pattern as brands.)

### packages/api/src/routers/brands.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `inventory:read` | Brand list with optional search | `listBrands` |
| `getById` | tenantProcedure + `inventory:read` | Single brand | `getBrandById` |
| `create` | tenantProcedure + `inventory:create` | Create brand | `createBrand` |
| `update` | tenantProcedure + `inventory:update` | Update brand name/description | `updateBrand` |
| `delete` | tenantProcedure + `inventory:delete` | Hard-delete brand | `deleteBrand` |

### packages/api/src/routers/promotions.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `promotion_management:read` | List promotions filtered by isActive/type/branchId | `listPromotions` |
| `validate` | tenantProcedure + `promotion_management:read` | Validate promo code against order context | `validatePromoCode` |
| `apply` | tenantProcedure + `promotion_management:create` | Record a promotion usage (standalone, outside POS tx) | `applyPromotion` |
| `create` | tenantProcedure + `promotion_management:create` | Create promotion with all constraint fields | `createPromotion` |
| `update` | tenantProcedure + `promotion_management:update` | Mutable: name/description/isActive/validFrom/validUntil only | `updatePromotion` |
| `deactivate` | tenantProcedure + `promotion_management:delete` | Soft-deactivate promotion | `deactivatePromotion` |

### packages/api/src/routers/purchase-orders.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `purchase_order_management:read` | Paginated PO list with supplier/branch/status/date filters | `listPurchaseOrders` |
| `getById` | tenantProcedure + `purchase_order_management:read` | Single PO detail | `getPurchaseOrderById` |
| `create` | tenantProcedure + `purchase_order_management:create` | Create PO draft | `createPurchaseOrder` |
| `approve` | tenantProcedure + `purchase_order_management:update` | Approve PO (admin action) | `approvePurchaseOrder` |
| `receiveItems` | tenantProcedure + `purchase_order_management:update` | Mark items received, update stock | `receiveItems` |
| `cancel` | tenantProcedure + `purchase_order_management:delete` | Cancel PO | `cancelPurchaseOrder` |

### packages/api/src/routers/households.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `create` | tenantProcedure + `customer_management:update` | Create household with optional primary contact | inline handler |
| `addMember` | tenantProcedure + `customer_management:update` | Link customer profile to household | inline handler |
| `removeMember` | tenantProcedure + `customer_management:update` | Unlink profile from household | inline handler |
| `get` | tenantProcedure + `customer_management:read` | Fetch household with all members | inline handler |
| `list` | tenantProcedure + `customer_management:read` | List households scoped by branch/accessible nodes | inline handler |

### packages/api/src/routers/memberships.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `freeze` | tenantProcedure + `customer_management:update` | Freeze customer package for medical/travel/other | `freezeMembership` |
| `resume` | tenantProcedure + `customer_management:update` | Manually resume frozen package | `resumeMembership` |
| `cancel` | tenantProcedure + `customer_management:update` | Cancel an erroneous freeze hold | `cancelMembershipHold` |
| `listHolds` | tenantProcedure + `customer_management:read` | List all holds on a package (audit trail) | `listHoldsForPackage` |

### packages/api/src/routers/package-instances/lifecycle.procedures.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `cancel` | tenantProcedure + `package_management:update` | Cancel package instance (admin), idempotency CONFLICT on re-cancel | `cancelPackageInstance` |
| `freeze` | tenantProcedure + `package_management:update` | Freeze active package with optional until-date | `freezePackageInstance` |
| `unfreeze` | tenantProcedure + `package_management:update` | Unfreeze package → active | `unfreezePackageInstance` |
| `extend` | tenantProcedure + `package_management:update` | Extend expiresAt by addDays (1–365) | `extendPackageInstance` |

### packages/api/src/routers/package-instances/history.procedures.ts

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `statusHistory` | tenantProcedure + `package_management:read` | Cursor-paginated status change history | `getPackageInstanceStatusHistory` |

### apps/server/src/routers/payments.ts (factory: `createPaymentsRouter`)

| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `createPaymentIntent` | protectedProcedure | Stripe Direct Charge PI for appointment, returns clientSecret | Stripe SDK inline |
| `sendPaymentLink` | protectedProcedure | Stripe Payment Link for appointment, idempotent | Stripe SDK inline |
| `getPaymentStatus` | protectedProcedure | Return appointment paymentStatus + PI id | inline select |
| `refund` | protectedProcedure | Issue Stripe full refund on appointment (webhook flips status) | Stripe SDK inline |
| `createSetupIntent` | protectedProcedure | Card-on-file setup intent for customer profile | Stripe SDK inline |
| `listSavedCards` | protectedProcedure | List saved payment methods for a customer | Stripe SDK inline |
| `chargeSavedCard` | protectedProcedure | Off-session charge using saved card for appointment | Stripe SDK inline |
| `createSalesOrderPaymentLink` | protectedProcedure | Stripe Payment Link for a POS sales order (online checkout) | Stripe SDK inline |
| `purchasePackage` | protectedProcedure | Create pending package instance + Stripe Payment Link | `createPackageInstance` + Stripe |

---

## Logic Functions

### packages/services/src/pos.service.ts

- `recordPosSale(tenantDb, input)` — Atomic 15-step orchestrator: validate customer/items/installment plan, promo, tax, generate order numbers via sequences, insert sales_order → items → payment → payment_items → promo_usage → invoice → package_instances → installment schedule → audit log; fires commission calculator post-tx for product items only; refreshes branch stats cache
- `searchPosCustomers(controlPanelDb, tenantDb, params)` — Cross-DB customer search: fetches client members scoped by accessibleNodeIds, batch-fetches user details from control panel, filters by name/email/phone; **does not search walk_in_customers table** [see P2 gap]
- `formatDateYYYYMMDD(date)` — internal date formatter
- `addDays(date, days)` — internal date helper
- `generateSalesOrderNumber(tx, date)` — atomic sequence via `nextval('tenant_sales_order_seq')`
- `generatePaymentNumber(tx, date)` — atomic sequence via `nextval('tenant_payment_seq')`
- `generateInvoiceNumber(tx, date)` — atomic sequence via `nextval('tenant_invoice_seq')`

### packages/services/src/sales-order.service.ts

- `listSalesOrders(tenantDb, params)` — Paginated query with branch/status/refundStatus/date/customer/accessibleNodes filters
- `getSalesOrderById(tenantDb, id)` — findFirst by id
- `createSalesOrder(tenantDb, params)` — Manual non-POS sales order creation (generates order number via COUNT race-prone method — see P3 gap)
- `updateSalesOrder(tenantDb, id, params, actor?)` — Partial update with status history append when status changes
- `cancelSalesOrder(tenantDb, id, params, actor)` — Sets status=cancelled + generates cancellation number + audit + voids commissions + status history; **does not trigger Stripe refund** [see P1 gap]
- `getSalesOrderStatusHistory(tenantDb, orderId, opts)` — Cursor-paginated status history rows
- `getSalesOrderKpiSummary(tenantDb, params)` — Aggregate KPI for today/week/month or custom range
- `getLargestSaleToday(tenantDb, params)` — Returns highest-value confirmed/completed order created today
- `getLatestCompletedSalesOrder(tenantDb, params)` — Returns most-recent confirmed/completed order with line items and payment method
- `resolvePeriodDates(period)` — internal helper
- `generateSalesOrderNumber(tenantDb, date)` — **Uses COUNT+1 (race-prone)** — see P3 gap
- `generateCancellationNumber(tenantDb, date)` — **Uses COUNT+1 (race-prone)**

### packages/services/src/cancelled-sales.service.ts

- `listCancelledSales(tenantDb, params)` — Paginated cancelled orders with line items + repeat-offender count (capped 99); walk-in safe via text customerId
- `getCancelledSaleById(tenantDb, id, accessibleNodeIds?)` — Single cancelled sale with line items + repeat-offender count
- `exportCancelledSalesCsv(tenantDb, params)` — Chunked (500 rows) CSV export up to 50 k rows, returns `{ csv, truncated, totalMatching }`

### packages/services/src/products.service.ts

- `listProducts(tenantDb, params)` — Filtered product list (brand/category/supplier/status/search)
- `getProductById(tenantDb, id)` — Single product
- `createProduct(tenantDb, params)` — Insert product row
- `updateProduct(tenantDb, id, params)` — Partial product update
- `getProductStock(tenantDb, productId, branchId)` — Single stock row
- `upsertProductStock(tenantDb, productId, branchId, quantity)` — Upsert stock to absolute quantity; **not called by POS flow** [ORPHAN within POS domain]
- `adjustStock(tenantDb, productId, branchId, delta)` — Increment/decrement stock; called by stock-requests and transfer-orders, **not called by POS flow** [ORPHAN within POS domain — see P1 gap]

### packages/services/src/promotions.service.ts

- `listPromotions(tenantDb, params)` — Filter promotions
- `validatePromoCode(tenantDb, code, params)` — Validate code: active, date range, minimumOrderAmount, perCustomerLimit, usageLimit, branchId, productIds/serviceIds applicability
- `applyPromotion(tenantDb, promotionId, params)` — Insert promotion_usage + increment usage_count (standalone, opens own tx — **conflicts if called inside another tx**)
- `createPromotion(tenantDb, params, actor)` — Insert promotion row + audit
- `updatePromotion(tenantDb, id, params)` — Update mutable fields
- `deactivatePromotion(tenantDb, id, actor)` — Set isActive=false + audit

### packages/services/src/package-instance.service.ts

- `listPackageInstancesForClient(tenantDb, params)` — Client-scoped package list
- `getPackageInstanceById(tenantDb, id)` — Single instance
- `createPackageInstance(tenantDb, params)` — Insert package_instance row (used by payments.purchasePackage Stripe flow)
- `listMemberships(controlPanelDb, tenantDb, params)` — Retention operator view with filter/expiry/freeze/outstanding balance
- `updatePackageInstance(tenantDb, id, params, actor?)` — Partial update with optional status history

### packages/services/src/payments.service.ts

- `getPaymentStatusHistory(tenantDb, paymentId, opts)` — Cursor-paginated payment_status_history rows

### packages/services/src/membership.service.ts (singular)

- `freezeMembership(tenantDb, params)` — Insert membership_hold + push expiresAt by freeze duration
- `resumeMembership(tenantDb, holdId, params)` — Flip hold to resumed + contract expiresAt
- `cancelMembershipHold(tenantDb, holdId, actorUserId)` — Flip hold to cancelled without touching expiresAt
- `listHoldsForPackage(tenantDb, packageInstanceId)` — Return all holds for one package

### packages/services/src/brands.service.ts

- `listBrands`, `getBrandById`, `createBrand`, `updateBrand`, `deleteBrand` — Standard CRUD

### packages/services/src/pricing.service.ts

- `resolveProductPrice(tenantDb, productId, branchId, customerType)` — Resolves effective price via branch/customer-type override chain

### packages/services/src/tax.service.ts

- `resolveTaxRate(tenantDb, branchId, date)` — Resolves active tax rate for branch/date; used as fallback in POS when taxRateId not supplied

### packages/services/src/purchase-orders.service.ts

- `listPurchaseOrders`, `getPurchaseOrderById`, `createPurchaseOrder`, `approvePurchaseOrder`, `receiveItems`, `cancelPurchaseOrder` — Standard PO lifecycle

### packages/services/src/goods-receipt.service.ts

- Goods-receipt CRUD backing goods-receipts router (not directly in domain scope but referenced)

### packages/services/src/package-instance-staff.service.ts

- Package instance staff assignment functions (backing `package-instance-staff` router)

---

## Gaps (prioritized P1/P2/P3/P4)

---

### P1 — POS product sale does not decrement stock  
`packages/services/src/pos.service.ts` (entire file — no call to `adjustStock`)  
`packages/services/src/products.service.ts:179` (`adjustStock` fn)  
[status: missing | testable: true]

`recordPosSale` inserts `product` type line items via `salesOrderItems` but never calls `adjustStock` (or `upsertProductStock`). The `adjustStock` fn exists and is called by stock-request and transfer-order flows but not by POS. A product sold at the counter leaves inventory unchanged. Stock reports will diverge from reality on every product POS transaction.

`persistence: { table: product_stock, where: { productId, branchId }, expect: { quantity: decremented by sold qty } }`

---

### P1 — Cancel-sale flow does not trigger Stripe refund for online (Stripe) payments  
`packages/services/src/sales-order.service.ts:237-320` (`cancelSalesOrder`)  
`packages/api/src/routers/sales-orders.ts:200-232` (`cancel` procedure)  
[status: partial | testable: true]

`cancelSalesOrder` marks the order cancelled, voids commissions, and sets `cancelledAmount = refundAmount`. It does **not** call the Stripe `refunds.create` API. The `payments.refund` procedure exists (`apps/server/src/routers/payments.ts:411`) but is scoped to **appointment** payments only. No equivalent Stripe refund path exists for sales-order-originated payments. The frontend cancel dialog (`apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx:179-204`) calls `salesOrders.cancel` directly without first calling `payments.refund`. Result: Stripe-paid POS orders get a DB `cancelled` status but no real money is returned.

`persistence: { table: sales_orders, where: { id }, expect: { status: "cancelled", refundStatus: "processed" } }` — refundStatus never reaches "processed" because no Stripe call is made.

---

### P1 — `searchPosCustomers` does not search walk-in customers  
`packages/services/src/pos.service.ts:860-924`  
[status: partial | testable: true]

`searchPosCustomers` searches only the control-panel `user` table filtered by `members.role = 'client'`. The `walk_in_customers` table is never queried. Staff trying to look up a previously registered walk-in customer by name/phone during a POS transaction will get no results. Walk-in lookup must fall back to anonymous mode every time.

---

### P1 — Receipt "Email" button is permanently disabled, no implementation  
`apps/web/src/components/pos/pos-workflow.tsx:1512-1518`  
[status: missing | testable: false]

The "Email" button in the Last Receipt Preview panel is rendered with `disabled` hardcoded and `cursor-not-allowed`. There is no backend endpoint or service to send a receipt email. No `emailReceipt` procedure exists in any router. This is a silent dead end for every completed POS sale where the customer expects an email receipt.

---

### P1 — `packages/instances/view.tsx` is a redirect stub — package lifecycle UI is behind an indirect route  
`apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx:1-6`  
[status: partial | testable: false]

The file that should be `/dashboard/packages/instances/view` silently redirects to `/dashboard/packages/view?tab=session-packs`. The actual lifecycle actions (freeze/unfreeze/extend/cancel) are wired in `apps/web/src/features/packages/` components and `apps/web/src/components/pages/packages/instances-page.tsx`, but the canonical URL mentioned in the domain spec for this audit is a redirect stub. The lifecycle mutations themselves (`packageInstances.cancel/freeze/unfreeze/extend`) are wired correctly in the features layer.

---

### P2 — `generateSalesOrderNumber` in `sales-order.service.ts` is race-prone (COUNT+1)  
`packages/services/src/sales-order.service.ts:48-62`  
[status: partial | testable: true]

The manual (non-POS) `createSalesOrder` path generates the order number with `SELECT COUNT(*) LIKE 'SO-YYYYMMDD-%' + 1`. Two concurrent inserts can produce the same number. The POS path correctly uses `nextval('tenant_sales_order_seq')` (atomic). Cancellation number uses the same COUNT race pattern (`generateCancellationNumber:64-78`). If two sales are cancelled simultaneously they will collide on `cancellationNumber`.

---

### P2 — `resolvePrice` procedure has no `requirePermission` guard  
`packages/api/src/routers/products.ts:207-228`  
[status: partial | testable: true]

`products.resolvePrice` calls `guardBranchAccessible` and `assertOrgContextMatch` but does **not** call `requirePermissionOrpc`. Any authenticated tenant user — regardless of role — can resolve product prices for any branch they can access. All sibling product procedures correctly gate on `inventory:read`.

---

### P2 — Cancelled-sales UI shows synthetic refund status, not real DB field  
`apps/web/src/routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx:154-177` (`RefundStatusBadge`)  
[status: partial | testable: false]

The `RefundStatusBadge` component derives a fake refund status heuristically: if `cancelledAmount > 0` → "Processed"; if `fraud_suspected` → "None". The actual `sales_orders.refund_status` column exists in the schema and is filterable via the API (`salesOrders.list` accepts `refundStatus`), but the cancelled-sales list endpoint (`cancelledSalesRouter.list`) does not return `refundStatus` and the UI manufactures a proxy instead.

---

### P2 — `applyPromotion` opens its own transaction — unsafe to call from inside another tx  
`packages/services/src/promotions.service.ts` (the `applyPromotion` function)  
`packages/api/src/routers/promotions.ts:88-111` (`apply` procedure)  
[status: partial | testable: true]

`promotionsRouter.apply` is a standalone endpoint that calls `applyPromotion`. That function opens its own Drizzle transaction. In the POS flow, promotion usage is instead inlined into the main transaction (correct). But if any future caller invokes `applyPromotion` inside an existing transaction (e.g. via the oRPC `apply` procedure in a composed operation), the nested tx will produce Neon connection conflicts. The service file comment on this hazard is confined to pos.service.ts; the standalone `apply` procedure is exposed with no guard.

---

### P3 — Walk-in customer is always "anonymous" in POS — no registered walk-in lookup support in UI  
`apps/web/src/components/pos/pos-workflow.tsx:553-566`  
[status: partial | testable: false]

When `customerTypeMode === 'walk_in'`, the UI always sends `customerId = "anonymous"`, `customerName = "Walk-in"`. The `walk_in_customers` table exists and the `searchPosCustomers` function's type signature supports returning walk-in results (`type: "walk_in"`), but no UI path lets a cashier look up a registered walk-in customer during a POS transaction. The customer combobox (`CustomerStep`) is only shown for the "member" mode.

---

### P3 — Payment/view page has no pagination — loads all invoices in one query  
`apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx:60-62`  
[status: partial | testable: true]

`client.invoices.list({ organizationId })` is called with no `limit` or `offset`. For high-volume tenants this will return all historical invoice rows in one response, causing slow page loads and potential timeout. The `sales/view` page correctly uses paginated `salesOrders.list`.

---

### P3 — `products.list` has no pagination — returns entire catalog in one query  
`packages/services/src/products.service.ts:26-65` (`listProducts`)  
`packages/api/src/routers/products.ts:37-52` (`list` procedure)  
[status: partial | testable: true]

`listProducts` has no `limit`/`offset` parameters. The Drizzle query has no `.limit()` call. For catalogs with hundreds of products this will return every row. The router exposes no pagination params either.

---

### P3 — `promotions.update` does not allow changing `code`, `type`, `value` fields  
`packages/api/src/routers/promotions.ts:170-203`  
[status: partial | testable: false]

The `update` input schema only accepts `name`, `description`, `isActive`, `validFrom`, `validUntil`. Immutable after creation are: `code`, `type`, `value`, `minimumOrderAmount`, `maximumDiscount`, `usageLimit`, `perCustomerLimit`, `branchId`. There is no `delete` procedure — only `deactivate`. If an operator sets a wrong discount value, they must deactivate and recreate the promotion; the UI does not indicate these fields are locked.

---

### P3 — `cancelSalesOrder` does not reverse package instance credits  
`packages/services/src/sales-order.service.ts:237-320`  
[status: missing | testable: true]

When a sale containing a package purchase is cancelled, the `package_instances` row linked to that `salesOrderId` is not updated (no status flip to `cancelled`, no credit zeroing). The package stays `active` and `creditsTotal` remain available even though the order is refunded/cancelled. This allows a customer to consume sessions from a cancelled package.

`persistence: { table: package_instances, where: { salesOrderId }, expect: { status: "cancelled" } }`

---

### P4 — `goods-receipts` router not in scope but referenced — `receiveItems` (PO) does update stock  
`packages/services/src/purchase-orders.service.ts` (`receiveItems`)  
[status: implemented | testable: true]

PO `receiveItems` calls stock-update logic correctly. Noted for completeness.

---

### P4 — `household` billing: no payment-to-household linkage  
`packages/api/src/routers/households.ts`  
[status: missing | testable: false]

The households router creates billing/family units but there is no procedure to charge a household's primary contact for a sale made to a dependent member. The POS `recordSale` does not accept a `householdId` and cannot split a payment across household members.

---

## Summary of testable findings

Findings with `testable: true`: **7**  
(P1 stock gap, P1 Stripe refund gap, P1 walk-in search gap, P2 race-prone order number, P2 missing `resolvePrice` permission, P2 invoice list no pagination, P3 products.list no pagination)
