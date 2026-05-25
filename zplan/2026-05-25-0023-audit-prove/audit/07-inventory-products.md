# Domain Inventory & Products

Read-only audit. Repo root `C:\Project\Avantej`. All paths absolute-relative to repo root.
Scope: products, product-categories, brands, suppliers, purchase-orders, goods-receipts, stock-requests, transfer-orders, promotions, units-of-measure (+ pricing.service side-functions used by products router).

All routers verified registered in `packages/api/src/routers/base-router.ts` (lines 97-113). Every procedure uses `tenantProcedure` (= protectedProcedure + tenant ctx) + `assertOrgContextMatch` + `requirePermissionOrpc`. No public procedures in this domain.

---

## Endpoints / Procedures

### products (`packages/api/src/routers/products.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (inventory:read) | List products, filter brand/category/supplier/status/search | `listProducts` (products.service) |
| `getById` | protected (inventory:read) | Get one product, 404 if missing | `getProductById` |
| `create` | protected (inventory:create) | Create product | `createProduct` |
| `update` | protected (inventory:update) | Update product | `updateProduct` |
| `getStock` | protected (inventory:read) + branch guard | Get on-hand qty for product@branch | `getProductStock` |
| `adjustStock` | protected (inventory:update) + branch guard | Add/subtract on-hand qty by delta | `adjustStock` |
| `resolvePrice` | protected (NO permission gate — only branch guard) | Resolve effective price cents for product/branch/customerType | `resolveProductPrice` (pricing.service) |
| `listPriceOverrides` | protected (inventory:read) | List branch/customer price overrides | `listProductPriceOverrides` |
| `setBranchPrice` | protected (inventory:update) | Upsert a price override | `setProductPrice` |
| `expireBranchPrice` | protected (inventory:update) | Set effectiveUntil on an override | `expireProductPrice` |
| `deleteBranchPrice` | protected (inventory:delete) | Hard-delete an override | `deleteProductPrice` |

Note: no `delete`/soft-delete procedure for products (status='discontinued' is the only retire path — intentional).

### product-categories (`packages/api/src/routers/product-categories.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (inventory:read) | List categories, optional name search | `listProductCategories` |
| `getById` | protected (inventory:read) | Get one category, 404 | `getProductCategoryById` |
| `create` | protected (inventory:create) | Create category | `createProductCategory` |
| `update` | protected (inventory:update) | Update category | `updateProductCategory` |
| `delete` | protected (inventory:delete) | **Hard delete** | `deleteProductCategory` |

### brands (`packages/api/src/routers/brands.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (inventory:read) | List brands, optional search | `listBrands` |
| `getById` | protected (inventory:read) | Get one brand, 404 | `getBrandById` |
| `create` | protected (inventory:create) | Create brand | `createBrand` |
| `update` | protected (inventory:update) | Update brand | `updateBrand` |
| `delete` | protected (inventory:delete) | **Hard delete** | `deleteBrand` |

### suppliers (`packages/api/src/routers/suppliers.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (inventory:read) | List suppliers, filter isActive/search | `listSuppliers` |
| `getById` | protected (inventory:read) | Get one supplier, 404 | `getSupplierById` |
| `create` | protected (inventory:create) | Create supplier | `createSupplier` |
| `update` | protected (inventory:update) | Update supplier | `updateSupplier` |
| `deactivate` | protected (inventory:update) | Soft-delete (isActive=false) | `deactivateSupplier` |

### purchase-orders (`packages/api/src/routers/purchase-orders.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (purchase_order_management:read) + branch guard | List POs w/ filters + RBAC node filter | `listPurchaseOrders` |
| `getById` | protected (…:read) | Get PO + items, 404 | `getPurchaseOrderById` |
| `create` | protected (…:create) + branch guard | Create PO (status=draft) + items in tx | `createPurchaseOrder` |
| `approve` | protected (…:update) | draft→approved + audit (tx, row lock) | `approvePurchaseOrder` |
| `receiveItems` | protected (…:update) | Bump receivedQty + roll PO status — **no stock move** | `receiveItems` |
| `cancel` | protected (…:delete) | draft/approved→cancelled + audit | `cancelPurchaseOrder` |

