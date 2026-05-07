# META — Supplier Invoice 3-Way Match

| Field | Value |
|---|---|
| Session ID | 05-07_10-06_supplier-invoices |
| Created | 2026-05-07 |
| Feature area | Area G — Finance / Procurement |
| Status | PLAN (not yet executed) |
| Author | Claude Code (planpro) |

## Scope

Build a UI and API surface to record supplier invoices against Purchase Orders and Goods Receipts, and run the 3-way match (PO total ≈ receipt total ≈ invoice total). All service-layer logic (`createSupplierInvoice`, `markInvoiceMatched`, `listSupplierInvoices`) and the oRPC router procedures already exist — this feature is primarily a UI gap.

## Key files touched

| File | Change type |
|---|---|
| `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx` | Extend — add "Invoices" tab |
| `packages/api/src/routers/goods-receipts.ts` | Extend — add `disputeInvoice`, `markInvoicePaid` procedures |
| `packages/services/src/goods-receipt.service.ts` | Extend — add `disputeInvoice`, `markInvoicePaid` service fns |
| `packages/db/src/schema/tenant/supplier-invoices.ts` | Read-only reference — schema already exists |

## Dependencies

- `supplier_invoices` table — exists (Agent 2.11)
- `goodsReceipts.createInvoice` oRPC procedure — exists
- `goodsReceipts.listInvoices` oRPC procedure — exists
- `goodsReceipts.matchInvoice` oRPC procedure — exists
- `createSupplierInvoice` / `listSupplierInvoices` / `markInvoiceMatched` service functions — all exist

## Risks

- `markInvoiceMatched` throws when match fails — UI must catch and display the mismatch amounts
- No `disputeInvoice` or `markInvoicePaid` service/procedure yet — Phase 2/3 additions
- `supplier_invoices.status` is plain `text`, not an enum — workflow enforcement is purely in service layer
