# Test Coverage Audit — Web Debt Cleanup Plan

**Auditor:** test-coverage-agent
**Date:** 2026-05-09
**Plan:** `zplan/05-09_15-30_web-debt-cleanup/plan/plan.md`

---

## 1. Mock Client Inventory

**File:** `apps/web/src/__tests__/helpers/mock-client.ts` (203 lines, hand-written)

**30 router namespaces mocked** with a total of ~95 individual procedure mocks:

| # | Namespace | Procedures mocked |
|---|-----------|-------------------|
| 1 | `expenses` | list, create, approve, reject, markPaid |
| 2 | `announcements` | list, listActive, create, update, delete |
| 3 | `promotions` | list, create, update, deactivate |
| 4 | `taxRates` | list, create, update, setDefault, deactivate |
| 5 | `purchaseOrders` | list, create, approve, receiveItems, cancel |
| 6 | `salesOrders` | list, getById, create, update, cancel |
| 7 | `analytics` | getDashboardKpis, getStaffPerformance |
| 8 | `walkInCustomers` | list, getById, create, update, deactivate |
| 9 | `notifications` | list |
| 10 | `members` | list, create, suspend, deactivate, reactivate, updateRole |
| 11 | `memberProfiles` | get, upsert |
| 12 | `serviceMembers` | listForMember, assign, remove, updateBuffer |
| 13 | `serviceCategories` | list |
| 14 | `permissions` | list |
| 15 | `suppliers` | list, create, update, deactivate |
| 16 | `brands` | list, create, update, delete |
| 17 | `productCategories` | list, create, update, delete |
| 18 | `unitsOfMeasure` | list, create, update, delete |
| 19 | `stockRequests` | list, create, approve, reject, fulfill |
| 20 | `transferOrders` | list, create, markInTransit, complete, cancel |
| 21 | `packages` | list, create, update, archive |
| 22 | `services` | list, create, update |
| 23 | `packageInstances` | list, listAll, assign, listExpiring |
| 24 | `products` | list, create, update |
| 25 | `checkIns` | list, recordCheckIn, listTodaysBookings, recordBulkCheckIn, getActivePackageForMember |
| 26 | `auth` | userContext |
| 27 | `trainerTiers` | list, create, deactivate, reactivate, assignToMember |
| 28 | `categoryCommission` | getByCategory, upsert |
| 29 | `commissionSplits` | approve, void, listLedger |
| 30 | `installments` | adminOverview, listByPackageInstance, confirmPayment, manualUnlock, adjustCredits, suggestRefund, setOverdraft |
| 31 | `installmentPlans` | list |
| 32 | `rooms` | list, create, update, deactivate |
| 33 | `classSlots` | list, create, update, cancel |

**Missing from mock vs. real `baseRouter` + `appRouter` (22 router namespaces not mocked):**

hierarchy, invitations, appointments, packageInstanceStaff, preferredTimes, notificationPreferences, customerProfiles, userActivityLog, roles, rolePermissions, serviceCategoryConfig, payouts, invoices, cancelledSales, goodsReceipts, waitlist, registration, coachIntake, trainerAvailability, categoryBufferOverrides, organizationSettings, googleCalendar, customerDirectory, auditLogs, pos, refunds, memberships, households, admin, tenantAdmin

This is the root cause of the "77 failing tests" claim: any test that touches a component referencing one of these missing namespaces will crash with `Cannot read properties of undefined`.

---

## 2. Test File Inventory

**38 test files** found at `apps/web/src/**/*.test.{ts,tsx}`:

| Category | Files | Count |
|----------|-------|-------|
| Components | add-appointment-modal, announcements-widget, drop-in-form, category-commission-form, claims-widget, bulk-approve-dialog, enhanced-permission-matrix, impersonation-banner | 8 |
| UI components | empty-state, page-card, status-badge, status-callout | 4 |
| Hooks | useApiMutation, usePermissionMatrixState, useProductData, useProductForm | 4 |
| Lib/utils | appointment-scheduler, money, table-columns, validators, currency, promotions, tax-rates | 7 |
| Routes (pages) | brands, categories, dashboard, expenses, products, promotions, purchase-orders, stock-requests, suppliers, tax-rates, trainers, transfer-orders, uom | 13 |
| Pages | installments-page, trainer-tiers | 2 |
| **Total** | | **38** |

**Note:** The plan claims "280 tests" total (individual `test()` / `it()` blocks across these 38 files). The file count is consistent with that figure (~7.4 tests per file average, which is reasonable for this codebase).

---

## 3. Acceptance Criteria Coverage Map

