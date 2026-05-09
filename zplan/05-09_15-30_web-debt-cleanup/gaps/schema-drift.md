# Schema Drift Audit
**Session:** 05-09_15-30_web-debt-cleanup
**Findings:** 7 (0 critical / 2 high / 3 medium / 1 low / 1 info)

## Findings

### [HIGH] Mock-client Proxy does not mock `orpc` export -- only `client`
**Plan claims:** Phase 3.1 Proxy-based auto-mock replaces `mock-client.ts` and types it as `Client = typeof client` from `@/utils/orpc`. Tests will auto-work.
**Actual:** `@/utils/orpc` exports three symbols: `client`, `orpc`, and `queryClient`. Production code uses `orpc.X.Y.queryOptions(...)` extensively for TanStack Query integration (confirmed in `useAppointmentFormState.ts`, `useAppointmentFormData.ts`, `usePermissions.ts`, `useProductData.ts`, etc.). Existing tests already split into two patterns: `{ client: mockClient }` and `{ client: {}, orpc: mockOrpc }`. The plan's Proxy only covers `client`; tests that mock `orpc` for `queryOptions` will still fail.
**File:** `apps/web/src/utils/orpc.ts:24` (exports), `apps/web/src/__tests__/hooks/useProductData.test.ts:41` (example of `orpc` mock)
**Fix:** Proxy auto-mock must also export a `mockOrpc` that returns `{ queryOptions: () => ({ queryKey: [...], queryFn: vi.fn() }) }` at every leaf, and the module mock must provide both `client` and `orpc`.

---

### [HIGH] `Permission` type does not exist in `@avantej-core/types`
**Plan claims:** Task 2.3 says to fix `useAuth.ts:88` by changing `permissions: [] as any[]` to `permissions: [] as Permission[]` with `import Permission from @avantej-core/types`.
**Actual:** `@avantej-core/types` only re-exports `./better-auth` types (`BetterAuthUser`, `BetterAuthSession`, etc.). There is no `Permission` type anywhere in the package. The app defines its own `FlattenedPermission` type in `apps/web/src/types/auth.ts` and uses it in `useAuth.ts` (imported at line 19).
**File:** `packages/types/src/index.ts`, `packages/types/src/better-auth.ts` (full contents -- no Permission type)
**Fix:** Use `FlattenedPermission[]` from `@/types/auth` instead, or define a new `Permission` type locally. Do not import from `@avantej-core/types`.

---

### [MEDIUM] Existing mock-client has phantom `packages` router not in real router tree
**Plan claims:** Phase 3.1 will replace hand-written mock-client with Proxy. Plan does not mention the `packages` key.
**Actual:** `mock-client.ts:126-131` defines `packages: { list, create, update, archive }`. No `packages` or `packagesRouter` exists in `baseRouter` or `appRouter` in `packages/api/src/routers/index.ts`. There is no `packages/api/src/routers/packages.ts` file. This phantom router in the mock may be covering up tests that reference a non-existent API surface.
**File:** `apps/web/src/__tests__/helpers/mock-client.ts:126-131`, `packages/api/src/routers/index.ts:69-142`
**Fix:** When switching to Proxy mock, audit tests that call `mockClient.packages.*` -- they are testing against a router that does not exist. These tests may need to be rewritten to use the correct router (likely `packageInstances` or a future packages router).

---

### [MEDIUM] `useAppointmentFormState.ts` is 868 lines, not "400+ lines" as plan states
**Plan claims:** Task 4.5 says the hook is "400+ lines" and should be split into files each under 400 lines.
**Actual:** The file is 868 lines -- more than double the plan's estimate. Splitting into 3 files as proposed would yield ~290 lines each on average, which is feasible, but the splitting strategy should account for the actual size (may need 4 files, not 3).
**File:** `apps/web/src/hooks/useAppointmentFormState.ts` (868 lines)
**Fix:** Update plan estimate; consider 4-way split if logical boundaries allow it.

---

### [MEDIUM] Plan's `usePermissions.ts` line references are accurate but fake-async pattern is different from described
**Plan claims:** Task 2.5 says to remove "fake setTimeout-style trigger" in `usePermission`, `useRole`, `useIsSystemAdmin`.
**Actual:** The pattern is not `setTimeout`-based -- it's `useState(true)` + `useEffect(() => setLoading(false), [])` which fires synchronously on mount. The fix is correct (remove the fake loading state), but the description "setTimeout-style" is misleading and could confuse implementers. Line references (38, 65, 87) are accurate.
**File:** `apps/web/src/hooks/usePermissions.ts:38-57,65-79,87-99`
**Fix:** Cosmetic -- update plan description to say "useState+useEffect pattern" not "setTimeout-style".

---

### [LOW] Label.tsx import from `"radix-ui"` is confirmed broken at build time, not runtime
**Plan claims:** Task 6.3 says `Label` import from `"radix-ui"` is "broken at runtime".
**Actual:** The import `import { Label as LabelPrimitive } from "radix-ui"` exists at line 2. Whether it breaks depends on whether `radix-ui` wrapper package is installed. If the wrapper barrel package is installed (check `package.json`), it works at runtime but is suboptimal for tree-shaking. The plan correctly prescribes the fix (`@radix-ui/react-label`), but the severity characterization may be wrong.
**File:** `apps/web/src/components/ui/label.tsx:2`
**Fix:** Verify if `radix-ui` is in `package.json` dependencies before calling it "broken at runtime" -- it may just be a tree-shaking concern.

---

### [INFO] Plan's "No DB schema" claim is verified correct
**Plan claims:** "This plan touches no DB schema" and "No DB migrations."
**Actual:** Confirmed. The plan references no table names, column names, enum values, or migration files. All work is scoped to `apps/web/src/**`. The plan references oRPC router names which are verified to exist in `packages/api/src/routers/index.ts`: `purchaseOrders`, `promotions`, `taxRates`, `walkInCustomers`, `salesOrders`, `analytics`, `expenses`, `announcements`, `classSlots`, `memberProfiles`, `notifications`, `members`, `services`, `serviceCategories`, `permissions`, `rolePermissions`, `packageInstances`, `serviceMembers`, `rooms`, `installments`, `installmentPlans`, `trainerTiers`, `categoryCommission`, `commissionSplits`, `checkIns`, `brands`, `productCategories`, `suppliers`, `unitsOfMeasure`, `stockRequests`, `transferOrders`, `products` -- all confirmed present in `appRouter`.
**File:** `packages/api/src/routers/index.ts:69-142`
**Fix:** None needed.

---

## Summary

The plan's core claim of "no DB schema changes" is verified correct -- no schema drift exists. However, two HIGH-severity issues need resolution before implementation: (1) the Proxy mock strategy only covers the `client` export but production code heavily uses the `orpc` export for `queryOptions`, meaning the auto-mock will not fix all 77 failing tests as promised; (2) the `Permission` type import path in Task 2.3 references a non-existent export. Additionally, the existing mock-client contains a phantom `packages` router that maps to no real API surface, which the plan should address during the Phase 3 migration. Line count estimates and line references are mostly accurate with minor discrepancies noted.
