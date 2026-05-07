# Schema Drift Audit — Pass 2

**Auditor:** schema-drift-auditor  
**Date:** 2026-05-07 (pass 2, post-fixes)

---

## Pass 1 fixes verified

- Task 1.1 now shows 5 columns including `paymentReference` ✅
- Migration naming note added (0048_...) ✅
- Section 3 "Schema gap" updated to say 5 columns ✅

## New findings

### P2-SCHEMA-1 (LOW): `paymentReference: text("payment_reference")` placement

Task 1.1 says "Add after `matchedBy`". The logical grouping in the schema is:
- `matchedAt`, `matchedBy` — match audit
- `disputeReason`, `disputedAt` — dispute audit
- `paidAt`, `paidBy`, `paymentReference` — payment audit

The plan's code snippet now has:
```typescript
disputeReason: text("dispute_reason"),
disputedAt: timestamp("disputed_at", { withTimezone: true }),
paidAt: timestamp("paid_at", { withTimezone: true }),
paidBy: text("paid_by"),
paymentReference: text("payment_reference"),
```

This is logically correct and well-grouped. ✅ No issue.

### P2-SCHEMA-2 (MEDIUM): `and` import missing from `goods-receipt.service.ts`

The fixed `disputeInvoice` function uses `inArray(supplierInvoices.status, [...])` and `and(...)`. The current import at line 21:
```typescript
import { and, eq, sql, count } from "drizzle-orm";
```
`and` is imported. ✅  
However `inArray` is NOT currently imported. Plan notes: "NOTE: `inArray` must be imported from 'drizzle-orm'."

**FINDING (MEDIUM):** The plan correctly flags this as a NOTE but doesn't add it to the explicit import block update. The implementer could miss it. Should be elevated to a clear import instruction in Task 1.3.

### P2-SCHEMA-3 (LOW): `paymentReference ?? null` in `markInvoicePaid`

The fixed service has:
```typescript
paymentReference: paymentReference ?? null,
```
But `paymentReference` is typed as `string | undefined`. Drizzle's `.set()` accepts `string | null | undefined` for nullable columns. Using `?? null` explicitly sets `null` when undefined, which is correct for explicitly clearing the field. ✅

## Summary

| Finding | Severity | Auto-fixable |
|---------|----------|--------------|
| `inArray` import not explicitly in Task 1.3 | MEDIUM | Yes |
