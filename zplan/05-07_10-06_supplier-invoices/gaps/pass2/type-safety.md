# Type Safety Audit — Pass 2

**Auditor:** type-safety-auditor  
**Date:** 2026-05-07 (pass 2, post-fixes)

---

## Pass 1 fixes verified

- `markInvoicePaid` signature now includes `paymentReference?: string` ✅
- `InvoicePreviewResult.poTotalCents` is now `number | null` ✅
- `InvoiceStatus` union type defined in INVOICE_STATUS_MAP block ✅
- `INVOICE_STATUS_MAP` now typed as `Record<InvoiceStatus, { status: CanonicalStatus; label: string }>` ✅
- Null-branch comparisons in `getInvoicePreview` fully handled ✅

## New findings

### P2-TYPE-1 (MEDIUM): `CanonicalStatus` import not specified in plan

The fixed `INVOICE_STATUS_MAP` uses `CanonicalStatus` type:
```typescript
Record<InvoiceStatus, { status: CanonicalStatus; label: string }>
```

But the plan only says "Import `CanonicalStatus` from `@/components/ui/status-badge`" as a trailing sentence. The frontend task (Task 3.4) doesn't explicitly list this import in the component's import block. An implementer could miss this and get a TypeScript error when `CanonicalStatus` is undefined.

**FINDING (MEDIUM):** Task 3.4 should explicitly list the import:
```typescript
import { StatusBadge, type CanonicalStatus } from "@/components/ui/status-badge";
```

### P2-TYPE-2 (LOW): `inArray` usage in `disputeInvoice` — Drizzle type for status column

`supplierInvoices.status` is a `text` column (not a pgEnum). `inArray(supplierInvoices.status, ["pending", "matched"])` — Drizzle's `inArray` accepts a column and an array of values. For `text` columns, the array values are `string[]`. ✅ No type error.

### P2-TYPE-3 (LOW): `paymentReference: paymentReference ?? null` type in Drizzle `.set()`

`paymentReference` in the schema is `text("payment_reference")` with no `notNull()`, so Drizzle accepts `string | null | undefined`. The `?? null` coercion to `null` is valid. ✅

### P2-TYPE-4 (MEDIUM): `RecordInvoiceDialog` — `goodsReceiptId` state type

Plan Task 3.3 declares `goodsReceiptId: string` as internal state. When no receipt is selected (empty string), the submit call uses:
```typescript
goodsReceiptId: goodsReceiptId || undefined,
```
This is correct — empty string falls back to `undefined`, which the oRPC input accepts as optional. ✅

However, the receipt dropdown populates from `client.goodsReceipts.listForPo(...)`. The return type of `listForPo` includes receipts of all statuses, but plan Journey A says only `posted` receipts should appear. Plan says "dropdown of `posted` receipts."

**FINDING (MEDIUM):** The `listForPo` service function (`listReceiptsForPo`) returns ALL receipts for the PO, not just `posted` ones. The `RecordInvoiceDialog` must filter client-side: `receipts.filter(r => r.status === "posted")`. This filter must be specified in Task 3.3.

### P2-TYPE-5 (LOW): `invoiceDate` and `dueDate` type — string vs Date

Plan Task 3.3:
```typescript
invoiceDate: new Date(invoiceDate).toISOString(),
dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
```

The oRPC input accepts `invoiceDate: z.string().datetime()`. `new Date("2026-01-15").toISOString()` produces `"2026-01-15T00:00:00.000Z"` which passes `z.string().datetime()`. ✅

But when `invoiceDate` is from an `<input type="date">`, it returns `"2026-01-15"` (date-only format). `new Date("2026-01-15")` parses to midnight UTC on that date — correct. ✅

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| `CanonicalStatus` import not explicit in Task 3.4 | MEDIUM | Yes |
| `listForPo` returns all statuses — need `.filter(r => r.status === "posted")` in dialog | MEDIUM | Yes |
