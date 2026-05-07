# Type Safety Audit — Pass 1

**Auditor:** type-safety-auditor  
**Date:** 2026-05-07

---

## 1. `DisputeInvoiceParams` type

Plan proposes:
```typescript
export type DisputeInvoiceParams = {
  invoiceId: string;
  disputeReason: string;
};
```

- `disputeReason` is `string` (required, not optional). Service uses `params.disputeReason` to write to DB. ✅
- `invoiceId` is `string` — should be UUID but typed as `string`. Matches existing service patterns (`markInvoiceMatched` also uses `string`). ✅ Consistent.
- Column is `text("dispute_reason")` (nullable in DB) but service always writes a non-null value when called. ✅

## 2. `markInvoicePaid` parameters

Plan proposes:
```typescript
markInvoicePaid(tenantDb: TenantDb, invoiceId: string, paidBy: string)
```

- `paidBy` maps to `text("paid_by")` — nullable DB column, always written. ✅
- **FINDING (HIGH):** `paymentReference` is planned as a new column (per schema-drift.md) but is NOT in the function signature. This creates a column that is added to schema but can never be written by the service.

**Fix:** Change signature to:
```typescript
markInvoicePaid(tenantDb: TenantDb, invoiceId: string, paidBy: string, paymentReference?: string)
```
And add to `set({ ... paymentReference })` in the update.

## 3. `InvoicePreviewResult` type

Plan proposes:
```typescript
export type InvoicePreviewResult = {
  poTotalCents: number;
  receiptTotalCents: number | null;  // null if no receipt linked
  invoiceTotalCents: number;
  toleranceCents: number;
  isWithinTolerance: boolean;
  mismatches: string[];
};
```

- All amounts are `number` (integer cents). ✅
- `receiptTotalCents: number | null` correctly models optional receipt. ✅
- `mismatches: string[]` can be empty when within tolerance. ✅
- The `isWithinTolerance: boolean` is derived from `mismatches.length === 0` — consistent. ✅

**FINDING (MEDIUM):** `poTotalCents: number` — when `purchaseOrderId` is null on the invoice, the code sets `poTotalCents = 0`. This is silently wrong; a 0 PO total with any invoice amount will always be "out of tolerance" unless the invoice is also 0. The return type should be `poTotalCents: number | null` to signal to callers that no PO is linked.

**Recommendation:** Change to `poTotalCents: number | null` and handle `null` in the frontend comparison table ("N/A" instead of "RM 0.00").

## 4. `getInvoicePreview` tolerance constants reference

Plan code uses:
```typescript
const tol = Math.max(
  DEFAULT_MATCH_TOLERANCE_CENTS,
  Math.floor((poTotalCents * DEFAULT_MATCH_TOLERANCE_BPS) / 10_000),
);
```

- `DEFAULT_MATCH_TOLERANCE_CENTS = 100` ✅ (exported from service file)
- `DEFAULT_MATCH_TOLERANCE_BPS = 100` ✅ (exported from service file)
- These are already defined at top of `goods-receipt.service.ts` — no re-import needed. ✅
- **FINDING (MEDIUM):** When `poTotalCents = 0` (no PO linked), `Math.floor(0 * 100 / 10_000) = 0`. `Math.max(100, 0) = 100`. So tolerance is correctly 100¢ even for no-PO case. But the tolerance is computed against a PO total of 0, making the whole comparison meaningless. Consistent with the `poTotalCents: number | null` issue above.

## 5. Zod schema — integer validation

Plan's `createInvoice` oRPC already uses `z.number().int().nonnegative()` for `totalCents` and `taxCents`. ✅

Plan's new `disputeInvoice` uses `z.string().min(1, "Dispute reason is required")` for reason. ✅  
Plan's new `markInvoicePaid` uses `z.string().uuid()` for IDs. ✅

**FINDING (LOW):** `disputeInvoice` input has `reason: z.string().min(1)` in the router but the service param is `disputeReason: string`. The mapping in the handler correctly maps `input.reason → { disputeReason: input.reason }`. ✅ But naming inconsistency (API calls it `reason`, service calls it `disputeReason`) could confuse implementers. Not a bug.

## 6. Nullable optional FK column guards

In `getInvoicePreview`:
```typescript
if (invoice.purchaseOrderId) {
  // fetch PO
}
if (invoice.goodsReceiptId) {
  receiptTotalCents = await computeReceiptTotalCents(...)
}
```
Both optional FKs are correctly guarded before use. ✅

## 7. `INVOICE_STATUS_MAP` type safety

Plan Task 3.4 proposes:
```typescript
const INVOICE_STATUS_MAP = {
  pending:  { status: "pending",  label: "Pending" },
  matched:  { status: "approved", label: "Matched" },
  disputed: { status: "cancelled", label: "Disputed" },
  paid:     { status: "paid",     label: "Paid" },
} as const;
```

**FINDING (CRITICAL):** The `StatusBadge` component's `CanonicalStatus` type does NOT include `"matched"` or `"disputed"`. The mapping correctly aliases them to valid CanonicalStatuses (`"approved"` and `"cancelled"`). However this means the map key is typed as `string` but the value `.status` is typed as `CanonicalStatus`. If this map is used as `INVOICE_STATUS_MAP[invoice.status]`, TypeScript will error because `invoice.status` (type `string`) does not narrow to the map key.

**Required:** The invoice status from the server should be typed as a union literal type, not raw `string`. Consider:
```typescript
type InvoiceStatus = "pending" | "matched" | "disputed" | "paid";
```
And use `INVOICE_STATUS_MAP[row.status as InvoiceStatus]` with a fallback.

**Alternatively** (cleaner): Use `StatusBadge` directly with the mapped value:
```typescript
const statusEntry = INVOICE_STATUS_MAP[row.status as InvoiceStatus] ?? { status: "pending", label: row.status };
<StatusBadge status={statusEntry.status} label={statusEntry.label} />
```

## 8. `rmToCents(parseFloat(totalRM))` in RecordInvoiceDialog

Plan Task 3.3 uses `rmToCents(parseFloat(totalRM))`. The actual `money.ts` signature is:
```typescript
export function rmToCents(rm: string | number): number
```
So `rmToCents(parseFloat(totalRM))` is valid — passes a `number`. ✅

However `parseFloat("")` returns `NaN`, and `rmToCents(NaN)` will produce `NaN`. The plan's validation checks `totalRM > 0` — this comparison with `NaN` returns `false`, so empty string would be blocked. ✅ Edge case handled by validation.

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| `markInvoicePaid` missing `paymentReference` in signature | HIGH | Yes |
| `poTotalCents: number` should be `number \| null` for no-PO case | MEDIUM | Yes |
| `InvoiceStatus` union type missing (string indexing of status map) | CRITICAL | Yes |
| Tolerance computation with null PO total | MEDIUM | No (design) |
