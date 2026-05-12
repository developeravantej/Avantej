# API Surface Audit — Pass 1

**Auditor:** api-surface-auditor  
**Date:** 2026-05-07

---

## 1. Existing procedures — verified

File: `packages/api/src/routers/goods-receipts.ts`

| Procedure | Line | RBAC | Status |
|-----------|------|------|--------|
| `listForPo` | 16 | `purchase_order_management:read` | ✅ exists |
| `getById` | 51 | `purchase_order_management:read` | ✅ exists |
| `create` | 92 | `purchase_order_management:update` | ✅ exists |
| `cancel` | 157 | `purchase_order_management:update` | ✅ exists |
| `createInvoice` | 201 | `purchase_order_management:create` | ✅ exists |
| `listInvoices` | 252 | `purchase_order_management:read` | ✅ exists |
| `matchInvoice` | 291 | `purchase_order_management:update` | ✅ exists |

**CONFIRMED:** `disputeInvoice`, `markInvoicePaid`, `getInvoicePreview` do NOT exist. Safe to add.

## 2. `goodsReceiptsRouter` in `baseRouter`

Confirmed at `packages/api/src/routers/index.ts:113`:
```
goodsReceipts: goodsReceiptsRouter,
```
✅ No additional registration needed.

## 3. Plan line number accuracy

Plan says:
- `createInvoice` at `goods-receipts.ts:201` → **CORRECT** (line 201)
- `listInvoices` at `goods-receipts.ts:252` → **CORRECT** (line 252)
- `matchInvoice` at `goods-receipts.ts:291` → **CORRECT** (line 291)

## 4. New procedure RBAC analysis

| Procedure | Plan RBAC | Verdict |
|-----------|-----------|---------|
| `disputeInvoice` | `purchase_order_management:update` | ✅ Correct |
| `markInvoicePaid` | `purchase_order_management:update` | ✅ Correct |
| `getInvoicePreview` | `purchase_order_management:read` | ✅ Correct |

`purchase_order_management` confirmed as valid resource in `packages/services/src/permission.service.ts:44`. ✅

## 5. `listInvoices` missing `purchaseOrderId` filter

The existing `listInvoices` procedure input only accepts `supplierId` and `status`. Plan Section 8 Q4 identifies this gap and recommends adding `purchaseOrderId` filter to both the service and router. The File Change Summary confirms this is part of Phase 2.

**FINDING (MEDIUM):** The `listInvoices` procedure input schema change is mentioned in the File Change Summary but not in the Phase 2 procedure code blocks. The Phase 2 body only shows 3 new procedures. The `listInvoices` input update is missing from Phase 2.

## 6. `markInvoicePaid` — missing `paymentReference` in oRPC input

Plan's `markInvoicePaid` procedure input:
```typescript
z.object({
  organizationId: z.string().uuid(),
  invoiceId: z.string().uuid(),
})
```
Q2 says to add `paymentReference` as optional text. But the Zod schema for `markInvoicePaid` oRPC procedure does not include it. **Schema column added but never written** (see schema-drift.md finding).

**FINDING (HIGH):** Add `paymentReference: z.string().optional()` to `markInvoicePaid` input schema. Pass to service call.

## 7. `goodsReceipts.listForPo` usage in `RecordInvoiceDialog`

Plan Task 3.3 calls `client.goodsReceipts.listForPo({ organizationId, purchaseOrderId: poId })` to populate the receipt dropdown. This procedure exists ✅ and is already registered.

## 8. `suppliers.list` for name lookup

Plan Task 3.4 calls `client.suppliers.list({ organizationId })`. Confirmed `suppliersRouter` has a `list` procedure at `packages/api/src/routers/suppliers.ts:14` and is registered in `baseRouter` at index.ts:100. ✅

## 9. Service function exports

`packages/services/src/index.ts:361-362` has:
```
export * from "./goods-receipt.service";
```
This barrel export means any new functions added to `goods-receipt.service.ts` are automatically exported. ✅ No separate export line needed.

## 10. Import update in `goods-receipts.ts`

Plan correctly notes imports at top of `goods-receipts.ts` must be updated to add `disputeInvoice`, `markInvoicePaid`, `getInvoicePreview`. Currently the import block has:
```typescript
import { cancelReceipt, createReceipt, createSupplierInvoice, getReceiptById, listReceiptsForPo, listSupplierInvoices, markInvoiceMatched, requirePermission } from "@avantej-core/services";
```
Three new names to add: `disputeInvoice`, `markInvoicePaid`, `getInvoicePreview`. ✅ Plan calls this out correctly.

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| `markInvoicePaid` oRPC input missing `paymentReference` | HIGH | Yes |
| `listInvoices` input update (purchaseOrderId filter) missing from Phase 2 body | MEDIUM | Yes |
