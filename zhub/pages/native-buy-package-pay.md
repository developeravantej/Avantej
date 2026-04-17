# Buy Package — Pay

**Route:** `(app)/dashboard/buy-package/pay`
**File:** `apps/native/app/(app)/dashboard/buy-package/pay.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 6/7, shown as step 7/8 in progress text) — prev: sign, next: done
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** The user reviews the order summary with tax-inclusive total and confirms the purchase by tapping "Pay $X.XX". This creates the package instance record in the database.
**Produces:** Order summary card (package name, credits, service, validity), optional payment plan card (if installment chosen), price breakdown (subtotal + tax + total), a disabled payment method placeholder section.
**On success:** `packageInstances.create` called → `preferredTimes.upsert` called (if times set) → context updated with `packageInstanceId` → navigates to `./done`.
**On failure / error states:** `Alert.alert("Purchase Failed", error.message)` on API error. Button shows "Processing..." with 50% opacity while in-flight.

---

## 2. How It Works

**Execution flow:**
```
PayScreen
  → orpc.taxRates.getDefault({ organizationId }) → taxRate
  → subtotal = state.price; taxAmount = subtotal * (rateInBasisPoints / 10000); total = subtotal + taxAmount
  → handlePayment:
      → client.packageInstances.create({ organizationId, packageId, clientId: session.user.id, ... })
          → packageInstancesRouter.create
            → requirePermission(tenantDb, member, "service_management", "create")
            → createPackageInstance(tenantDb, {...})
              → tenantDb.packageInstances (INSERT)
            → if installment plan: createInstallmentSchedule(tenantDb, {...})
              → tenantDb.installments (INSERT)
      → if preferredTimes.length > 0:
          → client.preferredTimes.upsert({ organizationId, packageInstanceId, items })
              → preferredTimesRouter.upsert
                → upsertPreferredTimes(tenantDb, packageInstanceId, items)
                  → tenantDb.preferredTimes (UPSERT)
      → queryClient.invalidateQueries(["packageInstances"])
      → update({ paymentMethod: "pending", packageInstanceId: instance.id })
      → router.push("./done")
```

**Inputs:** All accumulated context fields; `session.user.id` for `clientId`; `taxRates.getDefault` for tax
**State management:** Local `isProcessing: boolean`; writes `paymentMethod`, `packageInstanceId` to context
**Outputs:** Order summary, price breakdown, pay button
**Side effects:** Creates `packageInstances` row; optionally creates `installments` rows; optionally upserts `preferredTimes` rows; invalidates `["packageInstances"]` query cache

---

## 3. What Depends On It

**Calls these API endpoints:**
- `taxRates.getDefault` — fetches org default tax rate (basis points)
- `packageInstances.create` — creates the package instance record; requires `service_management:create` permission
- `preferredTimes.upsert` — saves preferred times against the new instance (non-critical; errors silently swallowed)

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — root layout wrapper

**Context:** Reads `packageId`, `packageName`, `creditsTotal`, `serviceName`, `price`, `validityDays`, `paymentPlanType`, `installmentIntervalDays`, `signature`, `termsAgreedAt`, `remark`, `creditsTotal`, `preferredTimes`. Writes: `paymentMethod`, `packageInstanceId`

**Navigation:** `./done` — on successful payment

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| taxRates | SELECT | rateInBasisPoints, isDefault |
| packageInstances | INSERT | organizationId, packageId, clientId, source, totalPrice, taxAmount, paymentStatus, paymentMethod, eSignature, termsAgreedAt, creditsTotal, creditsUsed, startsAt, expiresAt, status, remark, paymentPlanType, installmentsTotal, installmentsPaid, creditsUnlocked |
| installments | INSERT (conditional) | packageInstanceId, dueDate, amount, creditsToUnlock, status |
| preferredTimes | UPSERT (conditional) | packageInstanceId, dayOfWeek, time, priority |

**Context fields used:**
| Field | Type | Purpose |
|-------|------|---------|
| packageId | string \| null | Required for create call |
| price | number \| null | Subtotal for tax calculation and order display |
| creditsTotal | number \| null | Passed to packageInstances.create |
| validityDays | number \| null | Calculates expiresAt (now + validityDays in ms) |
| paymentPlanType | "full" \| "half" \| "quarterly" \| null | Passed to create; triggers installment schedule |
| installmentIntervalDays | number | Used in installment schedule creation |
| signature | string \| null | eSignature field |
| termsAgreedAt | string \| null | Passed to create |
| remark | string \| null | Passed to create |
| preferredTimes | Array<{ day: string; time: string }> | Upserted after instance created |
| packageInstanceId | string \| null | Written after successful create |
| paymentMethod | string \| null | Written as "pending" after create |

---

## 5. Tests

**Test files:** None found

---

## 6. Notes

- `packageInstances.create` **requires `service_management:create` permission** on the tenant member. Customer-app users must have this permission or the call returns FORBIDDEN. This may be intentionally gated for staff-assisted purchase, or may be a bug if fully self-serve is intended.
- Payment processing (Stripe) is not yet integrated. The "PAYMENT METHOD" section is rendered with `opacity-50` and a placeholder message. `paymentMethod` and `paymentStatus` are both hardcoded to `"pending"`.
- Tax is fetched live from `taxRates.getDefault`. If no default rate is set, `taxRatePercent` defaults to 0 (no tax).
- Tax rate is stored in basis points (e.g., 1000 = 10.00%). Conversion: `rateInBasisPoints / 100 = percent`, then `subtotal * percent / 100 = taxAmount`.
- The `preferredTimes.upsert` failure is silently swallowed (empty catch) — intentionally non-critical.
- `validityDays` defaults to 365 if null when computing `expiresAt`.
- The `packageInstances.create` input schema expects `serviceId` as required but the screen passes `packageId`. There is a mismatch: the router input has `serviceId: z.string().uuid()` but the call site passes `packageId`. This is a likely bug.
- The step progress counter shows `currentStep = 7, totalSteps = 8` but the steps array only has 7 items — another step-counter inconsistency.
