# Schema Drift Audit — Pass 1

**Auditor:** schema-drift-auditor  
**Date:** 2026-05-07

---

## 1. Existing columns — drift check

Current `packages/db/src/schema/tenant/supplier-invoices.ts` has:

| Column | Type | Nullable |
|--------|------|----------|
| id | uuid PK | no |
| invoiceNumber | text | no |
| supplierId | uuid FK → suppliers.id (restrict) | no |
| purchaseOrderId | uuid FK → purchase_orders.id (set null) | yes |
| goodsReceiptId | uuid FK → goods_receipts.id (set null) | yes |
| totalCents | integer | no |
| taxCents | integer default 0 | no |
| invoiceDate | timestamp tz | no |
| dueDate | timestamp tz | yes |
| status | text default 'pending' | no |
| matchedAt | timestamp tz | yes |
| matchedBy | text | yes |
| createdAt | timestamp tz defaultNow | no |

**CONFIRMED:** `disputeReason`, `disputedAt`, `paidAt`, `paidBy`, `paymentReference` do NOT exist. All 5 are safe to add.

## 2. Plan's Task 1.1 — Column count discrepancy

**FINDING (HIGH):** Plan section 3 "Schema gap" and Task 1.1 body list **4 columns** (`disputeReason`, `disputedAt`, `paidAt`, `paidBy`). However:
- The File Change Summary (section at bottom) says **5 columns** including `paymentReference`.
- Q2 in Open Questions recommends adding `paymentReference` as a 5th column.
- Task 1.1 code block does NOT show `paymentReference`.

**Gap:** Task 1.1 code block is incomplete. `paymentReference` must be added to the schema code snippet in Task 1.1.

## 3. Indexes — existing coverage

Existing indexes already cover the plan's implicit requirements:
- `supplier_invoices_po_idx` on `purchaseOrderId` ✅
- `supplier_invoices_receipt_idx` on `goodsReceiptId` ✅
- `supplier_invoices_supplier_idx` on `supplierId` ✅
- `supplier_invoices_number_unique` (uniqueIndex on supplierId + invoiceNumber) ✅

No missing index gaps. Plan does not need to add indexes.

## 4. Status column — plain text vs enum

`status` is `text` (not a Drizzle `pgEnum`). The plan correctly leaves it as text. TypeScript-level validation is in the service layer (status checks via string comparison). No drift.

## 5. Migration sequence

Current latest: `0047_add_composite_indexes`. Plan must generate `0048_supplier_invoice_new_cols` (or similar).

**FINDING (MEDIUM):** Plan says "follow `docs/TENANT_MIGRATION_WORKFLOW.md`" but the workflow file exists as `C:/Project/Avantej/docs/TENANT_MIGRATION_WORKFLOW.md` (confirmed). The plan references it correctly. However, the plan does NOT specify the migration hash or constant name to embed. The pattern from `tenant-migrations.generated.ts` is `{ hash: "0047_add_composite_indexes", sql: ... }`. New migration must follow `0048_...` naming. This should be documented in the plan.

## 6. FK correctness

`supplierId` FK: `suppliers.id` — suppliers table uses `uuid` PK. ✅  
`purchaseOrderId` FK: `purchaseOrders.id` ✅  
`goodsReceiptId` FK: `goodsReceipts.id` ✅  
New columns have no FKs (plain text / timestamps). ✅

## 7. `paymentReference` in `markInvoicePaid` service

Q2 says to add `paymentReference` to the schema AND capture it via a UI field in the "Mark Paid" dialog. But the plan's Task 1.4 `markInvoicePaid()` signature is:
```typescript
markInvoicePaid(tenantDb, invoiceId, paidBy)
```
There is no `paymentReference` parameter. The `markInvoicePaid` procedure's input schema also omits it. **This creates a schema column that can never be written.**

**FINDING (HIGH):** `markInvoicePaid()` and its oRPC procedure must accept `paymentReference?: string` to enable writing the new column.

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| Task 1.1 code snippet missing `paymentReference` | HIGH | Yes |
| `markInvoicePaid` signature missing `paymentReference` param | HIGH | Yes |
| Migration constant naming not specified | MEDIUM | Yes (annotate) |
