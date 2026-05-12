# Test Coverage Audit — Pass 2

**Auditor:** test-coverage-auditor  
**Date:** 2026-05-07 (pass 2, post-fixes)

---

## Pass 1 fixes verified

- CRITICAL C3: `disputeInvoice` wrong-status enumeration now annotated ✅
- CRITICAL C4: `markInvoicePaid` wrong-status enumeration now annotated ✅
- CRITICAL C5: Boundary tolerance test now in test section ✅
- CRITICAL C1: Concurrent guard now in test section ✅
- HIGH: `MatchReviewDialog` with `poTotalCents: null` test added ✅

## New findings

### P2-TEST-1 (MEDIUM): `paymentReference` not tested end-to-end

The integration journey `matchInvoice → markInvoicePaid` now includes "(with paymentReference)" annotation. But no test assertion verifies that `paymentReference` is correctly persisted and returned. The test should:
1. Call `markInvoicePaid` with a reference string (e.g., "TXN-12345")
2. Assert `result.paymentReference === "TXN-12345"`

**FINDING (MEDIUM):** Add assertion for `paymentReference` in the integration test.

### P2-TEST-2 (LOW): `listInvoices` with new `purchaseOrderId` filter not tested

The `purchaseOrderId` filter was added to `listInvoices` but no test validates it. Should add:
- `listInvoices({ purchaseOrderId: po.id })` returns only invoices for that PO
- `listInvoices({ purchaseOrderId: otherPoId })` returns empty when no invoices for that PO

**FINDING (LOW):** Add filter test to integration suite.

### P2-TEST-3 (LOW): Concurrent guard test relies on implementation detail

The plan proposes: "simulate calling matchInvoice twice on same invoice, expect second call to throw." In a test environment using a single Bun process and a real DB, this is straightforward to test sequentially (not truly concurrent). The test should:
1. Call `markInvoicePaid` → succeeds
2. Immediately call `markInvoicePaid` again → expects throw "Invoice was already marked paid"

This is a unit-level test via mock DB. For true concurrent testing, a real integration test would require two parallel DB connections. Sequential simulation is sufficient for the optimistic lock pattern. ✅ No action needed, just clarification.

### P2-TEST-4 (MEDIUM): `getInvoicePreview` test — `isWithinTolerance: true` when no PO/receipt

Per the updated logic: if neither PO nor receipt is linked, `mismatches.length === 0` → `isWithinTolerance: true`. This is a silent "pass" that might surprise callers. A test should verify this behavior is intentional and documented.

**FINDING (MEDIUM):** Add test: `getInvoicePreview` with no PO and no receipt → `isWithinTolerance: true`, `poTotalCents: null`, `receiptTotalCents: null`.

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| `paymentReference` persistence not asserted in integration test | MEDIUM | Yes (annotate) |
| `listInvoices` purchaseOrderId filter not tested | LOW | Yes (annotate) |
| `getInvoicePreview` no-PO/no-receipt case not tested | MEDIUM | Yes (annotate) |
