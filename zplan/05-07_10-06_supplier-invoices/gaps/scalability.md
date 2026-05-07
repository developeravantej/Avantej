# Scalability Audit — Pass 1

**Auditor:** scalability-auditor  
**Date:** 2026-05-07

---

## 1. `listInvoices` — missing `purchaseOrderId` filter (server-side)

**FINDING (HIGH):** The existing `listSupplierInvoices()` service and `listInvoices` oRPC procedure only filter by `supplierId` and `status`. There is no `purchaseOrderId` filter.

Plan Journey D and Task 3.4 describe an "Invoices sub-section" per PO row where only that PO's invoices are shown. Currently, the only way to achieve this is to load ALL invoices and filter client-side. For an org with 10 POs × 3 invoices each = 30 invoices, this is fine. For 500 invoices, the entire table is transferred for each PO row expansion.

**Plan acknowledges this in Q4** and recommends adding `purchaseOrderId` filter. The File Change Summary confirms this is in Phase 2. However, the Phase 2 oRPC code blocks do NOT show the updated `listInvoices` input schema.

**Auto-fix:** Add to `listInvoices` input:
```typescript
purchaseOrderId: z.string().uuid().optional(),
```
And to `listSupplierInvoices` service:
```typescript
if (filters.purchaseOrderId)
  conditions.push(eq(supplierInvoices.purchaseOrderId, filters.purchaseOrderId));
```

## 2. Index coverage — `supplier_invoices`

Existing indexes:
- `supplier_invoices_po_idx` on `(purchaseOrderId)` ✅
- `supplier_invoices_supplier_idx` on `(supplierId)` ✅
- `supplier_invoices_receipt_idx` on `(goodsReceiptId)` ✅
- `supplier_invoices_number_unique` on `(supplierId, invoiceNumber)` ✅

**FINDING (LOW):** No index on `(status)`. For `listInvoices(status: "pending")` queries across a growing invoice table, a sequential scan would occur. At < 1000 rows, PostgreSQL typically uses a seq scan anyway. At > 10K rows, an index on `status` would help.

**Recommendation:** Add index on `status` column to the migration. This is a LOW priority for v1 given expected volume.

## 3. Concurrent match race condition — `markInvoiceMatched`

Current implementation:
```
1. SELECT invoice WHERE id = invoiceId       ← status check ("pending")
2. SELECT purchase_order WHERE id = ...       
3. computeReceiptTotalCents(...)              
4. UPDATE supplier_invoices SET status='matched' WHERE id = invoiceId
```

**FINDING (CRITICAL):** There is no row-level lock between step 1 and step 4. Two concurrent requests can both pass the `status !== "pending"` check at step 1 and both proceed to commit a "matched" status.

This is particularly risky because:
- Both users would see the matched state
- `matchedBy` would be overwritten by whichever write lands second
- If the first write matched correctly and the second re-matches, no data corruption — but if tolerances changed between calls, inconsistent state

**Recommended fix** (minimal, no lock required): Change the UPDATE to:
```typescript
.where(and(
  eq(supplierInvoices.id, invoiceId),
  eq(supplierInvoices.status, "pending"),  // optimistic check
))
.returning();
```
Then check: `if (!updated) throw new Error("Invoice was already matched by another user")`.

**Same pattern needed for** `disputeInvoice` and `markInvoicePaid` — both have the same read-then-update gap.

## 4. `getInvoicePreview` — 3 sequential DB queries

`getInvoicePreview` does:
1. `SELECT * FROM supplier_invoices WHERE id = ?`
2. `SELECT totalAmount FROM purchase_orders WHERE id = ?`
3. `SELECT qty, unitCost FROM goods_receipt_items JOIN purchase_order_items WHERE goodsReceiptId = ?`

This is 3 round trips. For v1 (triggered only on user click, not bulk render), this is acceptable. Each query is indexed. No performance issue at current scale.

**Recommendation:** Document that this is acceptable for interactive use only. Do not call from list renders.

## 5. `SupplierInvoicesTab` — supplier name resolution

Plan Task 3.4: fetch `client.suppliers.list({ organizationId })` once, build `Map<id, name>`. Then for each invoice row, do `supplierMap.get(supplierId)`.

**FINDING (LOW):** If an org has > 500 suppliers, this fetch transfers all supplier records. For Phase 1, this is acceptable since orgs typically have < 50 suppliers. However, this pattern should not be extended to member lookups or product lookups without pagination.

**Status:** Acknowledged in plan (Q5). ✅ No action needed for v1.

## 6. `listInvoices` — no pagination

**FINDING (MEDIUM):** `listSupplierInvoices` returns all records matching filters, no `limit`/`offset`. For a global invoice list tab (SupplierInvoicesTab fetches all invoices with no filter), this is unbounded.

Plan Section 7 Performance says: "acceptable for small datasets (< 500 invoices)." The `listInvoices` input schema has no `limit`/`offset` params. There is no `DataTable` pagination set up for the invoice table.

**Recommendation:** Add `limit: z.number().int().positive().optional()` and `offset: z.number().int().nonnegative().optional()` to `listInvoices` input. Wire to the existing `table-pagination.tsx` component. This is a Phase 1 quality bar issue.

**Risk if skipped:** First org to accumulate > 200 invoices will see slow load times; > 1000 will see failures.

## 7. Migration atomicity

Phase 1 adds columns to `supplier_invoices`. The migration is a simple `ALTER TABLE ... ADD COLUMN` for 5 nullable columns. These are `NOT NULL`-free additions, so they are fully backward-compatible and can run without downtime. ✅

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| Concurrent match race — no optimistic lock in UPDATE | CRITICAL | Yes (service code fix) |
| `listInvoices` missing `purchaseOrderId` filter | HIGH | Yes |
| `listInvoices` no pagination | MEDIUM | No (design scope) |
| No status index | LOW | No (future) |
| Supplier name O(n) fetch | LOW | Acknowledged in plan |