### goods-receipts (`packages/api/src/routers/goods-receipts.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `listForPo` | protected (…:read) | List receipts for a PO | `listReceiptsForPo` |
| `getById` | protected (…:read) | Get receipt + items, 404 | `getReceiptById` |
| `create` | protected (…:update) + branch guard | Post receipt — **moves stock**, bumps receivedQty, rolls PO status (tx) | `createReceipt` |
| `cancel` | protected (…:update) | Reverse stock + receivedQty + PO status | `cancelReceipt` |
| `createInvoice` | protected (…:create) | Create supplier invoice (status=pending) | `createSupplierInvoice` |
| `listInvoices` | protected (…:read) | List supplier invoices w/ filters | `listSupplierInvoices` |
| `matchInvoice` | protected (…:update) | 3-way match w/ tolerance → status=matched | `markInvoiceMatched` |
| `disputeInvoice` | protected (…:update) | pending/matched→disputed | `disputeInvoice` |
| `markInvoicePaid` | protected (…:update) | matched→paid | `markInvoicePaid` |
| `getInvoicePreview` | protected (…:read) | Preview 3-way tolerance, mismatches | `getInvoicePreview` |

### stock-requests (`packages/api/src/routers/stock-requests.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (stock_requests:read) | List requests, RBAC filter by toBranch | `listStockRequests` |
| `getById` | protected (…:read) | Get request + items, 404 | `getStockRequestById` |
| `create` | protected (…:create) | Create request (status=pending) + items | `createStockRequest` |
| `approve` | protected (…:approve) | pending→approved (no validation of current status) | `approveStockRequest` |
| `reject` | protected (…:reject) | →rejected (no status guard) | `rejectStockRequest` |
| `fulfill` | protected (…:update) | Set fulfilled qty + **move stock** + status=fulfilled | `fulfillStockRequest` |

### transfer-orders (`packages/api/src/routers/transfer-orders.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (transfer_orders:read) | List transfers w/ filters — **RBAC arg not passed** | `listTransferOrders` |
| `getById` | protected (…:read) | Get transfer + items, 404 | `getTransferOrderById` |
| `create` | protected (…:create) | Create transfer (status=pending) + items | `createTransferOrder` |
| `markInTransit` | protected (…:update) | →in_transit (no status guard) | `markInTransit` |
| `complete` | protected (…:approve) | Set received qty + **move stock** + status=completed | `completeTransfer` |
| `cancel` | protected (…:update) | →cancelled (no status guard) | `cancelTransfer` |

### promotions (`packages/api/src/routers/promotions.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (promotion_management:read) + branch guard | List promos w/ filters | `listPromotions` |
| `validate` | protected (…:read) + branch guard | Validate code, compute discount (no usage write) | `validatePromoCode` |
| `apply` | protected (…:create) | Record usage + bump usageCount (standalone) | `applyPromotion` |
| `create` | protected (…:create) + branch guard | Create promo + audit | `createPromotion` |
| `update` | protected (…:update) | Update subset of fields | `updatePromotion` |
| `deactivate` | protected (…:delete) | isActive=false + audit | `deactivatePromotion` |

### units-of-measure (`packages/api/src/routers/units-of-measure.ts`) — *not in owned list but backs UoM page*
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | protected (inventory:read) | List UoMs, optional search | `listUnitsOfMeasure` |
| `getById` | protected (inventory:read) | Get one UoM, 404 | `getUomById` |
| `create` | protected (inventory:create) | Create UoM (with baseUomId + conversionFactor cols) | `createUom` |
| `update` | protected (inventory:update) | Update UoM | `updateUom` |
| `delete` | protected (inventory:delete) | **Hard delete** | `deleteUom` |

---

## Logic Functions

### products.service.ts
- `listProducts()` — filtered product list
- `getProductById()` — single product or null
- `createProduct()` — insert product (defaults type=product, conversionFactor="1")
- `updateProduct()` — partial update
- `getProductStock()` — read product_stock row for product@branch
- `upsertProductStock()` — **ORPHAN within owned routers** (set absolute qty; not called by any owned router. Search needed to confirm external callers — no products-router caller)
- `adjustStock()` — atomic `quantity += delta`, inserts row if none. **No floor at 0, no movement ledger.** Shared by stock-requests + transfer-orders + goods-receipt(inline).

### product-categories.service.ts
- `listProductCategories()`, `getProductCategoryById()`, `createProductCategory()`, `updateProductCategory()`, `deleteProductCategory()` — all wired.

### brands.service.ts
- `listBrands()`, `getBrandById()`, `createBrand()`, `updateBrand()`, `deleteBrand()` — all wired.

### suppliers.service.ts
- `listSuppliers()`, `getSupplierById()`, `createSupplier()`, `updateSupplier()`, `deactivateSupplier()` — all wired. No reactivate fn (asymmetric vs members).

### purchase-orders.service.ts
- `listPurchaseOrders()`, `getPurchaseOrderById()`, `createPurchaseOrder()`, `approvePurchaseOrder()`, `receiveItems()`, `cancelPurchaseOrder()` — all wired.
- `generatePONumber()` — internal helper.