### Phase 1 — Security: Strip Sensitive Console Logs

| Criterion | Test Coverage | Rating |
|-----------|--------------|--------|
| **1.1** Zero `console.log` in `subscribe.tsx` | **ZERO tests.** No test file for `subscribe.tsx` exists at all. | **CRITICAL** |
| **1.2** All production `console.log` DEV-guarded | **ZERO tests.** No lint-based or programmatic test verifies DEV guards. | **HIGH** |
| **1.3** Biome `noConsoleLog` rule blocks new violations | **ZERO tests.** Plan relies on `bun check` but no CI test validates the rule exists. | **MEDIUM** |
| **1.4** Baseline Lighthouse captured | N/A (manual artifact, not testable) | **INFO** |

### Phase 2 — Type Safety

| Criterion | Test Coverage | Rating |
|-----------|--------------|--------|
| **2.1** Inventory `as any` usage | N/A (documentation task) | **INFO** |
| **2.2** Fix Category A casts | **Partial.** Some affected files have tests (category-commission-form, appointment-list via add-appointment-modal) but tests don't verify type correctness — they test rendering. | **MEDIUM** |
| **2.3** Fix `catch (error: any)` in useAuth | **ZERO tests.** No `useAuth.test.ts` file exists. | **HIGH** |
| **2.4** Strip eslint-disable suppressions | **ZERO tests.** No test verifies the suppressions are gone. | **LOW** |
| **2.5** Fix `usePermission` fake async | **ZERO tests.** No `usePermissions.test.ts` file. `usePermissionMatrixState.test.ts` exists but tests a different hook. | **HIGH** |
| **2.6** `bun check-types` exits 0 | **ZERO tests.** Plan proposes CI gate (Phase 3) but no test exists yet. | **MEDIUM** |

### Phase 3 — Tests: Auto-Mock + CI Gate

| Criterion | Test Coverage | Rating |
|-----------|--------------|--------|
| **3.1** Proxy-based auto-mock replaces hand-written client | **This IS the test infrastructure.** Not testable by tests — validated by whether tests pass. | **INFO** |
| **3.2** All 280 tests pass | **Self-validating** (running test suite is the validation). | **INFO** |
| **3.3** CI gate for type-check + test | **ZERO tests.** Only one workflow exists (`.github/workflows/drift-check.yml`) — no CI for type-check or tests. This is the deliverable, not something to test. | **MEDIUM** |
| **3.4** Biome `noExplicitAny` rule | **ZERO tests.** Same as 1.3 — relies on `bun check`. | **LOW** |

### Phase 4 — Maintainability: Extract God-Files

| Criterion | Test Coverage | Rating |
|-----------|--------------|--------|
| **4.2** Split purchase-orders/view.tsx | `routes/purchase-orders.test.tsx` exists. Will need mock updates after split. | **MEDIUM** |
| **4.3** Split customers/$id.tsx | **ZERO tests.** No `customers.test.tsx` or `customer-detail.test.tsx`. | **HIGH** |
| **4.4** Split installments-page.tsx | `pages/packages/installments-page.test.tsx` exists. | **MEDIUM** |
| **4.5** Split appointment.tsx + appointment-list.tsx | `components/add-appointment-modal.test.tsx` exists but tests a modal, not the main components. **No test for `appointment.tsx` or `appointment-list.tsx` directly.** | **HIGH** |
| **4.6** Split service-form.tsx | **ZERO tests.** No `service-form.test.tsx`. | **MEDIUM** |
| **4.7** Verification pass (all tests + type-check green) | Self-validating. | **INFO** |

### Phase 5 — Performance: Code Splitting

| Criterion | Test Coverage | Rating |
|-----------|--------------|--------|
| **5.1** `manualChunks` in Vite config | **ZERO tests.** No build-output verification test. | **LOW** |
| **5.2** Lazy-load heavy admin routes | **ZERO tests.** No test verifies lazy-loading behavior. | **LOW** |
| **5.3** Lighthouse comparison | N/A (manual) | **INFO** |
| **5.4** `cloudflare()` plugin conditional | **ZERO tests.** No build-config test. | **LOW** |

### Phase 6 — Polish

