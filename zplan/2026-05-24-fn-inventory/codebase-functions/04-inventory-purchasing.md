# Domain 04 — Inventory, Suppliers, Purchasing & Facilities

Audit of 10 routers + 10 services. All procedures are `tenantProcedure` (= protected). Citations are `file:line`. Files audited live under `packages/api/src/routers/` and `packages/services/src/`.

---

## Routers & Procedures

### products (`products.ts`)
| Procedure | Auth | Permission | Purpose | Backing fn |
|-----------|------|-----------|---------|------------|
| `list` | protected | inventory:read | List products w/ filters | `listProducts` |
| `getById` | protected | inventory:read | Get one product | `getProductById` |
| `create` | protected | inventory:create | Create product | `createProduct` |
| `update` | protected | inventory:update | Update product | `updateProduct` |
| `getStock` | protected | inventory:read | Get stock at branch | `getProductStock` |
| `adjustStock` | protected | inventory:update | Manual stock delta | `adjustStock` |
| `resolvePrice` | protected | (none — only org/branch guard) | Resolve effective price | `resolveProductPrice` (pricing.service) |
| `listPriceOverrides` | protected | inventory:read | List branch price rows | `listProductPriceOverrides` |
| `setBranchPrice` | protected | inventory:update | Upsert branch price | `setProductPrice` |
| `expireBranchPrice` | protected | inventory:update | Soft-expire price row | `expireProductPrice` |
| `deleteBranchPrice` | protected | inventory:delete | Hard-delete price row | `deleteProductPrice` |

Note: `resolvePrice` (`products.ts:207`) has **no `requirePermissionOrpc` gate** — only `assertOrgContextMatch` + `guardBranchAccessible`. Possibly intentional (read-only price lookup for POS), but inconsistent with every sibling read which gates `inventory:read`.

### product-categories (`product-categories.ts`)
| Procedure | Auth | Permission | Purpose | Backing fn |
|-----------|------|-----------|---------|------------|
| `list` | protected | inventory:read | List categories | `listProductCategories` |
| `getById` | protected | inventory:read | Get one | `getProductCategoryById` |
| `create` | protected | inventory:create | Create | `createProductCategory` |
| `update` | protected | inventory:update | Update | `updateProductCategory` |
| `delete` | protected | inventory:delete | Hard delete | `deleteProductCategory` |

### suppliers (`suppliers.ts`)
| Procedure | Auth | Permission | Purpose | Backing fn |
|-----------|------|-----------|---------|------------|
| `list` | protected | inventory:read | List suppliers | `listSuppliers` |
| `getById` | protected | inventory:read | Get one | `getSupplierById` |
| `create` | protected | inventory:create | Create | `createSupplier` |
| `update` | protected | inventory:update | Update | `updateSupplier` |
| `deactivate` | protected | inventory:update | Soft-deactivate | `deactivateSupplier` |

### purchase-orders (`purchase-orders.ts`)
| Procedure | Auth | Permission | Purpose | Backing fn |
|-----------|------|-----------|---------|------------|
| `list` | protected | purchase_order_management:read | List POs | `listPurchaseOrders` |
| `getById` | protected | purchase_order_management:read | PO + items | `getPurchaseOrderById` |
| `create` | protected | purchase_order_management:create | Create PO (status=draft) | `createPurchaseOrder` |
| `approve` | protected | purchase_order_management:update | draft→approved | `approvePurchaseOrder` |
| `receiveItems` | protected | purchase_order_management:update | Bump receivedQty, roll status | `receiveItems` |
| `cancel` | protected | purchase_order_management:delete | Cancel draft/approved | `cancelPurchaseOrder` |

