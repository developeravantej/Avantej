# Documentation Consistency Audit — Pass 2

**Auditor:** doc-consistency-auditor  
**Date:** 2026-05-07 (pass 2, post-fixes)

---

## Pass 1 fixes verified

- Task 1.1 code block now has 5 columns ✅
- Section 3 "Schema gap" says 5 columns ✅
- H3 (disputed re-match broken) annotated in Task 3.4 with design decision ✅
- Migration naming note added ✅

## New findings

### P2-DOC-1 (LOW): Section 3 "Schema gap" paragraph inconsistency

Section 3 now reads: "It does NOT have `disputeReason`, `disputedAt`, `paidAt`, `paidBy`, `paymentReference`."

But the sentence above it (original) still says: "The current schema has: `status`, `matchedAt`, `matchedBy`." This sentence is now accurate as a description of existing columns (does not mention the new ones). ✅ No change needed.

### P2-DOC-2 (MEDIUM): Phase 2 structure mixes new procedures with existing procedure update

The Phase 2 section header says "Append three new procedures to `goodsReceiptsRouter`." But now Phase 2 also contains the `listInvoices` update (Task 2.4) which modifies an existing procedure. The header is misleading.

**FINDING (MEDIUM):** Update Phase 2 header to: "Add three new procedures and update one existing procedure in `goodsReceiptsRouter`."

### P2-DOC-3 (LOW): File Change Summary missing `listSupplierInvoices` service update

The File Change Summary has:
```
packages/services/src/goods-receipt.service.ts | 2 | Add purchaseOrderId filter param to listSupplierInvoices
```
This is correct. ✅

### P2-DOC-4 (LOW): `markInvoiceMatched` guard update for H3 not in File Change Summary

The plan annotates H3 with Option 2 recommendation: "Update `markInvoiceMatched()` guard to also allow `disputed`." But this change is not listed in the File Change Summary. It's presented as a design decision to resolve, not a committed task.

**FINDING (LOW):** If implementer chooses Option 2 for H3, they need to update `markInvoiceMatched()` (existing function) and update its integration test. This should be added to the File Change Summary as a conditional entry.

### P2-DOC-5 (LOW): Verification Step 3 mentions "receive via GR" — confirm GR UI exists

Verification Step 3: "Create a PO → approve → receive via GR → record invoice..."

There is currently no Goods Receipts UI (`view.tsx` doesn't exist for goods receipts — only the router). "Receive via GR" must be done via API call directly or via the existing action on the Purchase Orders page. The Purchase Orders page has a "Receive" button (`receivePoId` state) — this is the ReceiveItemsSheet.

**FINDING (LOW):** Verification Step 3 is correct — the Purchase Orders page has a ReceiveItemsSheet that creates a goods receipt. No change needed but add clarification: "receive via the 'Receive' button on the PO row."

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| Phase 2 header misleading (mixes new + update) | MEDIUM | Yes |
| H3 (markInvoiceMatched guard update) not in File Change Summary | LOW | Yes (annotate) |
| Verification Step 3 ambiguous ("receive via GR") | LOW | Yes |
