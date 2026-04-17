# Phase 2: Runtime Crashers & Data Integrity

**Goal:** Fix issues that cause runtime crashes or silently corrupt data.

**User journeys delivered:** Journey 2 (native buy package), Journey 3 (expense currency)

**Dependencies:** Phase 0 (dedup complete), Phase 1 (security fixes don't conflict)

---

## Tasks

### Task 2.1: Fix native `packageId` → `serviceId` mismatch

**Severity:** CRITICAL
**File:** `apps/native/app/(app)/dashboard/buy-package/pay.tsx:62`

**What to change:**
1. In the pay screen, change `packageId: state.packageId` to `serviceId: state.serviceId` (or whatever the correct state key is)
2. Trace the purchase flow context to ensure `serviceId` is set during package selection
3. If the flow context uses `packageId` throughout, rename to `serviceId` in the context/state type

**Files to check:**
- `apps/native/app/(app)/dashboard/buy-package/setup.tsx` — where state is initialized
- `apps/native/app/(app)/dashboard/buy-package/pay.tsx` — where API is called
- `apps/native/app/(app)/dashboard/buy-package/done.tsx` — where results are shown

**Deployment note:** This fix must deploy with the native app update. The API already expects `serviceId`.

### Task 2.2: Fix hardcoded tax rate on done screen

**Severity:** CRITICAL
**File:** `apps/native/app/(app)/dashboard/buy-package/done.tsx:24`

**What to change:**
1. Remove `const total = subtotal * 1.1`
2. Pass the calculated total (with correct tax) through the navigation params from the pay screen
3. The pay screen already fetches `taxRates.getDefault` — pass the calculated total to the done screen

```typescript
// In pay.tsx, when navigating to done:
router.push({
  pathname: "/(app)/dashboard/buy-package/done",
  params: { total: calculatedTotal, ... }
});

// In done.tsx:
const { total } = useLocalSearchParams();
// Use total directly instead of recalculating
```

### Task 2.3: Fix `branchId: null` in Book Workout flow

**Severity:** CRITICAL
**File:** Native app booking flow (exact file TBD — trace from appointment creation)

**What to change:**
1. Ensure `branchId` is resolved from the member's hierarchy scope or the selected branch before calling `appointments.create`
2. Add a Zod refinement or early return in the API if `branchId` is null/undefined:

```typescript
// In appointments router create handler:
if (!input.branchId) {
  throw new Error("Branch is required for booking");
}
```

### Task 2.4: Fix `packages.list` phantom call in native app

**Severity:** CRITICAL
**File:** `apps/native/app/(app)/dashboard/buy-package/setup.tsx:135`

**What to change:**
Option A: Change the call to use an existing router — e.g., `client.services.list` filtered by package-type services
Option B: Create a `packages` router with a `list` procedure that wraps the services query

**Recommendation:** Option A (less code, no new router needed). The "packages" are services with `type = 'package'` or similar — verify the data model.

### Task 2.5: Change currency defaults from USD to MYR

**Severity:** HIGH
**Files to modify (schema defaults):**
- `packages/db/src/schema/tenant/expenses.ts:21` — change `.default("usd")` to `.default("myr")`
- `packages/db/src/schema/tenant/payments.ts:36` — change `.default("usd")` to `.default("myr")`
- `packages/db/src/schema/tenant/payouts.ts:38` — change `.default("usd")` to `.default("myr")`

**Migration required:**
```bash
bun db:generate  # Generate migration for default changes
```

Then add a data migration to the generated SQL file:
```sql
UPDATE expenses SET currency = 'myr' WHERE currency = 'usd';
UPDATE payments SET currency = 'myr' WHERE currency = 'usd';
UPDATE payouts SET currency = 'myr' WHERE currency = 'usd';
```

**Risk:** If any existing records are genuinely in USD (e.g., international transactions), this migration will incorrectly change them. Verify with business stakeholders before running.

**Push to tenant DBs:** Since this is tenant schema, use `bun db:push` for dev and the tenant migration system for production.

### Task 2.6: Fix USD currency formatting in frontend

**Severity:** HIGH
**Files:**
- `apps/web/src/components/tables/service/view/columns.tsx:9` — change `currency: "USD"` to `"MYR"`
- `apps/web/src/components/forms/service-detail-dialog.tsx:37` — change `currency: "USD"` to `"MYR"`

**Use existing utility:** `formatPrice(priceCents, "MYR")` from `@/lib/currency.ts`

### Task 2.7: Add `customerType` to sales order Zod input

**Severity:** HIGH
**File:** `packages/api/src/routers/sales-orders.ts:97-108`

**What to change:**
```typescript
// Add to create input:
customerType: z.enum(["member", "walk_in"]).default("member"),

// Add to update input:
customerType: z.enum(["member", "walk_in"]).optional(),
```

Pass through to the service function.

### Task 2.8: Fix walk-in customer update validation

**Severity:** MEDIUM (included because it's a 2-line fix)
**File:** `packages/api/src/routers/walk-in-customers.ts:172,177`

**What to change:**
```typescript
// Change:
email: z.string().optional(),
gender: z.string().optional(),

// To:
email: z.string().email().optional(),
gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
```

### Task 2.9: Verify and test

- Test native buy package flow end-to-end (requires Expo dev build)
- Verify currency shows "MYR" on expenses, payments, payouts pages
- Verify walk-in customer update with invalid email is rejected

---

## Acceptance Criteria

- [ ] Native buy package flow: sends `serviceId`, shows correct tax total, no crashes
- [ ] Native booking: `branchId` always populated, no NOT NULL violations
- [ ] `packages.list` call resolves (no runtime error on setup screen)
- [ ] Currency defaults are `"myr"` in schema; existing `"usd"` rows migrated
- [ ] Service prices formatted as MYR in web frontend
- [ ] `customerType` field available in sales order create/update
- [ ] Walk-in update validates email format and gender enum
- [ ] `bun check-types` passes
