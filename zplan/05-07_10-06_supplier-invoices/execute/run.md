# Supplier Invoice 3-Way Match — Execution Summary

**Date:** 2026-05-07  
**Status:** COMPLETE  
**Branch:** feat/package-approval-flow

---

## What Was Done

### Phase 1 — Schema + Service Functions

**Schema change** (`packages/db/src/schema/tenant/supplier-invoices.ts`):
- Added 5 nullable columns: `disputeReason`, `disputedAt`, `paidAt`, `paidBy`, `paymentReference`

**Migration** (`packages/db/src/migrations/tenant/0048_supplier_invoice_new_cols.sql`):
- Created manually (Drizzle's auto-generated migration was discarded — it was a snapshot diff that would have conflicted with existing applied migrations)
- Contains: `ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS ...` for all 5 columns
- Generated `.ts` via `bun gen:migrations`; new hash `0048_supplier_invoice_new_cols` is last in `TENANT_MIGRATIONS`

**Service functions** (`packages/services/src/goods-receipt.service.ts`):
- Added imports: `inArray`, `desc` from `drizzle-orm`
- Updated `markInvoiceMatched`: status guard now allows `["pending", "disputed"]`; added optimistic WHERE clause with `inArray` to prevent concurrent updates
- Updated `listSupplierInvoices`: added `purchaseOrderId` filter, `limit`/`offset` pagination, `ORDER BY createdAt DESC`
- Added `disputeInvoice(tenantDb, { invoiceId, disputeReason })`: sets status `disputed` with optimistic concurrency guard
- Added `markInvoicePaid(tenantDb, invoiceId, paidBy, paymentReference?)`: sets status `paid` with optimistic concurrency guard
- Added `getInvoicePreview(tenantDb, invoiceId)`: returns 3-way comparison data (poTotalCents, receiptTotalCents, invoiceTotalCents, toleranceCents, isWithinTolerance, mismatches[])

### Phase 2 — oRPC Procedures

**Router** (`packages/api/src/routers/goods-receipts.ts`):
- Added imports: `disputeInvoice`, `getInvoicePreview`, `markInvoicePaid`
- Updated `listInvoices` procedure: added `purchaseOrderId`, `limit`, `offset` input fields
- Added `disputeInvoice` procedure (RBAC: `purchase_order_management:update`)
- Added `markInvoicePaid` procedure (RBAC: `purchase_order_management:update`)
- Added `getInvoicePreview` procedure (RBAC: `purchase_order_management:read`)

### Phase 3 — Frontend UI

**Route** (`apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx`):
- Added imports: `FileText` from lucide-react, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from `@/components/ui/tabs`
- Added `invoicePoId` state
- Added `isInvoiceable` logic in actions column (shown for `received` + `partially_received` POs with `canCreate`)
- Added "Invoice" button that opens `RecordInvoiceDialog`
- Wrapped existing PO table in `Tabs` with a second "Supplier Invoices" tab
- Added `InvoiceStatusBadge` helper with `INVOICE_STATUS_MAP` (pending→pending, matched→approved, disputed→cancelled, paid→paid)
- Added `RecordInvoiceDialog`: fetches PO detail + posted receipts, submits `createInvoice`, validates input
- Added `MatchReviewDialog`: fetches `getInvoicePreview`, shows 3-way table, handles approve/dispute with inline error display
- Added `MarkPaidDialog`: accepts optional payment reference, calls `markInvoicePaid`
- Added `SupplierInvoicesTab`: list with status filter, supplier name lookup via supplier map, per-row actions (Review Match for pending/disputed, Mark Paid for matched)

---

## Key Decisions

- **H3 Option 2**: Updated `markInvoiceMatched` to accept both `pending` and `disputed` (no reset-to-pending step needed)
- **Pagination**: Added `limit` (default 50, max 200) and `offset` to `listSupplierInvoices`
- **Migration approach**: Hand-crafted minimal ALTER TABLE migration rather than using Drizzle Kit's snapshot diff (which would have conflicted with existing applied migrations not tracked in Drizzle's journal)

---

## Files Changed

| File | Change |
|---|---|
| `packages/db/src/schema/tenant/supplier-invoices.ts` | +5 columns |
| `packages/db/src/migrations/tenant/0048_supplier_invoice_new_cols.sql` | New migration |
| `packages/db/src/generated/tenant-migrations.generated.ts` | Regenerated with new migration |
| `packages/services/src/goods-receipt.service.ts` | +3 service fns, updated markInvoiceMatched + listSupplierInvoices |
| `packages/api/src/routers/goods-receipts.ts` | +3 procedures, updated listInvoices |
| `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx` | Full tab/dialog UI |

---

## Verification

- `bun check-types`: 0 new errors (287 pre-existing, all in scripts/ and unrelated server files)
- `bun check`: 0 new lint errors from changed files
- Migration hash `0048_supplier_invoice_new_cols` is last entry in `TENANT_MIGRATIONS`