### goods-receipts (`goods-receipts.ts`)  — note router key naming `listForPo` vs hub `list`
| Procedure | Auth | Permission | Purpose | Backing fn |
|-----------|------|-----------|---------|------------|
| `listForPo` | protected | purchase_order_management:read | Receipts for a PO | `listReceiptsForPo` |
| `getById` | protected | purchase_order_management:read | Receipt + items | `getReceiptById` |
| `create` | protected | purchase_order_management:update | Post receipt + stock write-through | `createReceipt` |
| `cancel` | protected | purchase_order_management:update | Reverse receipt + stock | `cancelReceipt` |
| `createInvoice` | protected | purchase_order_management:create | Create supplier invoice | `createSupplierInvoice` |
| `listInvoices` | protected | purchase_order_management:read | List supplier invoices | `listSupplierInvoices` |
| `matchInvoice` | protected | purchase_order_management:update | 3-way match | `markInvoiceMatched` |
| `disputeInvoice` | protected | purchase_order_management:update | Raise dispute | `disputeInvoice` |
| `markInvoicePaid` | protected | purchase_order_management:update | Mark matched→paid | `markInvoicePaid` |
| `getInvoicePreview` | protected | purchase_order_management:read | Tolerance preview | `getInvoicePreview` |

### stock-requests (`stock-requests.ts`)
| Procedure | Auth | Permission | Purpose | Backing fn |
|-----------|------|-----------|---------|------------|
| `list` | protected | stock_requests:read | List requests | `listStockRequests` |
| `getById` | protected | stock_requests:read | Request + items | `getStockRequestById` |
| `create` | protected | stock_requests:create | Create (status=pending) | `createStockRequest` |
| `approve` | protected | stock_requests:approve | pending→approved | `approveStockRequest` |
| `reject` | protected | stock_requests:reject | →rejected | `rejectStockRequest` |
| `fulfill` | protected | stock_requests:update | →fulfilled + move stock | `fulfillStockRequest` |

### transfer-orders (`transfer-orders.ts`)
| Procedure | Auth | Permission | Purpose | Backing fn |
|-----------|------|-----------|---------|------------|
| `list` | protected | transfer_orders:read | List transfers | `listTransferOrders` |
| `getById` | protected | transfer_orders:read | Transfer + items | `getTransferOrderById` |
| `create` | protected | transfer_orders:create | Create (status=pending) | `createTransferOrder` |
| `markInTransit` | protected | transfer_orders:update | pending→in_transit | `markInTransit` |
| `complete` | protected | transfer_orders:**approve** | →completed + move stock | `completeTransfer` |
| `cancel` | protected | transfer_orders:update | →cancelled | `cancelTransfer` |

### units-of-measure (`units-of-measure.ts`)
`list` / `getById` (inventory:read), `create` (create), `update` (update), `delete` (delete) → `listUnitsOfMeasure` / `getUomById` / `createUom` / `updateUom` / `deleteUom`.

### brands (`brands.ts`)
`list` / `getById` (inventory:read), `create`, `update`, `delete` → `listBrands` / `getBrandById` / `createBrand` / `updateBrand` / `deleteBrand`.

### rooms (`rooms.ts`)
`list` / `getById` (appointment_management:read), `create` (create), `update` (update), `delete` (**appointment_management:update**, not :delete) → `listRooms` / `getRoomById` / `createRoom` / `updateRoom` / `deleteRoom` (soft-deactivate via `isActive=false`).

---

## Service Functions

### products.service.ts
- `listProducts` — filtered product list.
- `getProductById` — single product or null.
- `createProduct` — insert product (defaults type=product, conversionFactor="1").
- `updateProduct` — partial update.
- `getProductStock` — stock row for product+branch or null.
- `upsertProductStock` — **set absolute** stock qty (ON CONFLICT replaces qty). **ORPHAN** — not exposed by any owned router; only used in tests. Note this *sets* (not adds) and could be used to overwrite — no caller in app code.
- `adjustStock` — atomic `quantity + delta`; inserts row with `quantity=delta` if none. No floor at 0.
- (price fns live in `pricing.service.ts`, not this file — see below.)