### goods-receipt.service.ts
- `createReceipt()` — canonical stock write-through path (PO→stock)
- `cancelReceipt()` — reversal
- `getReceiptById()`, `listReceiptsForPo()`, `computeReceiptTotalCents()`, `markInvoiceMatched()`, `createSupplierInvoice()`, `listSupplierInvoices()`, `disputeInvoice()`, `markInvoicePaid()`, `getInvoicePreview()` — all wired.
- `generateReceiptNumber()` — internal helper.

### stock-requests.service.ts
- `listStockRequests()`, `getStockRequestById()`, `createStockRequest()`, `approveStockRequest()`, `fulfillStockRequest()`, `rejectStockRequest()` — all wired.

### transfer-orders.service.ts
- `listTransferOrders()`, `getTransferOrderById()`, `createTransferOrder()`, `markInTransit()`, `completeTransfer()`, `cancelTransfer()` — all wired.

### promotions.service.ts
- `listPromotions()`, `validatePromoCode()`, `applyPromotion()`, `createPromotion()`, `updatePromotion()`, `deactivatePromotion()` — all wired.
- `validatePromoCode` also called by `pos.service.ts:314`; `applyPromotion` is NOT used by POS (POS inlines the usage write at pos.service.ts:533-554 to share its tx).

### units-of-measure.service.ts
- `listUnitsOfMeasure()`, `getUomById()`, `createUom()`, `updateUom()`, `deleteUom()` — all wired.

---

## Gaps (prioritized)

### P1 — POS sales never decrement product stock  (packages/services/src/pos.service.ts whole-file)  [partial | testable:true]
`pos.service.ts` records the sale (sales_orders, payments, payment_items, promotion usage, installments, tax) but contains **zero** references to `productStock`/`adjustStock`/`deductStock` (grep returned none). Selling a `type: "product"` line item leaves `product_stock.quantity` unchanged, so on-hand never reflects sales — only purchase receipts add stock and nothing subtracts it except inter-branch transfers/stock-requests. This is the central inventory side-effect gap: receipts move stock IN, but the revenue path that should move it OUT is missing. Status partial because POS otherwise fully functions; the stock side-effect is simply absent.
persistence: { tenant, table: "product_stock", where: "product_id = <sold product> AND branch_id = <sale branch>", expect: "quantity decreases by sold qty after pos.recordSale — currently UNCHANGED (bug)" }

### P1 — Legacy PO `receiveItems` marks PO received without moving stock  (packages/api/src/routers/purchase-orders.ts:153 / packages/services/src/purchase-orders.service.ts:245)  [partial | testable:true]
`receiveItems` increments `purchase_order_items.receivedQty` and rolls `purchase_orders.status` to `partially_received`/`received`, but never touches `product_stock`. Only the parallel `goods-receipts.create` path (`createReceipt`, goods-receipt.service.ts:114-131) actually increments stock. Both procedures are exposed and both mutate PO state, so a caller using `purchaseOrders.receiveItems` will see the PO fully received with **no stock added** — and the PO can then no longer be received via goods-receipts cleanly (status already `received`). Two competing receive paths with divergent side-effects.
persistence: { tenant, table: "purchase_order_items / purchase_orders / product_stock", where: "po id", expect: "receivedQty bumped + status=received, but product_stock UNCHANGED via this path (only goods-receipts.create moves stock)" }

### P1 — No stock movement ledger / audit trail for quantity changes  (packages/db/src/schema/tenant/product-stock.ts:1; no stock_movements table)  [missing | testable:false]
Grep for `stock_movements|stockMovements` across `packages/` returns **no matches**. All on-hand changes (`adjustStock`, goods receipt, transfer, stock-request) mutate `product_stock.quantity` in place with no immutable movement/ledger rows. There is no way to reconstruct why a quantity changed, reconcile, or detect drift. `adjustStock` also has no floor (negative quantities possible) and no concurrency lock beyond the atomic SQL increment.
persistence: { tenant, table: "(none) — expected stock_movements ledger absent", where: "-", expect: "an append-only movement row per delta; none exists" }

### P1 — UoM conversion factors are never applied to stock math  (packages/services/src/units-of-measure.service.ts:34; packages/services/src/products.service.ts:92)  [partial | testable:false]
UoM CRUD persists `baseUomId` + `conversionFactor`, and `products.conversionFactor` exists, but no service ever reads these to convert quantities. `adjustStock`, `receiveItems`, `createReceipt`, `completeTransfer`, `fulfillStockRequest` all operate on raw integer quantities with no unit conversion. There is **no UoM-conversions router and no conversion service fn** (glob for `*conversion*` router → none; grep `convertUom` → none). So the "Units of Measure + UoM Conversions" page can store conversion data that the engine ignores. Flagging per task note as a missing-handler/dead-data gap.
persistence: { tenant, table: "units_of_measure.conversion_factor / products.conversion_factor", where: "-", expect: "read during stock movement; currently never read" }