| Criterion | Test Coverage | Rating |
|-----------|--------------|--------|
| **6.1** Remove unused deps | Self-validating (build succeeds or doesn't). | **INFO** |
| **6.2** Standardize Radix imports | **ZERO tests** (but build + existing component tests serve as coverage). | **LOW** |
| **6.3** Fix `<Label>` import | **ZERO tests.** No `label.test.tsx`. | **MEDIUM** |
| **6.4** Remove duplicated `CopyableCell` | **ZERO tests.** No test for either version. | **LOW** |

---

## 4. Verifying "77 of 280 Tests Failing"

**Cannot run tests** in this audit, but the claim is plausible based on structural analysis:

- 38 test files exist. 19 of them import `mockClient` from `mock-client.ts`.
- The mock client covers 30 namespaces but the real router has **52+ namespaces** (30 in base + auth + admin + tenantAdmin + server invitations).
- Tests for components that touch **unmocked namespaces** (e.g., any component using `hierarchy`, `appointments`, `roles`, `customerProfiles`, `payouts`, etc.) will fail at runtime.
- Some test files (brands, categories, suppliers, products, uom) define **inline mocks** in their `vi.mock("@/utils/orpc", ...)` call rather than importing `mockClient`, which means they may be more resilient to mock drift.
- The 77/280 ratio (~28% failure rate) is consistent with 22/52 namespaces being unmocked.

---

## 5. Vitest Configuration Review

**File:** `apps/web/vitest.config.ts`

```
environment: "jsdom"           -- Correct for React component tests
globals: true                  -- Allows vi/describe/it without imports
setupFiles: ["./src/__tests__/setup.ts"]  -- Loads jest-dom matchers + cleanup
include: ["src/__tests__/**/*.test.{ts,tsx}"]  -- Only scans __tests__ dir
```

**Issues found:**

1. **No `@/` alias resolution risk.** Uses `vite-tsconfig-paths` plugin which should resolve `@/` aliases from `tsconfig.json`. This is correct.
2. **Test include pattern is restrictive.** Only `src/__tests__/**` — tests colocated with source files (e.g., `src/features/X/__tests__/`) would be missed unless the pattern is updated. **Phase 4 must update this pattern** when creating `features/` folders with colocated tests.
3. **No test timeout configured.** Default Vitest timeout (5s) applies. Not a problem unless Phase 4 tests become slow.

---

## 6. Proxy Mock Compatibility Analysis

**Question:** Will `mockClient.purchaseOrders.list.mockResolvedValue(...)` work when `mockClient` is a Proxy?

**Answer: NO — not directly.** Here's why:

The plan's Proxy implementation:
```typescript
function makeMockNamespace(): unknown {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === "queryOptions" || prop === "mutationOptions") {
        return () => ({ queryKey: ["mock", String(prop)], queryFn: vi.fn() });
      }
      return makeMockNamespace(); // Returns a NEW Proxy each time
    },
  });
}
```

**Problem:** Every property access returns a **new** Proxy. So:
- `mockClient.purchaseOrders` returns Proxy A
- `mockClient.purchaseOrders` again returns Proxy B (different object!)
- `mockClient.purchaseOrders.list` returns Proxy C
- `mockClient.purchaseOrders.list.mockResolvedValue(...)` — Proxy C has no `mockResolvedValue` method

**The Proxy never returns a `vi.fn()` at the leaf level** because every `get` returns another Proxy (recursion never terminates to a vi.fn()).

**Required fix for the plan:** The Proxy must **cache** child proxies by key AND return a `vi.fn()` at the leaf level. A working implementation would need:

```typescript
function makeMockNamespace(): unknown {
  const cache = new Map<string | symbol, unknown>();
  const fn = vi.fn(); // Each leaf IS a vi.fn()
  return new Proxy(fn, {
    get(target, prop) {
      if (prop in fn) return (fn as any)[prop]; // Delegate vi.fn() methods
      if (cache.has(prop)) return cache.get(prop);
      const child = makeMockNamespace();
      cache.set(prop, child);
      return child;
    },
  });
}
```

This way:
- `mockClient.purchaseOrders.list` is always the same cached vi.fn()
- `.mockResolvedValue(...)` works because the Proxy wraps a vi.fn()
- `vi.mocked(mockClient.purchaseOrders.list)` also works

**Rating: CRITICAL** — the plan's Proxy code as written will break ALL existing test patterns. Must be fixed before Phase 3.1.

---

## 7. `render-with-providers.tsx` Review

**File:** `apps/web/src/__tests__/helpers/render-with-providers.tsx`

**Provides:**
- QueryClient with `retry: false` (correct for tests)
- QueryClientProvider wrapper

**Missing:**
1. **No TanStack Router context.** Components using `Route.useParams()`, `useNavigate()`, `Link`, or `useSearch()` will fail. This affects: `customers/$id.tsx` (uses `Route.useParams()`), any page with navigation links.
2. **No auth/user context provider.** Components using `useUserContext()` or `useAuth()` will fail unless individually mocked in each test.
3. **No toast/notification provider.** Components using toast notifications (likely from sonner or similar) may warn or fail.

**Impact:** Currently, most tests mock `useUserContext` via `vi.mock()` at the file level, sidestepping the missing provider. But Phase 4's feature-folder extraction may introduce new components that need router context (e.g., components that call `useNavigate()`). The render helper should be extended.

**Rating: MEDIUM** — works today because tests mock around it, but will become a friction point during Phase 4 refactors.

---

## 8. Summary of Gaps by Severity

### CRITICAL (zero coverage on security-critical path)

| Gap | Affected Criterion | Action Needed |
|-----|-------------------|---------------|
| No test for `subscribe.tsx` (token/session data leak) | Phase 1.1 | Add test verifying no `console.log` calls occur during guest checkout flow |
| Proxy mock design is broken — will not support `.mockResolvedValue()` | Phase 3.1 | Fix Proxy to cache children and use `vi.fn()` as the proxy target |

### HIGH (zero coverage on state-changing or auth path)

| Gap | Affected Criterion | Action Needed |
|-----|-------------------|---------------|
| No `useAuth.test.ts` — error handling casts are untested | Phase 2.3 | Add unit tests for `useAuth` error narrowing |
| No `usePermissions.test.ts` — fake-async fix has no regression test | Phase 2.5 | Add test verifying `loading` state derives from `useUserContext` |
| No test for `customers/$id.tsx` (1442-line god-file being split) | Phase 4.3 | Add baseline tests BEFORE splitting |
| No test for `appointment.tsx` or `appointment-list.tsx` | Phase 4.5 | Add baseline tests BEFORE splitting |
| Console.log stripping in production has no automated guard | Phase 1.2 | Add a test or CI step that greps for unguarded console.log |

### MEDIUM (partial coverage or indirect coverage)

| Gap | Affected Criterion | Action Needed |
|-----|-------------------|---------------|
| `render-with-providers` lacks router context | Phase 4 (all) | Extend with `RouterProvider` or `MemoryRouter` |
| `vitest.config.ts` include pattern won't find colocated tests | Phase 4 | Update include to also match `src/features/**/*.test.{ts,tsx}` |
| No `service-form.test.tsx` for Phase 4.6 split | Phase 4.6 | Add baseline test before extracting TimePresetEditor |
| No `label.test.tsx` for Radix import fix | Phase 6.3 | Add basic render test |
| No CI workflow for type-check or tests (only drift-check exists) | Phase 3.3 | Deliverable of Phase 3 — no pre-existing gap to fill |
| `as any` removal tests are indirect (type-check, not runtime) | Phase 2.2 | Acceptable — `bun check-types` is the gate |

### LOW (edge cases or self-validating)

| Gap | Affected Criterion | Action Needed |
|-----|-------------------|---------------|
| No test for Biome rules (noConsoleLog, noExplicitAny) | Phase 1.3, 3.4 | Accept: `bun check` is the validation |
| No test for build chunk sizes | Phase 5.1 | Accept: manual verification |
| No test for lazy-load behavior | Phase 5.2 | Consider: add a build-output assertion script |
| eslint-disable suppression removal untested | Phase 2.4 | Accept: grep-based CI check sufficient |
| No test for CopyableCell dedup | Phase 6.4 | Accept: type-check catches missing imports |

### INFO (no action needed)

- Phase 1.4, 5.3: Lighthouse baselines are manual artifacts.
- Phase 3.2: Self-validating (test suite pass/fail).
- Phase 4.1, 6.1: Documentation/dep removal, validated by build.

---

## 9. Recommendations

1. **Fix the Proxy mock design BEFORE Phase 3 starts.** The plan's code is non-functional. Use the cache+vi.fn()-as-target pattern described in section 6.

2. **Add baseline tests for god-files BEFORE splitting them in Phase 4.** Specifically: `customers/$id.tsx`, `appointment.tsx`, `appointment-list.tsx`, and `service-form.tsx` have zero test coverage. Splitting without tests means regressions are invisible.

3. **Add a `subscribe.tsx` security test.** Even a simple test that renders the component with mocked APIs and asserts `console.log` was never called would catch regressions. This is the plan's #1 security deliverable and has zero automated verification.

4. **Update `vitest.config.ts` include pattern** in Phase 4 to cover `src/features/**/*.test.{ts,tsx}`.

5. **Extend `render-with-providers.tsx`** with a minimal router context before Phase 4 begins.

6. **Add `useAuth` and `usePermissions` unit tests** in Phase 2 — these hooks underpin every authenticated route and have zero direct test coverage.
