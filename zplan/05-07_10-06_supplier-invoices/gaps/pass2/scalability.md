# Scalability Audit — Pass 2

**Auditor:** scalability-auditor  
**Date:** 2026-05-07 (pass 2, post-fixes)

---

## Pass 1 fixes verified

- `listInvoices` now has `purchaseOrderId` filter ✅
- `disputeInvoice` has optimistic concurrent update guard ✅
- `markInvoicePaid` has optimistic concurrent update guard ✅

## New findings

### P2-SCALE-1 (LOW): `markInvoiceMatched` concurrent guard still missing

The existing `markInvoiceMatched()` function (not modified in this plan) still lacks the optimistic WHERE clause. The plan annotates H3 with Option 2 (also allow `disputed` status in `markInvoiceMatched`), but if that change is made, it also introduces an opportunity to add the concurrent guard.

**FINDING (LOW):** If H3 Option 2 is chosen, the `markInvoiceMatched` WHERE clause should be updated to:
```typescript
.where(and(
  eq(supplierInvoices.id, invoiceId),
  inArray(supplierInvoices.status, ["pending", "disputed"]),
))
```
This guards against concurrent match calls too. Should be in the plan's H3 resolution block.

### P2-SCALE-2 (LOW): `SupplierInvoicesTab` query key `["supplierInvoices", organizationId]`

The plan uses this query key for both the global list and per-PO invalidation. After adding `purchaseOrderId` filter to `listInvoices`, the global list (`{ organizationId }`) and per-PO list (`{ organizationId, purchaseOrderId }`) will share the same query key base. When `disputeInvoice` or `markInvoicePaid` invalidates `["supplierInvoices", organizationId]`, it will invalidate both the global list AND all per-PO lists (since TanStack Query prefix-matches). This is acceptable — slightly over-invalidates but never under-invalidates. ✅ No action needed.

### P2-SCALE-3 (LOW): No `createdAt` ordering in `listSupplierInvoices`

The current `listSupplierInvoices` has no ORDER BY. Drizzle returns rows in indeterminate order. The invoice list table will appear in random order.

**FINDING (LOW):** Add `.orderBy(desc(supplierInvoices.createdAt))` to `listSupplierInvoices`. This requires `desc` import from `drizzle-orm`. Without ordering, the UI will show invoices in different order on each refresh which is poor UX for an invoice list.

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| `listSupplierInvoices` has no ORDER BY | LOW | Yes |
| `markInvoiceMatched` concurrent guard still missing | LOW | No (out of scope) |