### pricing.service.ts (imported by products router; not an owned file but backs owned procedures)
- `resolveProductPrice`, `listProductPriceOverrides`, `setProductPrice`, `expireProductPrice`, `deleteProductPrice` — all exposed via products router. Out-of-scope for deep audit; flagged only where the router gating is inconsistent.

### product-categories.service.ts
- `listProductCategories`, `getProductCategoryById`, `createProductCategory`, `updateProductCategory`, `deleteProductCategory` — all exposed. Delete is a hard delete with **no FK/usage guard** (products reference categoryId).

### suppliers.service.ts
- `listSuppliers`, `getSupplierById`, `createSupplier`, `updateSupplier`, `deactivateSupplier` — all exposed. No `reactivate` (deactivate is one-way via API; `update` can set `isActive:true` though).

### purchase-orders.service.ts
- `generatePONumber` — internal (PO number gen). Not exported as a procedure (helper).
- `listPurchaseOrders`, `getPurchaseOrderById`, `createPurchaseOrder`, `approvePurchaseOrder`, `receiveItems`, `cancelPurchaseOrder` — all exposed.

### goods-receipt.service.ts
- `generateReceiptNumber` — internal helper.
- `createReceipt` — posts receipt, **increments product_stock** (sellable = received − damaged), bumps PO receivedQty, rolls PO status.
- `cancelReceipt` — reverses stock + PO state (posted→cancelled only).
- `getReceiptById`, `listReceiptsForPo` — exposed.
- `computeReceiptTotalCents` — internal (used by match/preview); not directly exposed. Not orphan (consumed internally).
- `markInvoiceMatched`, `createSupplierInvoice`, `listSupplierInvoices`, `disputeInvoice`, `markInvoicePaid`, `getInvoicePreview` — all exposed.
- `DEFAULT_MATCH_TOLERANCE_CENTS` / `_BPS` — exported consts.

### stock-requests.service.ts
- `generateRequestNumber`, `formatDateYYYYMMDD` — internal helpers.
- `listStockRequests`, `getStockRequestById`, `createStockRequest`, `approveStockRequest`, `fulfillStockRequest`, `rejectStockRequest` — all exposed.

### transfer-orders.service.ts
- `generateTransferNumber`, `formatDateYYYYMMDD` — internal helpers.
- `listTransferOrders`, `getTransferOrderById`, `createTransferOrder`, `markInTransit`, `completeTransfer`, `cancelTransfer` — all exposed.

### units-of-measure.service.ts
- `listUnitsOfMeasure`, `getUomById`, `createUom`, `updateUom`, `deleteUom` — all exposed. Delete is hard delete; no guard for products referencing the UoM (`products.uomId` is required).

### brands.service.ts
- `listBrands`, `getBrandById`, `createBrand`, `updateBrand`, `deleteBrand` — all exposed. Hard delete; no guard for products referencing brandId.

### rooms.service.ts
- `listRooms`, `getRoomById`, `createRoom`, `updateRoom`, `deleteRoom` (soft via isActive=false) — all exposed.

---

## Gaps (prioritized)

### P0 — Stock-movement integrity

1. **POS / sales orders never decrement product stock — DEFINITELY BROKEN.**
   `pos.service.ts` and `sales-order.service.ts` contain **zero** references to `adjustStock`/`productStock` (grep returned no matches in either). Goods-receipt and transfer/stock-request fulfilment are the *only* paths that move `product_stock`. So: receiving a PO increments stock, but selling the product through POS does **not** decrement it. Stock will only ever climb (plus manual `products.adjustStock`). Every product sale leaves inventory permanently inflated. This is the single largest integrity hole in the domain.
   - Receipt-increments path is correct: `goods-receipt.service.ts:113-131` (`createReceipt`) and reversal at `:189-205` (`cancelReceipt`).
   - Sale-decrement path: **missing entirely.** No service in the inventory domain is wired to a sale event.

