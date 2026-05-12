# GAPS Synthesis — Pass 2

**Date:** 2026-05-07  
**Session:** `zplan/05-07_10-06_supplier-invoices/`

All Pass 1 CRITICAL and HIGH findings have been resolved in the plan. Pass 2 found residual issues:

---

## Medium Findings (fix before implementation)

| # | Finding | Source | Auto-fixable |
|---|---------|--------|--------------|
| P2-M1 | `inArray` import not explicitly listed in Task 1.3 | schema-drift | Yes |
| P2-M2 | Phase 2 header misleading — says "append 3 new" but also updates existing `listInvoices` | doc-consistency, api-surface | Yes |
| P2-M3 | `CanonicalStatus` import not explicitly in Task 3.4 | type-safety | Yes |
| P2-M4 | `listForPo` returns all receipt statuses — `RecordInvoiceDialog` needs client-side `.filter(r => r.status === "posted")` | type-safety | Yes |
| P2-M5 | `paymentReference` persistence not asserted in integration test | test-coverage | Yes (annotate) |
| P2-M6 | `getInvoicePreview` no-PO/no-receipt case not tested | test-coverage | Yes (annotate) |

---

## Low Findings (acceptable for v1 but document)

| # | Finding | Source | Auto-fixable |
|---|---------|--------|--------------|
| P2-L1 | `listSupplierInvoices` has no ORDER BY — indeterminate row order in UI | scalability | Yes |
| P2-L2 | `getInvoicePreview` handler missing try/catch (inconsistent style) | api-surface | Yes |
| P2-L3 | `listInvoices` purchaseOrderId filter not tested | test-coverage | Yes (annotate) |
| P2-L4 | H3 Option 2 should include concurrent guard in `markInvoiceMatched` | scalability | No (conditional) |
| P2-L5 | Verification Step 3 ambiguous ("receive via GR") | doc-consistency | Yes |
| P2-L6 | H3 (markInvoiceMatched guard update) not in File Change Summary | doc-consistency | Yes (conditional) |

---

## Pass 2 Auto-fix Plan

1. **Task 1.3** — add explicit `inArray` import note (P2-M1)
2. **Phase 2 header** — update to "Add three new procedures and update one existing" (P2-M2)
3. **Task 3.4** — add `import { StatusBadge, type CanonicalStatus }` (P2-M3)
4. **Task 3.3** — add `.filter(r => r.status === "posted")` for receipt dropdown (P2-M4)
5. **Testing section** — annotate `paymentReference` persistence assertion (P2-M5)
6. **Testing section** — annotate no-PO/no-receipt preview test (P2-M6)
7. **`listSupplierInvoices`** — add `.orderBy(desc(supplierInvoices.createdAt))` note (P2-L1)
8. **`getInvoicePreview` handler** — add try/catch (P2-L2)
9. **Verification Step 3** — clarify "receive via GR" means the Purchase Orders page ReceiveItemsSheet (P2-L5)