### P1 — Low-stock reorder automation absent  (packages/db/src/schema/tenant/product-stock.ts:14)  [missing | testable:false]
`product_stock.min_stock_level` column exists but grep shows it is referenced **only** in schema + migration files — no service reads it. There is no low-stock query, no reorder suggestion, no auto-PO, no notification. The reorder-threshold data is dead.
persistence: { tenant, table: "product_stock.min_stock_level", where: "-", expect: "consumed by a low-stock/reorder routine; none exists" }

### P2 — PO status `ordered` is an unreachable/dead lifecycle state  (packages/services/src/purchase-orders.service.ts:192,245)  [partial | testable:true]
The `purchase_order_status` enum (schema line 27-34) includes `ordered`, and the schema header documents `draft → approved → ordered → …`. But `approvePurchaseOrder` sets status directly to `approved`, and nothing ever transitions `approved → ordered`. `receiveItems`/`createReceipt` only accept any status and jump to partially_received/received. So `ordered` is never written. Also receive paths do not assert the PO is `approved` first — a `draft` PO can be received.
persistence: { tenant, table: "purchase_orders.status", where: "po id", expect: "'ordered' reachable; currently never set. Receive allowed from draft (no guard)" }

### P2 — Stock-request & transfer lifecycle transitions have no status guards  (packages/services/src/stock-requests.service.ts:140,156,205; packages/services/src/transfer-orders.service.ts:142,158,208)  [partial | testable:true]
`approveStockRequest`, `rejectStockRequest`, `fulfillStockRequest`, `markInTransit`, `completeTransfer`, `cancelTransfer` all blind-update status by id with **no check on current status** (unlike PO approve/cancel which guard + row-lock). Consequences: a `fulfilled` request can be re-fulfilled (double stock move — `fulfillStockRequest` re-runs `adjustStock` because it only checks the row exists, not its status), a `cancelled` transfer can be `completed`, a `rejected` request re-approved. `fulfillStockRequest`/`completeTransfer` are idempotency hazards that double-move inventory.
persistence: { tenant, table: "stock_requests.status / transfer_orders.status + product_stock", where: "request/transfer id", expect: "re-calling fulfill/complete should be rejected; currently re-runs and double-applies stock deltas" }

### P2 — `validate` promotion does not enforce product/service applicability  (packages/services/src/promotions.service.ts:71)  [partial | testable:true]
`validatePromoCode` accepts `productIds`/`serviceIds`/`branchId` params (router promotions.ts:54-56) but the service body **ignores them** — it never reads `promotion.applicableProductIds`/`applicableServiceIds`/`branchId` to scope the discount. It validates active/date/global-usage/per-customer/min-order only. A promo restricted to specific products/branch will validate against any cart. `branchId` arg is also unused (branch-scoped promo not enforced at validation).
persistence: { tenant, table: "promotions.applicable_product_ids / applicable_service_ids / branch_id", where: "promo id", expect: "validation rejects non-applicable items/branch; currently ignored" }

### P2 — `free_item` / `buy_x_get_y` promotion types compute discount as flat `value`  (packages/services/src/promotions.service.ts:151-155)  [partial | testable:true]
`validatePromoCode` only branches on `percentage` and `fixed_amount`; the `else` clause (covering `free_item` and `buy_x_get_y`) returns `discountAmount = promotion.value` as a raw cents discount. There is no free-item selection, no buy-X-get-Y quantity logic. These two enum types are effectively unimplemented and silently behave like a fixed discount.
persistence: { tenant, table: "payment_items.promotionId / sales_orders discount", where: "order", expect: "free-item/BXGY semantics; currently flat value discount" }

### P2 — `products.resolvePrice` has no permission gate  (packages/api/src/routers/products.ts:207)  [implemented | testable:true]
Every other product procedure calls `requirePermissionOrpc(..., "inventory", …)`. `resolvePrice` (line 207-228) calls only `assertOrgContextMatch` + `guardBranchAccessible` — no `requirePermissionOrpc`. Any authenticated tenant member (even without inventory:read) can resolve effective product prices. Likely intentional for POS price lookup, but inconsistent with `listPriceOverrides` which is gated; flag as a deliberate-but-undocumented gap.
persistence: { n/a — read path }

