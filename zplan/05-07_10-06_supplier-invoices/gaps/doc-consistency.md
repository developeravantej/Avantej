# Documentation Consistency Audit — Pass 1

**Auditor:** doc-consistency-auditor  
**Date:** 2026-05-07

---

## 1. File path verification

| Plan reference | Actual path | Status |
|----------------|-------------|--------|
| `packages/db/src/schema/tenant/supplier-invoices.ts` | Exists | ✅ |
| `packages/db/src/generated/tenant-migrations.generated.ts` | Exists | ✅ |
| `packages/services/src/goods-receipt.service.ts` | Exists | ✅ |
| `packages/api/src/routers/goods-receipts.ts` | Exists | ✅ |
| `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx` | Exists | ✅ |
| `docs/TENANT_MIGRATION_WORKFLOW.md` | Exists | ✅ |
| `apps/server/src/tests/integration/goods-receipts.test.ts` | Exists | ✅ |
| `apps/server/src/tests/unit/services/goods-receipt.service.test.ts` | Does NOT exist (new) | ✅ (planned as new) |

## 2. Line number accuracy

| Plan claim | Actual | Status |
|-----------|--------|--------|
| `createSupplierInvoice()` at `goods-receipt.service.ts:381` | Actual: line 381 | ✅ Correct |
| `listSupplierInvoices()` at `goods-receipt.service.ts:402` | Actual: line 402 | ✅ Correct |
| `markInvoiceMatched()` at `goods-receipt.service.ts:308` | Actual: line 308 | ✅ Correct |
| `computeReceiptTotalCents()` at `goods-receipt.service.ts:277` | Actual: line 277 | ✅ Correct |
| `goodsReceiptsRouter.createInvoice` at `goods-receipts.ts:201` | Actual: line 201 | ✅ Correct |
| `goodsReceiptsRouter.listInvoices` at `goods-receipts.ts:252` | Actual: line 252 | ✅ Correct |
| `goodsReceiptsRouter.matchInvoice` at `goods-receipts.ts:291` | Actual: line 291 | ✅ Correct |
| `Service exports` at `services/src/index.ts:361` | Actual: line 361-362 | ✅ Correct |

All line numbers verified exact. ✅

## 3. Phase dependency order

| Dependency | Plan order | Valid? |
|------------|-----------|--------|
| Schema columns → migration → service fns | Phase 1 | ✅ Correct order |
| Service fns → oRPC procedures | Phase 1 → Phase 2 | ✅ Correct |
| oRPC procedures → Frontend | Phase 2 → Phase 3 | ✅ Correct |

## 4. Cross-reference consistency: "5 columns" vs "4 columns"

**FINDING (HIGH):**
- Section 3 "Schema gap" paragraph says: "It does NOT have `disputeReason`, `disputedAt`, `paidAt`, `paidBy`." (4 columns)
- Section 3 "Schema gap" decision says: "Add these four columns" (4 columns)
- Task 1.1 code block shows 4 columns (no `paymentReference`)
- File Change Summary table says: "Add 5 columns: `disputeReason`, `disputedAt`, `paidAt`, `paidBy`, `paymentReference`"
- Q2 says to add `paymentReference` in Task 1.1

The plan is internally inconsistent: Task 1.1 is the canonical implementation step but shows 4 columns while the summary and Q2 agree on 5. Task 1.1 must be updated to include `paymentReference`.

## 5. `@/lib/money` vs `@/lib/amount` reference

Plan Section 7 says: "User inputs in RM decimals; convert with `rmToCents(parseFloat(rmString))` (from `@/lib/money`)."

Verified: `apps/web/src/lib/money.ts` exists and exports `rmToCents(rm: string | number): number`. ✅  
The purchase-orders view.tsx already imports from `@/lib/money` (line 7). ✅ Consistent.

NOTE: MEMORY.md mentions `apps/web/src/lib/amount.ts` was created with `rmToCents`/`centsToRm` in Phase 3. However, `view.tsx` uses `@/lib/money`. The plan is consistent with the purchase-orders file.

## 6. `client.purchaseOrders.getById` usage in RecordInvoiceDialog

Plan Task 3.3 calls `client.purchaseOrders.getById({ organizationId, id: poId })`. Verified:
- `purchaseOrders` router is in baseRouter at index.ts:112
- `getById` procedure confirmed in `packages/api/src/routers/purchase-orders.ts:70`
- The purchase-orders view already uses this call at view.tsx:412

✅ Consistent.

## 7. `client.goodsReceipts.listForPo` usage

Plan Task 3.3 calls `client.goodsReceipts.listForPo({ organizationId, purchaseOrderId: poId })`. Verified:
- `listForPo` exists at `goods-receipts.ts:16`
- Takes `{ organizationId, purchaseOrderId }` ✅

## 8. Journey B / C mismatch — `matchInvoice` status guard

Plan Journey C step 4: "Only pending invoices can be matched" — BUT `markInvoiceMatched()` in the service (line 320) explicitly throws if `status !== "pending"`. Journey B shows a user attempting to re-match a `disputed` invoice ("allow re-match after supplier correction"). This is in direct contradiction with the service guard.

**FINDING (HIGH):** Task 3.4 lists `disputed` invoices as showing "Review Match" button "allow re-match after supplier correction." But `markInvoiceMatched()` only allows `status === "pending"`. Re-matching a disputed invoice would fail at the service level. The plan needs to either:
1. Add a `resetToMatchable()` service function that transitions `disputed → pending` before re-match, OR
2. Update `markInvoiceMatched()` to also accept `disputed` status.

This is a broken journey — disputed invoices cannot be re-matched with current service code.

## 9. Migration "embed" step — workflow reference

Plan Task 1.2 says "Follow `docs/TENANT_MIGRATION_WORKFLOW.md`". The file exists. The plan does not cite specific steps from the workflow document, which is acceptable since it defers to the doc. ✅ No inconsistency.

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| Task 1.1 column count inconsistency (4 vs 5) | HIGH | Yes |
| `disputed` → "Review Match" flow broken vs service guard | HIGH | No (requires design decision) |
