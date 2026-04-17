# Buy Package — Setup

**Route:** `(app)/dashboard/buy-package/setup`
**File:** `apps/native/app/(app)/dashboard/buy-package/setup.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 1/7) — prev: dashboard, next: schedule
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** The user selects the service category, service, and package they want to purchase.
**Produces:** Three cascaded selection lists — categories, services filtered by category, packages filtered by the selected service's appointment type. Each selection shows name, description, price, credits, and validity.
**On success:** All three selections made → Continue button appears → context written → navigates to `./schedule`.
**On failure / error states:** No error state shown for API failures. If no services exist for a category, shows "No services available." If no packages match the service type, shows "No packages available for this service type." Loading states show skeleton cards.

---

## 2. How It Works

**Execution flow:**
```
SetupScreen
  → useOrganization() → organizationId
  → orpc.serviceCategories.list({ organizationId })
      → serviceCategoriesRouter.list
        → listServiceCategories(tenantDb)
          → tenantDb.serviceCategories
  → orpc.services.list({ organizationId, categoryId }) [enabled when category selected]
      → servicesRouter.list
        → listServices(tenantDb, { categoryId })
          → tenantDb.services
  → orpc.packages.list({ organizationId, appointmentType }) [enabled when service selected]
      → MISSING: packages router does not exist in appRouter
  → handleContinue → update(context) → router.push("./schedule")
```

**Inputs:** organizationId from useOrganization hook; user taps to select category, service, package
**State management:** Local state `selectedCategoryId`, `selectedServiceId`, `selectedPackageId`; on continue writes to PurchaseFlowContext
**Outputs:** Renders three cascaded selection card lists with progress indicator at step 1/7
**Side effects:** Three TanStack Query fetches on mount/selection change

---

## 3. What Depends On It

**Calls these API endpoints:**
- `serviceCategories.list` — fetches all categories for the org
- `services.list` — fetches services filtered by selected categoryId
- `packages.list` — **MISSING**: this router does not exist in `appRouter`; this call will fail at runtime

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — root layout wrapper
- `SkeletonCard` (inline) — loading placeholder
- `SafeAreaView` from react-native-safe-area-context

**Context:** Reads `categoryId`, `serviceId`, `packageId` for pre-selection. Writes: `categoryId`, `categoryName`, `serviceId`, `serviceName`, `serviceType`, `packageId`, `packageName`, `creditsTotal`, `price`, `validityDays`, `availablePaymentPlans`, `installmentIntervalDays`

**Navigation:** `./schedule` — on Continue button tap (requires all three selections)

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| serviceCategories | SELECT | id, name, description |
| services | SELECT | id, name, description, type, availablePaymentPlans, installmentIntervalDays |
| packages | SELECT | id, name, description, sessionCount, pricePerSession, validityDays, appointmentType |

**Context fields used:**
| Field | Type | Purpose |
|-------|------|---------|
| categoryId | string \| null | Pre-selects category on re-entry |
| serviceId | string \| null | Pre-selects service on re-entry |
| packageId | string \| null | Pre-selects package on re-entry |
| categoryName | string \| null | Written on continue |
| serviceName | string \| null | Written on continue |
| serviceType | "private" \| "semi_private" \| null | Written on continue; drives schedule UI |
| packageName | string \| null | Written on continue |
| creditsTotal | number \| null | Written on continue |
| price | number \| null | pricePerSession * sessionCount |
| validityDays | number \| null | Written on continue |
| availablePaymentPlans | string[] | From service record; drives plan step |
| installmentIntervalDays | number | From service record; defaults to 30 |

---

## 5. Tests

**Test files:** None found

---

## 6. Notes

- `orpc.packages.list` is called but **`packages` is not a key in `appRouter`** (`packages/api/src/routers/index.ts`). This will produce a TypeScript error or runtime failure. There may be a server-side packages router that hasn't been wired into the shared base router yet.
- The service type mapping `semi_private → "semi-private"` is done inline before passing to the packages query.
- The price displayed on package cards is `pricePerSession * sessionCount` (total, not per session).
- The Continue button only appears after all three selections are made — there is no separate validation step.
- The step indicator on this screen hard-codes `totalSteps = 7` but `info.tsx` shows `totalSteps = 8`. The step counts are inconsistent across screens.
- `useFocusEffect` in this screen duplicates the tab-bar-hiding logic from `_layout.tsx` — this is redundant.
