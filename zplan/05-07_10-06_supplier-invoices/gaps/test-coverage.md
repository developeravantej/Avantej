# Test Coverage Audit — Pass 1

**Auditor:** test-coverage-auditor  
**Date:** 2026-05-07

---

## 1. Existing test coverage (goods-receipts domain)

File: `apps/server/src/tests/integration/goods-receipts.test.ts`

| Test | What it covers |
|------|---------------|
| createReceipt -> stock increments + PO rolls to received | ✅ Happy path |
| cancelReceipt -> stock reverts + PO downgrades | ✅ Reversal path |
| 3-way match: PO ≈ receipt ≈ invoice within tolerance | ✅ Match happy path |
| 3-way match fails when drift exceeds tolerance | ✅ Match failure |

No unit test file for `goods-receipt.service.ts` exists (`apps/server/src/tests/unit/services/goods-receipt.service.test.ts` does not exist).

## 2. Acceptance criteria → test mapping

### AC1: Finance can record supplier invoice (Journey A)
- **Unit test needed:** `createSupplierInvoice` already tested indirectly in integration. Plan adds no dedicated unit test for this AC.
- **Integration coverage:** `goods-receipts.test.ts` line: `createSupplierInvoice(...)` called in test 3 and 4.  
- **Status:** Adequate for existing fn. New unit tests for `disputeInvoice`, `markInvoicePaid`, `getInvoicePreview` planned. ✅

### AC2: 3-way match check — `markInvoiceMatched` 3-way tolerance  
- **CRITICAL — existing coverage confirmed:** Both happy path (test 3) and failure path (test 4) are integration-tested. Existing tests check PO=1000¢, receipt=1000¢, invoice=1000¢ (exact match) and drift of 500¢ (fails). **Tolerance edge case NOT tested** — the boundary where `invoice = PO + tol` (exactly at tolerance limit) is missing.
- **Status:** CRITICAL gap — boundary tolerance test missing.

### AC3: `disputeInvoice` — sets disputed status with reason
- **Plan proposes:** Unit test for happy path + wrong-status error.
- **Integration test:** Plan proposes integration test for `createInvoice → getInvoicePreview (mismatch) → disputeInvoice`.
- **Status:** NOT YET TESTED. CRITICAL (financial integrity — wrong-status guard must work).

### AC4: `markInvoicePaid` — only matched invoices can be marked paid
- **Plan proposes:** Unit test happy path + wrong-status error.
- **Integration test:** `createInvoice → getInvoicePreview → matchInvoice → markInvoicePaid`.
- **Status:** NOT YET TESTED. CRITICAL (financial integrity — can't mark disputed/pending as paid).

### AC5: `getInvoicePreview` — returns 3 totals + tolerance + isWithinTolerance
- **Plan proposes:** Unit tests for match / mismatch / no-receipt (2-way).
- **Status:** NOT YET TESTED. HIGH. Missing the 2-way match variant (no goodsReceiptId) test.

### AC6: Invoice status badge visual mapping (`matched`→`approved`, `disputed`→`cancelled`)
- **Plan proposes:** Frontend test for `MatchReviewDialog` renders.
- **FINDING (HIGH):** The plan maps `matched` to `status: "approved"` in `INVOICE_STATUS_MAP`. But `"matched"` is not a `CanonicalStatus` — plan uses the approved badge to represent matched. However `"disputed"` → `"cancelled"` also works because `cancelled` is a CanonicalStatus. This approach works but is semantically misleading. No test validates the mapping.

### AC7: `RecordInvoiceDialog` submits correct cents values
- **Plan proposes:** Frontend test that validates `rmToCents(parseFloat("50.00")) === 5000`.
- **Status:** NOT YET TESTED but adequately planned. LOW risk (pure function, trivially testable).

## 3. CRITICAL gaps not in plan's test section

### CRITICAL-1: `disputeInvoice` wrong-status transition
The service allows disputing `pending` and `matched` invoices. The guard `!["pending","matched"].includes(invoice.status)` must throw for `paid` and `disputed` statuses. The plan's test section mentions "wrong-status error" but does not enumerate which statuses should be tested.

**Recommendation:** Test that disputing a `paid` invoice throws. Test that disputing an already-`disputed` invoice throws.

### CRITICAL-2: `markInvoicePaid` wrong-status transition
The guard `invoice.status !== "matched"` must throw for `pending`, `disputed`, `paid`. Plan mentions "wrong-status error" but does not enumerate.

**Recommendation:** Test that marking `pending` invoice as paid throws. Test idempotent call on already-`paid` invoice throws.

### CRITICAL-3: Concurrent match race condition
Two finance users calling `matchInvoice` for the same invoice simultaneously. The current implementation is:
1. Fetch invoice (status check)
2. Compute receipt total
3. Update status to "matched"

There is no `FOR UPDATE` lock or optimistic concurrency check. Two concurrent calls could both pass the status check (both see `status: "pending"`) and both succeed.

**FINDING (CRITICAL):** No concurrency test is planned. Recommend adding a `WHERE status = 'pending'` condition to the UPDATE statement and checking `updated.length === 0` (no row updated = lost race). This is also a scalability concern (see scalability.md).

### HIGH-1: `listInvoices` without pagination
Plan's section 7 Performance notes `listSupplierInvoices` has no pagination "for Phase 1". No test validates that pagination will not silently fail when added later. No test for empty result set.

## 4. Test file paths

Plan specifies:
- `apps/server/src/tests/unit/services/goods-receipt.service.test.ts` — new, does not exist ✅ (plan creates it)
- No separate integration file — plan extends existing `goods-receipts.test.ts` — **FINDING (LOW):** Plan says "extend existing" but the file might conflict with afterAll cleanup if new test data shares cleanup logic.

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| `markInvoiceMatched` boundary tolerance test missing | CRITICAL | No (add test task to plan) |
| `disputeInvoice` wrong-status enumeration missing | CRITICAL | No (annotate) |
| `markInvoicePaid` wrong-status enumeration missing | CRITICAL | No (annotate) |
| Concurrent match race — no test + no guard | CRITICAL | No (service fix needed) |
| `getInvoicePreview` 2-way match variant missing | HIGH | No (annotate) |
| Status badge mapping validation missing | HIGH | No (annotate) |
