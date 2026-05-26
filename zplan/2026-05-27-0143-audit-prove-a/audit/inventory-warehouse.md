# Audit: inventory-warehouse
**Files inspected:** 9 routers, 8 services
**Findings:** P1: 5, P2: 4, P3: 1, Total: 10

Scope covers PO lifecycle, goods receipts + 3-way match, stock requests, transfer orders, and the products/stock primitives that feed them (suppliers/brands/UoM/categories are CRUD-only — no integrity issues found there beyond what's covered below). All routers correctly call `assertOrgContextMatch` and `requirePermissionOrpc`, so cross-tenant org-id spoofing is contained. The bugs cluster around (a) state-machine gaps on the transfer/request/receipt workflows, (b) missing RBAC branch checks on multi-branch operations, and (c) read-then-write race conditions on stock mutation paths inside transactions that do not row-lock.

## Findings

### IW-01 — Transfer order can move stock between branches the caller cannot see
- **Severity:** P1
- **Status:** missing
- **Testable:** true
- **File:** `packages/api/src/routers/transfer-orders.ts:64-98`
- **Symptom:** `transferOrders.create` accepts arbitrary `fromBranchId` / `toBranchId` UUIDs without any RBAC node check. A staff member scoped to branch A can create a transfer that drains stock out of branch B (which they cannot otherwise read or modify) into any branch C. Once the transfer is `complete()`-d, `adjustStock` writes the deltas regardless.
- **Evidence:**
  ```ts
  create: tenantProcedure
      .input(z.object({
          organizationId: z.string().uuid(),
          dateIssued: z.string().datetime(),
          fromBranchId: z.string().uuid(),
          toBranchId: z.string().uuid(),
          ...
      }))
      .handler(async ({ input, context }) => {
          assertOrgContextMatch(context, input);
          await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "create")
          return createTransferOrder(context.tenantDb, { ... fromBranchId, toBranchId ... });
      }),
  ```
- **Why it's wrong:** Every other write that touches a branch (`purchase-orders.ts:104`, `goods-receipts.ts:81`, `products.ts:178/201/276`) calls `guardBranchAccessible(input.branchId, context.accessibleNodeIds)`. Transfer create skips it entirely. The same router's `complete`/`markInTransit`/`cancel` also skip the branch check, even though `complete` is what actually mutates stock at both branches.
- **Suggested fix (do NOT apply):** Resolve and guard both branches at the router boundary, e.g. `await guardInputBranchForContext(context, input.fromBranchId); await guardInputBranchForContext(context, input.toBranchId);` on `create`. For `markInTransit`/`complete`/`cancel`, fetch the order first and verify the caller's `accessibleNodeIds` covers either `fromBranchId` or `toBranchId`.
- **Owned files (if fix needs them):** `packages/api/src/routers/transfer-orders.ts`
- **Notes:** Reinforces IW-02 — without the source-branch guard, the same-source check there is also a privilege boundary.

### IW-02 — Transfer order accepts fromBranchId === toBranchId (no-op or stock duplication after race)
- **Severity:** P2
- **Status:** missing
- **Testable:** true
- **File:** `packages/api/src/routers/transfer-orders.ts:64-98` and `packages/services/src/transfer-orders.service.ts:101-140`
- **Symptom:** Neither the Zod schema nor the service rejects `fromBranchId === toBranchId`. On `completeTransfer`, the service iterates `adjustStock(-qty)` then `adjustStock(+qty)` against the same `productStock` row. Under serialisable isolation the net is zero, but the service uses no row lock or `FOR UPDATE`, so concurrent transfers against the same branch/product can interleave and corrupt the stock figure.
- **Evidence:**
  ```ts
  // service:177-191
  await adjustStock(tx, transferItem.productId, transfer.fromBranchId, -transferItem.quantityTransferred);
  await adjustStock(tx, transferItem.productId, transfer.toBranchId, item.quantityReceived);
  ```
- **Why it's wrong:** Two `adjustStock` calls within the same tx but against the same `(productId, branchId)` row both issue separate `UPDATE … SET quantity = quantity + delta` statements. Under default `READ COMMITTED`, that's safe within one tx, but the bigger issue is the schema-level oversight: a "transfer" with identical source/destination should be a validation error, not a silent no-op masking other bugs (e.g. caller-supplied `quantityReceived` ≠ `quantityTransferred` would create or destroy stock out of thin air).
- **Suggested fix (do NOT apply):** Add `.refine(d => d.fromBranchId !== d.toBranchId, { message: "...", path: ["toBranchId"] })` to the Zod schema and a defensive check at the top of `createTransferOrder`.
- **Owned files (if fix needs them):** `packages/api/src/routers/transfer-orders.ts`, `packages/services/src/transfer-orders.service.ts`

### IW-03 — completeTransfer has no status guard; can run twice or after cancel, double-deducting stock
- **Severity:** P1
- **Status:** missing
- **Testable:** true
- **File:** `packages/services/src/transfer-orders.service.ts:158-206`
- **Symptom:** `completeTransfer` reads the transfer via `getTransferOrderById` (no row lock), then unconditionally calls `adjustStock(-quantityTransferred)` on the source and `adjustStock(+quantityReceived)` on the destination. No check that `transfer.status === 'in_transit'` (or `'pending'`). Two concurrent `complete` calls — or a `complete` after a `cancel` — both succeed and apply the stock deltas a second time. Also, `cancelTransfer` (line 208) has no status guard either, so it can flip `completed → cancelled` without reversing the stock movement.
- **Evidence:**
  ```ts
  export async function completeTransfer(tenantDb, id, items) {
      const transfer = await getTransferOrderById(tenantDb, id);  // not locked
      if (!transfer) { throw new Error("Transfer order not found"); }
      return tenantDb.transaction(async (tx) => {
          for (const item of items) {
              await tx.update(transferOrderItems).set({ quantityReceived }).where(...);
          }
          for (const item of items) {
              const transferItem = transfer.items.find(...);
              if (transferItem) {
                  await adjustStock(tx, ..., transfer.fromBranchId, -transferItem.quantityTransferred);
                  await adjustStock(tx, ..., transfer.toBranchId, item.quantityReceived);
              }
          }
          const [updated] = await tx.update(transferOrders)
              .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
              .where(eq(transferOrders.id, id))  // no status precondition
              .returning();
          ...
      });
  }
  ```
- **Why it's wrong:** PO `approvePurchaseOrder` / `cancelPurchaseOrder` correctly use `.for("update")` + status precondition (`purchase-orders.service.ts:200-243`). Transfer/stock-request services were never upgraded to that pattern, so they remain TOCTOU-vulnerable. The `quantityReceived` value is also caller-controlled and unbounded — nothing forces `quantityReceived <= quantityTransferred`, so a malicious caller can inflate destination stock arbitrarily.
- **Suggested fix (do NOT apply):** Inside the tx, `SELECT ... FOR UPDATE`, assert `status === 'in_transit'`, then add the `.where(eq(transferOrders.id, id), eq(transferOrders.status, 'in_transit'))` clause to the final UPDATE and throw if 0 rows updated. Validate `quantityReceived <= quantityTransferred` per item.
- **Owned files (if fix needs them):** `packages/services/src/transfer-orders.service.ts`

### IW-04 — fulfillStockRequest is replay-vulnerable; deducts source-branch stock on every call
- **Severity:** P1
- **Status:** missing
- **Testable:** true
- **File:** `packages/services/src/stock-requests.service.ts:156-203`
- **Symptom:** `fulfillStockRequest` reads the request (no lock), then for every item it (a) overwrites `quantityFulfilled` with the caller-supplied value and (b) calls `adjustStock(fromBranchId, -quantityFulfilled)` and `adjustStock(toBranchId, +quantityFulfilled)`. Calling `fulfill` twice for the same request and items deducts the stock twice. There is no status guard (`'approved'` → `'fulfilled'`), so even after the row reaches `'fulfilled'` a third call still mutates stock.
- **Evidence:**
  ```ts
  export async function fulfillStockRequest(tenantDb, id, items) {
      const request = await getStockRequestById(tenantDb, id);
      if (!request) { throw new Error("Stock request not found"); }
      return tenantDb.transaction(async (tx) => {
          for (const item of items) {
              await tx.update(stockRequestItems)
                  .set({ quantityFulfilled: item.quantityFulfilled })
                  .where(eq(stockRequestItems.id, item.itemId));
          }
          if (request.fromBranchId) {
              for (const item of items) {
                  const requestItem = request.items.find((i) => i.id === item.itemId);
                  if (requestItem) {
                      await adjustStock(tx, requestItem.productId, request.fromBranchId!, -item.quantityFulfilled);
                      await adjustStock(tx, requestItem.productId, request.toBranchId, item.quantityFulfilled);
                  }
              }
          }
          ...
          const [updated] = await tx.update(stockRequests)
              .set({ status: "fulfilled", updatedAt: new Date() })
              .where(eq(stockRequests.id, id))  // no status precondition
              .returning();
      });
  }
  ```
- **Why it's wrong:** Same TOCTOU class as IW-03, but worse because `quantityFulfilled` here is also caller-controlled and not bounded by `quantityRequested`. `approveStockRequest` (line 140) and `rejectStockRequest` (line 205) likewise have no status check and can flip `fulfilled → approved` or `rejected → approved`.
- **Suggested fix (do NOT apply):** Add `.where(eq(stockRequests.id, id), eq(stockRequests.status, 'approved'))` on the final UPDATE and throw on 0 rows. Validate `quantityFulfilled <= quantityRequested - already_fulfilled` per item. Apply the same `.where(status = ...)` pattern to `approve` / `reject`.
- **Owned files (if fix needs them):** `packages/services/src/stock-requests.service.ts`

### IW-05 — createReceipt does not verify PO status, PO ownership of item, or over-receipt
- **Severity:** P1
- **Status:** missing
- **Testable:** true
- **File:** `packages/services/src/goods-receipt.service.ts:76-166`
- **Symptom:** `createReceipt` accepts any `purchaseOrderId` and any `purchaseOrderItemId`, posts the receipt, increments `productStock` and bumps `purchase_order_items.received_qty`. There is no check that (a) the PO is in `approved` / `ordered` / `partially_received` (could be `draft`, `cancelled`, or already `received`), (b) the `purchaseOrderItemId` belongs to the supplied `purchaseOrderId` (cross-PO mixing), or (c) the new `receivedQty + quantityReceived <= orderedQty`.
- **Evidence:**
  ```ts
  // service:84-141 — no SELECT of the PO at all
  return tenantDb.transaction(async (tx) => {
      const receiptNumber = await generateReceiptNumber(...);
      const [receipt] = await tx.insert(goodsReceipts).values({ purchaseOrderId, branchId, ..., status: "posted" }).returning();
      ...
      for (const it of params.items) {
          const sellable = it.quantityReceived - (it.quantityDamaged ?? 0);
          if (sellable <= 0) continue;
          await tx.insert(productStock).values({ productId, branchId, quantity: sellable })
              .onConflictDoUpdate({ ..., set: { quantity: sql`${productStock.quantity} + ${sellable}` } });
      }
      for (const it of params.items) {
          await tx.update(purchaseOrderItems)
              .set({ receivedQty: sql`${purchaseOrderItems.receivedQty} + ${it.quantityReceived}` })
              .where(eq(purchaseOrderItems.id, it.purchaseOrderItemId));  // no PO scope
      }
  ```
- **Why it's wrong:** A caller can (1) over-receive against a PO — driving `received_qty` past `ordered_qty` and inflating stock, (2) receive against a cancelled or draft PO, (3) attach a `purchaseOrderItemId` from PO-A to a receipt for PO-B (the UPDATE in line 134-141 only filters on item id). The PO status roll-up at the end of the function will then write nonsense status onto whatever PO `params.purchaseOrderId` was supplied. Note: prior audit OF-01 fixed the `legacy` `receiveItems` PO advance, but did not add these preconditions on the canonical `createReceipt` path.
- **Suggested fix (do NOT apply):** At the top of the tx, `SELECT po.status FROM purchase_orders WHERE id = ? FOR UPDATE`; reject if not in `{approved, ordered, partially_received}`. Fetch all `purchaseOrderItems` for the PO and assert every `purchaseOrderItemId` in `params.items` is in that set. Per item, assert `receivedQty + quantityReceived <= orderedQty`.
- **Owned files (if fix needs them):** `packages/services/src/goods-receipt.service.ts`

### IW-06 — legacy receiveItems on PO has no status check, no item-PO scope, no over-receive guard
- **Severity:** P2
- **Status:** partial (OF-01 fixed PO status advance; preconditions still missing)
- **Testable:** true
- **File:** `packages/services/src/purchase-orders.service.ts:245-289`
- **Symptom:** Mirrors IW-05 for the legacy `purchaseOrders.receiveItems` path: no PO status check before incrementing `receivedQty`, no assertion that `itemId` belongs to `purchaseOrderId`, no upper bound on the sum.
- **Evidence:**
  ```ts
  export async function receiveItems(tenantDb, purchaseOrderId, receivedItems) {
      return tenantDb.transaction(async (tx) => {
          for (const item of receivedItems) {
              await tx.update(purchaseOrderItems)
                  .set({ receivedQty: sql`${purchaseOrderItems.receivedQty} + ${item.receivedQty}` })
                  .where(eq(purchaseOrderItems.id, item.itemId));  // no PO scope
          }
          ...
      });
  }
  ```
- **Why it's wrong:** This procedure does not touch `productStock` (unlike `createReceipt`), so the immediate damage is "smaller", but it still corrupts the PO status machine: a caller can flip any PO to `received` by inflating `receivedQty` past `orderedQty` via a `purchaseOrderItemId` from a different PO.
- **Suggested fix (do NOT apply):** Same pattern as IW-05 — `FOR UPDATE` on the PO, assert status, scope the item UPDATE to `and(eq(id, itemId), eq(purchaseOrderId, ...))`, and clamp `receivedQty` to `orderedQty` (or reject the call).
- **Owned files (if fix needs them):** `packages/services/src/purchase-orders.service.ts`

### IW-07 — adjustStock has no non-negative guard; stock can go below zero
- **Severity:** P2
- **Status:** missing
- **Testable:** true
- **File:** `packages/services/src/products.service.ts:179-218`
- **Symptom:** `adjustStock(productId, branchId, delta)` issues `UPDATE product_stock SET quantity = quantity + delta` unconditionally. No `WHERE quantity + delta >= 0`, no precondition. `transferOrderItems.quantityTransferred` / `stockRequestItems.quantityFulfilled` flow straight in with arbitrary positive caller values, and nothing prevents oversell. If the row doesn't exist, the function falls back to `INSERT` with `quantity: delta` — which means a negative `delta` against a non-existent row creates a row with a negative quantity.
- **Evidence:**
  ```ts
  const [updated] = await tenantDb
      .update(productStock)
      .set({ quantity: sql`${productStock.quantity} + ${delta}`, updatedAt: new Date() })
      .where(and(eq(productStock.productId, productId), eq(productStock.branchId, branchId)))
      .returning();
  if (updated) return updated;
  // No existing record - insert with delta as initial quantity
  const [row] = await tenantDb.insert(productStock).values({ productId, branchId, quantity: delta }).returning();
  ```
- **Why it's wrong:** Inventory accounting silently allowing negative stock is a P2 integrity bug — POS/sale/transfer audits later read those values as authoritative. The two callers (`transfer-orders.service.ts:180`, `stock-requests.service.ts:179`) feed in caller-supplied numbers without clamping.
- **Suggested fix (do NOT apply):** For `delta < 0`, atomically gate with `.where(and(eq(productId, ...), eq(branchId, ...), gte(productStock.quantity, sql`${-delta}`)))` and throw if no row updated. Refuse to insert when `delta < 0`.
- **Owned files (if fix needs them):** `packages/services/src/products.service.ts`

### IW-08 — listStockRequests RBAC filter is one-sided (drops requests originating at the caller's branch)
- **Severity:** P2
- **Status:** partial
- **Testable:** true
- **File:** `packages/services/src/stock-requests.service.ts:71-76` and `packages/api/src/routers/stock-requests.ts:33-39`
- **Symptom:** When `accessibleNodeIds` is set, `listStockRequests` filters rows where `accessibleNodeIds.includes(row.toBranchId)` — only the destination. Staff at the source branch (`fromBranchId`) who actually need to fulfil the request cannot see the requests they are supposed to act on. Contrast with `listTransferOrders` (line 71-77), which checks both ends.
- **Evidence:**
  ```ts
  // stock-requests.service.ts
  if (accessibleNodeIds && accessibleNodeIds.length > 0) {
      return rows.filter((row) => accessibleNodeIds.includes(row.toBranchId));
  }
  ```
- **Why it's wrong:** Inconsistent with the sibling transfer-orders implementation. Source-branch staff are silently locked out of the fulfill workflow even though the API explicitly accepts `fromBranchId` as a filter (line 60-62). Note: this is a missing-data issue rather than a privilege escalation — it errs safe — so P2.
- **Suggested fix (do NOT apply):** Mirror the transfer-orders pattern: `rows.filter(r => accessibleNodeIds.includes(r.toBranchId) || (r.fromBranchId && accessibleNodeIds.includes(r.fromBranchId)))`.
- **Owned files (if fix needs them):** `packages/services/src/stock-requests.service.ts`

### IW-09 — stock-request create skips branch RBAC check on toBranchId and fromBranchId
- **Severity:** P2
- **Status:** missing
- **Testable:** true
- **File:** `packages/api/src/routers/stock-requests.ts:65-101`
- **Symptom:** `stockRequests.create` accepts any `toBranchId` / `fromBranchId` without calling `guardBranchAccessible` / `guardInputBranchForContext`. A staff scoped to branch A can create a request that, once fulfilled, drains branch B into branch C. The fulfill path (IW-04) also has no branch guard at the router (`stock-requests.ts:139-161`).
- **Evidence:**
  ```ts
  create: tenantProcedure
      .input(z.object({ organizationId, ..., fromBranchId: z.string().uuid().optional(), toBranchId: z.string().uuid(), ... }))
      .handler(async ({ input, context }) => {
          assertOrgContextMatch(context, input);
          await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "create")
          return createStockRequest(context.tenantDb, { ... fromBranchId, toBranchId ... });
      }),
  ```
- **Why it's wrong:** Same omission pattern as IW-01 but on a different router. Combined with IW-04 this is exploitable, hence still P2 (not P1) only because the request must reach `approved` before stock actually moves.
- **Suggested fix (do NOT apply):** `await guardInputBranchForContext(context, input.toBranchId); if (input.fromBranchId) await guardInputBranchForContext(context, input.fromBranchId);` on create. Also add `guardBranchAccessible` on `approve` / `fulfill` / `reject` after loading the request.
- **Owned files (if fix needs them):** `packages/api/src/routers/stock-requests.ts`

### IW-10 — products router duplicates assertOrgContextMatch (dead code, no functional bug)
- **Severity:** P3
- **Status:** missing
- **Testable:** false
- **File:** `packages/api/src/routers/products.ts:174-180`, `:197-203`, `:269-277`
- **Symptom:** `getStock`, `adjustStock`, and `setBranchPrice` each call `assertOrgContextMatch(context, input)` twice in a row (once before the permission check, once after).
- **Evidence:**
  ```ts
  // getStock
  assertOrgContextMatch(context, input);
  await requirePermissionOrpc(context.tenantDb, context.member, "inventory", "read")
  assertOrgContextMatch(context, input);   // <-- duplicate
  guardBranchAccessible(input.branchId, context.accessibleNodeIds);
  ```
- **Why it's wrong:** Harmless (the second call is a no-op when the first already passed) but signals a copy-paste during the audit-prove iteration. Worth tidying.
- **Suggested fix (do NOT apply):** Delete the second `assertOrgContextMatch` line in each of the three handlers.
- **Owned files (if fix needs them):** `packages/api/src/routers/products.ts`
- **Notes:** Includes no security risk; flagged only to keep the diff clean.

---

## Summary

10 findings recorded; 5 P1, 4 P2, 1 P3. The top P1 issue is **IW-03 (`completeTransfer` has no status guard or row lock and accepts arbitrary `quantityReceived`)** — a caller can replay `complete` against the same transfer order to double-deduct source stock and inflate destination stock, or pass `quantityReceived > quantityTransferred` to mint stock. IW-04 (`fulfillStockRequest`) and IW-05 (`createReceipt` missing PO preconditions) are the same class of TOCTOU + unbounded-quantity bug on the other two inventory-mutation paths. IW-01 (transfer create skips branch RBAC) and IW-07 (`adjustStock` allows negative quantities) are the load-bearing pre-conditions that make all three exploitable in practice. Recommend fixing IW-07 + IW-03 first since they cover the largest blast radius across the domain.
