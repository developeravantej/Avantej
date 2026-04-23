# Pay Screen

**Route:** `(app)/dashboard/buy-package/pay`
**File:** `apps/native/app/(app)/dashboard/buy-package/pay.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 6/7) — prev: sign, next: done
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Review order summary with taxes and total; complete purchase by creating package instance.

**Produces:**
- Order summary card (package, credits, service name, price).
- Payment plan summary (if multi-installment).
- Price breakdown (subtotal, tax, total).
- Payment method section (disabled, placeholder for future Stripe integration).
- Pay button showing total amount.

**On success:** Package instance created via API; preferred times saved (if any); navigates to done screen.

**On failure / error states:**
- API error creating package instance: show Alert with error message.
- Processing state: button disabled, text shows "Processing...".

---

## 2. How It Works

**Execution flow:**
1. Mount: Fetch default tax rate for org (useQuery).
2. Calculate taxes: `taxAmount = subtotal * (taxRatePercent / 100)`.
3. Display order summary and price breakdown.
4. User taps Pay button → `handlePayment()`:
   a. Set `isProcessing` true.
   b. Calculate package expiry: `startsAt + (validityDays * ms)`.
   c. Create packageInstance via `client.packageInstances.create()` with all purchase data (see inputs).
   d. If preferred times exist and instance created: save via `client.preferredTimes.upsert()` (non-critical, failures ignored).
   e. Invalidate packageInstances query cache.
   f. Update context with packageInstanceId.
   g. Navigate to done.
   h. Catch and display error alert.

**Inputs:**
- Context state: price, paymentPlanType, creditsTotal, validityDays, installmentIntervalDays, signature, termsAgreedAt, remark, serviceId, preferredTimes.
- Organization ID, user ID (from authClient session).

**State management:**
- TanStack Query: fetch tax rate (cached).
- Local state: `isProcessing` (boolean).
- PurchaseFlow context: read all state, update packageInstanceId.

**Outputs:**
- API call: `client.packageInstances.create()` — creates row in packageInstances table.
- API call: `client.preferredTimes.upsert()` — creates/updates preferred times (optional).
- Context update: packageInstanceId.
- Cache invalidation: packageInstances query key.
- Navigation to `./done`.

**Side effects:**
- API calls (create and optional upsert).
- Query cache invalidation.
- Alert on error.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.taxRates.getDefault()` — fetch default tax rate (basis points).
- `client.packageInstances.create()` — create package purchase record.
- `client.preferredTimes.upsert()` — save preferred times (optional, non-critical).

**Uses these components:**
- `Container` — wrapper.

**Uses these hooks:**
- `usePurchaseFlow` — read/write state.
- `useOrganization` — get organizationId.
- `useQuery` — fetch tax rate.
- `useQueryClient` — invalidate packageInstances query.
- `authClient.useSession()` — get current user ID.
- `useState` — processing state.

**Navigation: who navigates here:** `./sign` on continue.

**Navigation: where it goes:** `./done` on success.

---

## 4. Data Shapes

**DB tables touched:**
- `packageInstances` (write): insert with fields from purchase flow (see lines 60–79).
- `preferredTimes` (write/upsert): save preferred times linked to packageInstanceId.

**Key types / Zod schemas:**
- `packageInstance`: input object (lines 60–79) includes organizationId, serviceId, clientId, source, totalPrice, taxAmount, paymentStatus, paymentMethod, eSignature, termsAgreedAt, creditsTotal, creditsUsed, startsAt, expiresAt, status, remark, paymentPlanType, installmentIntervalDays.
- `preferredTime`: { dayOfWeek: DayOfWeek, time: string, priority: number }.
- `DayOfWeek`: "monday" | "tuesday" | ... (normalized to lowercase).

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Tax rate calculation edge cases (rounding, very small/large rates).
- Package instance creation failure — rollback of preferred times (currently not handled).
- Concurrency: double-tap Pay button (isProcessing flag should prevent, but not tested).
- Validity calculation: leap years, timezone edge cases.
- Very long signature data URI handling in API.
- Preferred times upsert failure — should not fail payment, but current logic swallows error silently.

---

## 6. Notes

- Payment method section currently disabled (opacity-50, lines 407–421); awaiting Stripe integration.
- `paymentStatus` and `paymentMethod` both set to "pending" (lines 67–68); likely updated later by Stripe webhook.
- Tax rate in basis points (1000 = 10%); ensure tax rate endpoint returns correct unit.
- Preferred times map: `pt.day` (e.g., "Monday") converted to lowercase enum "monday" (lines 97).
- Preferred times saving is non-critical (try/catch with no rethrow, line 102); consider logging or alerting user if failed.
- Step counter shows 7/8 but should be 6/7 (one-off error).
