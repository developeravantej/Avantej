# API Surface Audit — Pass 2

**Auditor:** api-surface-auditor  
**Date:** 2026-05-07 (pass 2, post-fixes)

---

## Pass 1 fixes verified

- `markInvoicePaid` oRPC now includes `paymentReference: z.string().optional()` ✅
- `listInvoices` input update block added with `purchaseOrderId` filter ✅
- Import note for `disputeInvoice`, `markInvoicePaid`, `getInvoicePreview` retained ✅

## New findings

### P2-API-1 (MEDIUM): `listInvoices` update is an existing procedure modification, not a new append

The Phase 2 section header says "Append three new procedures to `goodsReceiptsRouter`." But the `listInvoices` update is actually an **edit to an existing procedure**, not an append. The plan's structure now mixes "append" with "edit" in Phase 2 without clearly separating them.

**FINDING (MEDIUM):** The `listInvoices` update should be listed as "Task 2.4 — Update existing `listInvoices` procedure" to distinguish it from the three new procedures (Tasks 2.1–2.3). This prevents an implementer from accidentally appending a second `listInvoices` procedure instead of editing the existing one.

### P2-API-2 (LOW): `getInvoicePreview` — not awaited with `try/catch`

In the `getInvoicePreview` handler:
```typescript
return getInvoicePreview(context.tenantDb, input.invoiceId);
```
There is no `try/catch` wrapping. If `getInvoicePreview` throws (e.g., "Supplier invoice not found"), the error propagates to oRPC unhandled. Other procedures in this file use `try { ... } catch (error) { throw new ORPCError("BAD_REQUEST", ...) }`.

**FINDING (LOW):** For consistency, wrap in try/catch with `BAD_REQUEST` error. NOT a correctness bug (oRPC will handle unhandled throws), but inconsistent style.

### P2-API-3 (LOW): `markInvoiceMatched` concurrent guard NOT in plan

The plan fixed concurrent guards for `disputeInvoice` and `markInvoicePaid` (Task 1.3, 1.4). But the original `markInvoiceMatched()` service function (which is NOT being modified by this plan — it's an existing function) also has the same read-then-update race. The plan does not address this.

**FINDING (LOW — out of scope):** `markInvoiceMatched` has the same concurrency gap. Plan should add a note that a follow-up fix to `markInvoiceMatched` should apply the same optimistic WHERE clause pattern. This is low severity because the existing tests cover the match case and the concurrent scenario is rare in practice.

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| `listInvoices` update not labeled as Task 2.4 | MEDIUM | Yes |
| `getInvoicePreview` handler missing try/catch | LOW | Yes |
| `markInvoiceMatched` concurrent guard not addressed | LOW | No (out of scope) |