### P2 — transfer-orders `list` ignores RBAC node scoping  (packages/api/src/routers/transfer-orders.ts:16; packages/services/src/transfer-orders.service.ts:44)  [partial | testable:true]
The router `list` handler does NOT pass `context.accessibleNodeIds` to `listTransferOrders` (compare stock-requests.ts:37 which does). The service supports an `accessibleNodeIds` filter (transfer-orders.service.ts:71-77) but it is never supplied, so a scoped member sees all org transfer orders regardless of branch access. RBAC leak.
persistence: { n/a — read path; over-broad visibility }

### P3 — Hard deletes on categories/brands/UoM with no in-use guard  (product-categories.service.ts:78; brands.service.ts:76; units-of-measure.service.ts:77)  [implemented | testable:true]
`deleteProductCategory`/`deleteBrand`/`deleteUom` issue raw `DELETE` with no check that products reference them. `products.brandId`/`categoryId` are nullable FKs (likely `set null`/`restrict`), and `products.uomId` is NOT-NULL referencing UoM — deleting an in-use UoM will either FK-error at runtime (poor UX) or orphan. No soft-delete, no usage count check.
persistence: { tenant, table: "product_categories/brands/units_of_measure", where: "id", expect: "block delete when referenced by products; currently unguarded hard delete" }

### P3 — `upsertProductStock` is effectively orphan / dangerous absolute setter  (packages/services/src/products.service.ts:151)  [implemented | testable:false]
`upsertProductStock` sets `quantity` to an absolute value (not a delta) and is not called by any owned router (only `adjustStock` is wired to `products.adjustStock`). If exposed/used elsewhere it would clobber on-hand without a ledger. No router surface in this domain references it.
persistence: { tenant, table: "product_stock.quantity", where: "product+branch", expect: "no caller in inventory domain" }

### P3 — api-overview.md stale vs goods-receipts router  (zhub/shared/api-overview.md:184-194)  [implemented | testable:false]
Doc lists goods-receipts procedures `create, disputeInvoice, getById, getInvoicePreview, list, listInvoices, markInvoicePaid, update`. Actual router (goods-receipts.ts) has `listForPo, getById, create, cancel, createInvoice, listInvoices, matchInvoice, disputeInvoice, markInvoicePaid, getInvoicePreview`. Discrepancies: doc lists `list` + `update` that **do not exist**; doc omits real `listForPo`, `cancel`, `createInvoice`, `matchInvoice`. Pure documentation drift.
persistence: { n/a — doc }

### P3 — api-overview.md lists transfer-orders procedure names not all matching  (zhub/shared/api-overview.md:541-549)  [implemented | testable:false]
Doc matches actual transfer-orders router (cancel/complete/create/getById/list/markInTransit) — OK. Noted for completeness: stock-requests doc (490-498) matches. Promotions doc lists `apply/create/deactivate/list/update/validate` = matches. Products doc omits `getStock`/`adjustStock` listed but includes them (366-373) — matches. Only goods-receipts (P3 above) is materially stale.
persistence: { n/a — doc }

---

## Summary

- **Stock side-effects are the dominant problem.** Goods receipts (`createReceipt`) correctly write stock through with reversal, but (a) POS sales never decrement stock [P1], (b) the legacy `purchaseOrders.receiveItems` path marks POs received without moving stock and competes with goods-receipts [P1], and (c) there is no stock-movement ledger anywhere [P1].
- **Dead data / dead states:** `product_stock.min_stock_level` (no low-stock automation), UoM `conversionFactor`/`baseUomId` (never applied to quantity math, no conversions router), and PO enum value `ordered` (never reachable) [P1/P2].
- **Lifecycle integrity:** stock-request and transfer-order transitions have no current-status guards, so `fulfill`/`complete` are idempotency hazards that can double-move inventory; PO receive accepts a draft PO [P2].
- **Promotions are partial:** `validatePromoCode` ignores product/service applicability and branch scoping, and `free_item`/`buy_x_get_y` types degrade to a flat discount [P2].
- **RBAC/permission inconsistencies:** `transfer-orders.list` drops `accessibleNodeIds` (over-broad visibility) and `products.resolvePrice` has no permission gate [P2]; categories/brands/UoM use unguarded hard deletes [P3]; api-overview is stale for goods-receipts [P3].

**Count of `testable:true` findings: 9** (P1 POS stock, P1 PO receiveItems, P2 PO `ordered`, P2 SR/TO status guards, P2 promo applicability, P2 free_item/BXGY, P2 resolvePrice gate, P2 transfer list RBAC, P3 hard-delete guards).
