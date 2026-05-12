# API Surface Audit — Pass 2

**Auditor:** api-surface-auditor
**Date:** 2026-05-07
**Based on:** Updated plan.md after Pass 1 fixes

---

## Summary

Pass 1 CRITICAL fixes (C1, C3) confirmed resolved. C2 (`package_management` resource) is correctly flagged as DECISION NEEDED in the plan. One new HIGH finding: the plan's batch name-resolution pseudocode references `users` table without showing the import path. One MEDIUM: `changedBy` is still returned in the service layer but plan says it must NOT be in the API response — the stripping must happen explicitly in the router handler.

---

## Findings

### CONFIRMED RESOLVED — C1: `sales_management` → `sales`

Plan section 3.4 now correctly shows:
```
salesOrders.statusHistory → requirePermission(context.tenantDb, context.member, "sales", "read")
```
Matches `permission.service.ts` Resource union. ✓

### CONFIRMED RESOLVED — C3: `financial_management` → `payments`

Plan section 3.4 now correctly shows:
```
invoices.paymentStatusHistory → requirePermission(context.tenantDb, context.member, "payments", "read")
```
Matches `permission.service.ts` Resource union. ✓

### REMAINS OPEN — C2: `package_management` resource

Plan correctly annotates: "[DECISION NEEDED]". Not auto-fixable — requires human decision. The plan now explicitly presents both options (add resource or reuse `"sales"`). This is properly escalated.

### HIGH — Name resolution pseudocode imports `users` without showing the import path

**Location:** Plan section 3.4, batch name resolution pseudocode

The pseudocode references:
```typescript
const cpDb = getControlPanelDb(context);
const userRecords = await cpDb.select({ id: users.id, name: users.name, email: users.email }).from(users)...
```

But `users` here refers to the control-panel `auth.user` table. In `appointments.ts` this is imported as:
```typescript
import { user as cpUsers } from "@avantej-core/db/schema/auth";
```

The pseudocode uses `users` but should use `cpUsers` (or whatever alias the implementer uses). Inconsistent naming will cause a type error at implementation. The plan should note the correct import.

**Fix:** Add import note to the pseudocode block:
```typescript
import { user as cpUsers } from "@avantej-core/db/schema/auth";
// then use cpUsers.id, cpUsers.name, cpUsers.email in the query
```

### MEDIUM — Service layer returns `changedBy` (raw UUID); router must strip it before returning

**Location:** Plan section 5, Phase 1, items 1 and 3

The plan says the service returns "typed array of history rows (no name resolution at service layer)". This means the service returns `changedBy: string` (the raw UUID). The router then does the name resolution and should return `changedByName` instead.

The plan output type says "raw UUID never returned" — but this stripping must happen **explicitly** in the router handler. The plan does not show the final `return` statement that omits `changedBy` from the response.

**Recommended addition to plan:** Add a note that the router must:
1. Call service to get rows (with raw `changedBy`)
2. Resolve names via batch query
3. Return mapped objects that include `changedByName` but **omit** `changedBy`

Otherwise TypeScript will infer `changedBy` in the response type and the client will receive both fields.

### MEDIUM — `invoices.paymentStatusHistory` must be added to `baseRouter` type via `invoicesRouter`

Since `paymentStatusHistory` is added directly to `invoicesRouter`, it will be automatically included in `baseRouter.invoices` (because `invoices: invoicesRouter` in `index.ts`). No separate `index.ts` change needed for Phase 3. The plan correctly does not mention an `index.ts` change for Phase 3 payment procedure. Confirm this understanding is correct — it is.

### LOW — Plan Phase 3 item 4 says export from `packages/services/src/index.ts` but the pattern for `payments.service.ts` is unclear

The services index uses named exports for some modules and `export *` for others. `sales-order.service.ts` uses `export *` (line 268). The new `payments.service.ts` should follow the same pattern: add `export * from "./payments.service"` to `index.ts`. The plan says "Export from `packages/services/src/index.ts`" without specifying the exact line or export pattern.

---

## Verdict

Pass 1 CRITICAL fixes properly applied. One new HIGH finding (import alias mismatch in pseudocode). One MEDIUM (explicit changedBy stripping). C2 correctly escalated. Apply HIGH fix to plan.
