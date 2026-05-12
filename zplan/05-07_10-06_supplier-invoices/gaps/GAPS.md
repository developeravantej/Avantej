# GAPS Synthesis — Pass 1

**Date:** 2026-05-07  
**Session:** `zplan/05-07_10-06_supplier-invoices/`

---

## Critical Findings (must fix before implementation)

| # | Finding | Source | Auto-fixable |
|---|---------|--------|--------------|
| C1 | **Concurrent match race** — `markInvoiceMatched`, `disputeInvoice`, `markInvoicePaid` all use read-then-update without row lock or optimistic WHERE clause. Two users can double-match the same invoice. | scalability, test-coverage | Yes (service) |
| C2 | **`InvoiceStatus` not typed** — `INVOICE_STATUS_MAP` is keyed by raw `string` but invoice status arrives from DB as `string`. TypeScript will error when indexing the map with `row.status`. | type-safety | Yes (plan annotation) |
| C3 | **`disputeInvoice` wrong-status guard gap** — plan's test section doesn't enumerate which statuses should throw. Both `paid` and `disputed` inputs must be tested; integration test journey for dispute path is CRITICAL for financial integrity. | test-coverage | No (annotate tests) |
| C4 | **`markInvoicePaid` wrong-status guard gap** — same as C3. `pending` and `disputed` inputs must throw. | test-coverage | No (annotate tests) |
| C5 | **`markInvoiceMatched` tolerance boundary test missing** — existing integration tests only cover exact match and large drift (25%). The boundary case (`invoice = PO + tol`) is untested. | test-coverage | No (add test task) |

---

## High Findings (fix before implementation)

| # | Finding | Source | Auto-fixable |
|---|---------|--------|--------------|
| H1 | **Task 1.1 missing `paymentReference`** — code snippet shows 4 columns; File Change Summary and Q2 agree on 5. Task 1.1 must add `paymentReference text("payment_reference")`. | schema-drift, doc-consistency | Yes |
| H2 | **`markInvoicePaid` signature missing `paymentReference`** — schema column added but service fn and oRPC input never write it. Service signature and Zod schema must include `paymentReference?: string`. | schema-drift, api-surface, type-safety | Yes |
| H3 | **Disputed → Re-match journey broken** — Task 3.4 shows "Review Match" button for `disputed` invoices, but `markInvoiceMatched()` service guard throws if `status !== "pending"`. Re-matching a disputed invoice will always fail. Needs either a `resetToMatchable()` transition or service guard update. | doc-consistency | No (design) |
| H4 | **`listInvoices` purchaseOrderId filter missing from Phase 2 body** — mentioned in Q4 and File Change Summary but the Phase 2 oRPC code blocks don't show the updated input. | api-surface, scalability | Yes |
| H5 | **`poTotalCents: number` should be `number \| null`** — when no PO linked, function returns `0` which silently makes match comparison meaningless. Type and caller must handle null. | type-safety | Yes |

---

## Medium Findings

| # | Finding | Source | Auto-fixable |
|---|---------|--------|--------------|
| M1 | Migration constant naming not specified — plan should note new hash will be `0048_supplier_invoice_new_cols`. | schema-drift | Yes (annotate) |
| M2 | `listInvoices` has no pagination — global tab will grow unbounded. Plan acknowledges but no limit/offset params planned. | scalability | No (scope) |
| M3 | `getInvoicePreview` tolerance with null PO — tolerance still computes (defaults to 100¢) but comparison against 0 PO total is meaningless. | type-safety | No (design) |

---

## Low Findings

| # | Finding | Source | Auto-fixable |
|---|---------|--------|--------------|
| L1 | No `status` index on `supplier_invoices` | scalability | Future |
| L2 | `reason` vs `disputeReason` naming inconsistency (oRPC vs service layer) | type-safety | No (acceptable) |
| L3 | Supplier name O(n) fetch acceptable for v1 | scalability | Acknowledged |

---

## Pass 1 Auto-fix Plan

The following changes will be applied to `plan/plan.md`:

1. **Task 1.1** — add `paymentReference: text("payment_reference")` to schema snippet (fixes H1)
2. **Task 1.4** — add `paymentReference?: string` to `markInvoicePaid` signature and update `.set({})` (fixes H2)
3. **Phase 2 `markInvoicePaid`** — add `paymentReference: z.string().optional()` to Zod input (fixes H2)
4. **Phase 2** — add `listInvoices` input update with `purchaseOrderId` filter block (fixes H4)
5. **Service functions** — add optimistic concurrent update WHERE clause to `markInvoiceMatched`, `disputeInvoice`, `markInvoicePaid` (fixes C1)
6. **Type-safety** — add `type InvoiceStatus` and annotate `INVOICE_STATUS_MAP` usage (fixes C2)
7. **`InvoicePreviewResult`** — change `poTotalCents: number` to `number | null` (fixes H5)
8. **Migration annotation** — add `0048_...` naming note (fixes M1)
9. **Test section** — annotate CRITICAL wrong-status test cases for C3, C4 (annotate, not auto-fix)
10. **Task 3.4** — annotate H3 (disputed re-match broken) as a design decision to resolve