2. **`product_stock.quantity` can go negative — no floor / no CHECK.**
   Schema `product-stock.ts:13` is a plain `integer default 0` with no CHECK ≥ 0. `adjustStock` (`products.service.ts:179-218`) does raw `quantity + delta` with no clamp. `completeTransfer`/`fulfillStockRequest` deduct from source branch unconditionally. A transfer/request from a branch with insufficient stock silently drives quantity negative. (Receipt-reversal at `:212` uses `GREATEST(...,0)` — but the forward sale/transfer paths do not.) Possibly-intentional for receipts-only flow today, but combined with gap #1 it guarantees drift.

3. **`upsertProductStock` is an ORPHAN with overwrite semantics.**
   `products.service.ts:151-177` *sets* an absolute quantity (not additive) and is exposed by no router (only tests). Dead in production but dangerous if later wired without care — it clobbers concurrent deltas.

### P1 — PO → receipt → invoice → payment chain

4. **No PO close/reopen, and no manual "fully received" override.**
   PO status only auto-transitions via `receiveItems` (`purchase-orders.service.ts:245-289`) or `createReceipt`. A PO stuck in `partially_received` (supplier short-ships and won't deliver the rest) has **no procedure to force-close**. `cancel` only allows `draft`/`approved` (`:308`), so a partially-received PO can neither be closed nor cancelled — **dead-end**.

5. **Two parallel receive paths that double-count.**
   `purchaseOrders.receiveItems` (router) and `goodsReceipts.create` *both* bump `purchaseOrderItems.receivedQty` (`purchase-orders.service.ts:255` and `goods-receipt.service.ts:138`). But only `createReceipt` touches `product_stock`. If an operator uses `receiveItems` directly, PO status flips to received/partially_received **with no stock increment** — silent under-count. The legacy `receiveItems` procedure should likely be removed or made to also move stock. DEFINITELY a footgun.

6. **`createSupplierInvoice` does no validation against PO/receipt.**
   `goods-receipt.service.ts:387` inserts an invoice with arbitrary `totalCents`, optional/unverified `purchaseOrderId`/`goodsReceiptId`, and no duplicate-invoice-number guard. `invoiceNumber` uniqueness is not enforced here.

7. **Invoice has no cancel/void; dispute is a dead-end for resolution.**
   `disputeInvoice` sets `disputed`; `markInvoiceMatched` accepts `disputed` again (`:320`) so re-match is possible — good. But there is **no way to void/cancel a supplier invoice** (e.g. issued in error). A disputed invoice that should never be paid has no terminal state other than re-matching then paying.

8. **`markInvoicePaid` requires `matched`; no path to pay an unmatched invoice.**
   `:482` rejects anything but `matched`. If 3-way match legitimately can't pass (e.g. receipt missing) there is no override-to-pay. Possibly-intentional (enforces match discipline) but worth flagging as a hard wall.

### P1 — Stock-requests & transfer-orders lifecycle

9. **`fulfillStockRequest` always sets status `fulfilled`, even on partial fulfilment.**
   `stock-requests.service.ts:156-203` writes `quantityFulfilled` per item then unconditionally sets header `status='fulfilled'` (`:194`). A partial fulfilment (qty < requested) is indistinguishable from full; no `partially_fulfilled` state and no way to fulfil the remainder later. Items not in the `items[]` payload keep `quantityFulfilled=0` but the request is still closed. DEFINITELY incomplete.

10. **Stock-request fulfilment can run on a non-approved request.**
    `fulfillStockRequest` does not check current status — it can be called on `pending` or even `rejected` requests (no guard at `:160`). Bypasses the approve gate; moves stock regardless. The lifecycle approve→fulfill is not enforced server-side.

11. **`approveStockRequest` / `rejectStockRequest` have no status precondition.**
    `:140` and `:205` blind-update to approved/rejected with no check that current status is `pending`. A `fulfilled` request can be flipped back to `rejected`. No row lock / state-machine guard (contrast PO's `.for("update")` + status check at `purchase-orders.service.ts:200-213`).

12. **Stock requests: no cancel; transfer orders: no reject.**
    Stock requests have reject but **no cancel** (requester can't withdraw their own pending request). Transfer orders have cancel but the lifecycle is pending→in_transit→completed with cancel allowed from any state (`cancelTransfer` `:208` has no precondition) — a `completed` transfer can be flipped to `cancelled` **without reversing the stock it already moved**. DEFINITELY broken (orphans the stock movement).

13. **`completeTransfer` uses `transfer_orders:approve` permission while `markInTransit`/`cancel` use `:update`.**
    `transfer-orders.ts:137` gates the stock-moving complete step on the `approve` action — inconsistent and undocumented vs the rest of the router. Likely a copy mismatch; verify intended.

14. **`completeTransfer` deducts `quantityTransferred` from source but adds `quantityReceived` to dest.**
    `transfer-orders.service.ts:184` vs `:190`. If `quantityReceived < quantityTransferred` (shrinkage in transit), the difference vanishes — source loses more than dest gains, which is arguably correct for loss accounting, but there is no record of the shrinkage and no `partially_*` state. Status always becomes `completed`. Flag as possibly-intentional but unlogged.

15. **Transfer status / stock-request status are free-text columns (no enum).**
    `stock-requests.ts:19` and `transfer-orders.ts:18` are `text(...).default("pending")` with no DB enum. Any string passes the `status: z.string()` filter on `list`. Typos / invalid states are not rejected at the DB layer (contrast PO which has a typed enum at `purchase-orders.service.ts:79-86`).

### P2 — Missing CRUD / referential guards

16. **Hard deletes with no referential guard:** `deleteProductCategory` (categories referenced by `products.categoryId`), `deleteUom` (`products.uomId` is **required/NOT NULL** — deleting an in-use UoM will FK-fail or orphan), `deleteBrand` (`products.brandId`). None check for referencing products before deleting. UoM is the worst since uomId is mandatory on products.
17. **Suppliers: no hard delete and no `reactivate` procedure** (only `deactivate`). Re-activation only possible via generic `update isActive:true` — works but undocumented. Minor.
18. **Products: no delete/deactivate procedure** — status can be set to `discontinued` via `update`, which is the intended soft path. OK, but note there's no dedicated procedure (hub lists none either).

### P2 — Dead code / hygiene

19. **Dead import in purchase-orders router.** `purchase-orders.ts:13` imports `requirePermission` from `@avantej-core/services` but it is never called (router uses `requirePermissionOrpc` exclusively; grep for `requirePermission(` → no matches). Lint/cleanup.
20. **Stray malformed-whitespace blocks** (leftover from agent-log removal) litter handler bodies across all 10 routers (e.g. `products.ts:38-44`) — cosmetic, not functional.

### Discrepancies with the API overview (enumerate from `packages/api/src/routers/`)

21. **goods-receipts:** hub lists a procedure `list` (api-overview.md:171) but the router exposes **`listForPo`** (`goods-receipts.ts:20`) — different name and it *requires* a `purchaseOrderId`. Hub also omits the router's **`cancel`**, **`createInvoice`**, and **`matchInvoice`** procedures entirely. Hub is stale/inaccurate for this router.
22. **products:** hub (api-overview.md:329-339) omits the branch-pricing procedures `resolvePrice`, `listPriceOverrides`, `setBranchPrice` that exist in the router (`products.ts:207,230,245`). Hub lists `expireBranchPrice`/`deleteBranchPrice` but not the three above.
23. **purchase-orders:** matches hub exactly.
24. **stock-requests / transfer-orders / suppliers / brands / uom / rooms / product-categories:** procedure names match hub. (rooms `delete` permission gate `appointment_management:update` is an internal detail not contradicted by hub.)
