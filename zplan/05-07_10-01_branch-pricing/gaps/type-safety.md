# Type Safety Audit — Pass 1
**Lens:** type-safety-auditor
**Date:** 2026-05-07

## Summary

Checked all new TypeScript interfaces, Zod schemas, service function signatures, and nullable column handling.

---

## Findings

### [CRITICAL] `expireServicePrice` / `expireProductPrice` — nullable `effectiveUntil` vs `Date`

Plan §5 Phase 1 says:
```typescript
expireServicePrice(db, priceId, until?: Date) // updates effectiveUntil to until ?? new Date()
```

The `servicePrices.effectiveUntil` column is `timestamp with tz, nullable`. When calling `expireServicePrice`, the update value is always a concrete `Date` (never null, since we're setting an expiry). However, `deleteServicePrice` is a hard delete, so no nullable risk there.

**Risk:** When the router passes `z.string().datetime().optional()` and converts to `new Date(input.effectiveUntil)`, if `effectiveUntil` is `undefined`, the plan says "defaults to now" — the service function correctly handles this with `until ?? new Date()`. **Type is safe.** However, the Zod schema must not allow `null` for `effectiveUntil` in the `expireBranchPrice` input (null would mean "remove the expiry", which is the wrong operation for expire). Plan's Zod spec:
```
effectiveUntil: z.string().datetime().optional() // defaults to now
```
This is correct — `optional()` (undefined = use now) not `nullable()`.

### [CRITICAL] POS `handleServiceSelect` — async void in sync handler

Plan §5 Phase 2 shows:
```typescript
const { priceCents } = await client.services.resolvePrice({...});
onUpdate({ ... unitPriceCents: priceCents ?? 0 });
```

`handleServiceSelect` in `items-step.tsx` is called from `onValueChange` of a shadcn `Select`. `onValueChange` is typed as `(value: string) => void`. If `handleServiceSelect` becomes `async`, the function must be wrapped correctly:

```typescript
// Current:
function handleServiceSelect(serviceId: string) { ... }

// New (problematic):
async function handleServiceSelect(serviceId: string) { ... }
// onValueChange receives async fn — returns Promise<void>, not void
// React/shadcn accepts this at runtime but TypeScript strict may flag it
```

**Risk:** TypeScript strict mode may complain about `(value: string) => Promise<void>` assigned to `(value: string) => void`. The fix is to wrap: `onValueChange={(id) => { void handleServiceSelect(id); }}` or use `useQuery` with `enabled`. Plan should specify the async pattern explicitly.

### [HIGH] `resolveServicePrice` returns `Promise<number | null>`

The plan's POS code: `const { priceCents } = await client.services.resolvePrice(...)` — the procedure handler returns `{ priceCents }` where `priceCents` is `number | null`. The plan then uses `priceCents ?? 0`, which correctly handles null. **Safe.**

### [HIGH] `SelectedCustomer.branchId` — typed as `string` (not nullable)

In `types.ts`:
```typescript
export interface SelectedCustomer {
  type: CustomerType;
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  branchId: string; // NOT nullable
}
```

Plan §5 Phase 2: `const branchId = selectedCustomer?.branchId ?? null`

This is safe — `selectedCustomer` can be null (hence `?.`), and `branchId` on the object is always a string. The `?? null` is correct for when `selectedCustomer` is null. **No type issue.**

### [HIGH] `ItemsStepProps` interface expansion

Plan adds:
```typescript
selectedCustomer: SelectedCustomer | null; // NEW
```

The component is called from `pos-workflow.tsx`. If the prop is added but `pos-workflow.tsx` does not pass it, TypeScript will error (prop is required, not optional). **The plan must make this prop required** and update the call site simultaneously.

If `selectedCustomer` is optional (`selectedCustomer?: SelectedCustomer | null`), the price resolution falls back gracefully. **Recommendation: make it optional with default null** to avoid breaking the call site during partial implementation.

### [HIGH] `customerType` as `string` in Zod vs `CustomerType` type

The plan uses `customerType: z.string().nullable().optional()` in oRPC inputs. The `CustomerType = "member" | "walk_in"` type is not enforced by Zod — any string is accepted. The plan acknowledges this (§8 Q1) but:
- Service layer: `resolveServicePrice` takes `customerType: string | null` — no enforcement
- If an invalid value like `"vip"` is sent, it simply won't match any override (harmless)
- **But:** the router should use `z.enum(["member", "walk_in"]).nullable().optional()` for `setBranchPrice` and `expireBranchPrice` inputs to prevent invalid data from being stored in `service_prices.customerType`

This is a **data integrity gap** — the schema allows any string, but input validation should constrain it.

### [MEDIUM] `listServicePriceOverrides` return type

Service function returns:
```typescript
Array<{
  id: string;
  branchId: string | null;
  customerType: string | null;
  priceCents: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}>
```

The UI table in plan §5 Phase 3 displays "Branch" (needs branch name, not just ID) and needs to join with hierarchy nodes. The `listPriceOverrides` procedure returns `branchId` but not `branchName`. The plan's UI table shows "Branch Name" — the UI must either:
1. Accept `branchId` and look up the name from a cached hierarchy list, or
2. The service/router must join to return `branchName`

**The plan does not specify this join.** The UI component would need to do a client-side lookup from hierarchy context. This is a **missing type/data contract** in the plan.

### [MEDIUM] `deleteServicePrice` — plan says service function is "thin wrapper"

```typescript
deleteServicePrice(db, priceId) → Promise<void>
```

The plan does not specify whether `deleteServicePrice` verifies the row belongs to the tenant before deleting. With a UUID-based delete without tenant validation, a malicious actor who obtains a valid `priceId` from another tenant could delete it. The router must validate tenant ownership first. **Missing tenant isolation check in delete path.**

### [LOW] `SetServicePriceParams.effectiveFrom` optional Date

`setServicePrice` accepts `effectiveFrom?: Date` and spreads it conditionally. When undefined, Drizzle uses the DB default. This is correct but the TypeScript type makes `effectiveFrom` always `Date | undefined`, which is consistent with the conditional spread. **Safe.**

### [LOW] Plan §5 Phase 3 form: "Price in RM (input type=number step=0.01, stored as `rmToCents(value)`)"
- `rmToCents` is in `apps/web/src/lib/money.ts` (confirmed: `items-step.tsx` imports from `@/lib/money`)
- **Function name is correct.**

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| `handleServiceSelect` async void in sync onValueChange handler | CRITICAL | Yes — add pattern guidance to plan |
| `customerType` should use `z.enum` not `z.string` in setBranchPrice/expireBranchPrice | HIGH | Yes — update plan Zod schema spec |
| Branch name not returned by `listPriceOverrides` — UI needs lookup strategy | MEDIUM | Yes — add to plan Phase 3 |
| `deleteServicePrice` missing tenant isolation check spec | MEDIUM | Yes — add to plan Phase 1 handler spec |
| `ItemsStepProps.selectedCustomer` should be optional to avoid call-site break | HIGH | Yes — update plan interface spec |
