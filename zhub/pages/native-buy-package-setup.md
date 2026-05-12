# Setup Screen

**Route:** `(app)/dashboard/buy-package/setup`
**File:** `apps/native/app/(app)/dashboard/buy-package/setup.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 1/7) — prev: none, next: schedule
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Select a category, service, and package to begin purchasing.

**Produces:** Three cascading selectors displayed sequentially: categories, services (filtered by category), and packages (filtered by service type). Each renders via TanStack Query with loading skeleton cards.

**On success:** State is saved via `usePurchaseFlow` context; navigates to schedule screen.

**On failure / error states:**
- No categories returned: render empty state.
- Service loading fails: skeleton cards shown until data arrives.
- No packages available for selected service type: empty state message.
- All selections required before Continue button appears.

---

## 2. How It Works

**Execution flow:**
1. Mount: Hide tab bar using `useFocusEffect`.
2. User taps category → query for services (enabled when categoryId set).
3. User taps service → store serviceType, query all services again (to get packages).
4. Filter services with `sessionCount != null` (packages), match service type.
5. User taps package → store selected IDs and metadata.
6. Continue button calls `update()` with all selected data → push to schedule.

**Inputs:**
- Navigation params: none (fresh start from dashboard).
- Local state: `selectedCategoryId`, `selectedServiceId`, `selectedPackageId`.

**State management:**
- Context `usePurchaseFlow`: stores category/service/package IDs and names, credits, price, validity days, available payment plans, installment interval.
- TanStack Query: caches service categories, services per category.

**Outputs:**
- On continue: PurchaseFlowState updated with categoryId, categoryName, serviceId, serviceName, serviceType, packageId, packageName, creditsTotal (sessionCount), price, validityDays, availablePaymentPlans, installmentIntervalDays.
- Navigates to `./schedule`.

**Side effects:**
- Tab bar hidden during flow via `setOptions({ tabBarStyle: { display: "none" } })`.
- Query invalidation: none (reads only).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.serviceCategories.list` — fetch org categories.
- `orpc.services.list` (two calls) — fetch services by category, then all services for package filtering.

**Uses these components:**
- `Container` — wrapper; path `components/container`.
- `SkeletonCard` — loading placeholder; defined in file.

**Uses these hooks:**
- `usePurchaseFlow` — context for state.
- `useOrganization` — get organizationId.
- `useQuery` — TanStack Query.
- `useFocusEffect` — navigation listener.

**Navigation: who navigates here:** Dashboard or parent screens via `router.push('./setup')`.

**Navigation: where it goes:** `./schedule` on continue.

---

## 4. Data Shapes

**DB tables touched:**
- `serviceCategories` (read): id, name, description, organizationId.
- `services` (read): id, name, description, type (private/semi_private/both), organizationId, availablePaymentPlans, installmentIntervalDays.
- `services` as packages (read, filtered by sessionCount): id, name, price, sessionCount (credits), expiryDays, type.

**Key types / Zod schemas:**
- Category: `{ id, name, description }`.
- Service: `{ id, name, description, type, availablePaymentPlans, installmentIntervalDays }`.
- Service/Package: `{ id, name, price, sessionCount, expiryDays, type }`.

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Multi-type service filtering logic (private vs semi_private vs both).
- Tab bar visibility state on mount/unmount.
- Concurrent loading of category and service queries.
- Edge case: no services in selected category.

---

## 6. Notes

- Package filtering checks `s.type === serviceType || s.type === "both"` — a package marked "both" is compatible with any service type.
- Step indicator shows 7 steps but code mentions 8 (`totalSteps = 7` on line 109). Clarify intent.
- Unsplash header image is placeholder; should be replaced with org-specific branding.
- Tab bar recovery on unmount handled by useCallback cleanup, but only in useFocusEffect context.
- No error boundary; API failures will crash the screen without fallback UI.
