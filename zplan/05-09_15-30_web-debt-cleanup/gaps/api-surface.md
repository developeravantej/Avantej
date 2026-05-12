# API Surface Audit — Web Debt Cleanup Plan

**Auditor:** API surface agent
**Date:** 2026-05-09
**Scope:** Verify every oRPC procedure name, route file path, and mock-client strategy cited in `zplan/05-09_15-30_web-debt-cleanup/plan/plan.md` against actual codebase.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH     | 2 |
| MEDIUM   | 2 |
| LOW      | 1 |
| INFO     | 3 |

---

## Findings

### F1 — CRITICAL: `subscribe.tsx` uses raw `fetch()` and `apiClient` for Stripe endpoints; plan only strips logs but does not flag the broken API surface

**Evidence:**
- `apps/web/src/routes/subscribe.tsx:34` imports `apiClient from "@/lib/api"`.
- `apiClient` is a stub class (`apps/web/src/lib/api.ts`) that only has `getListServices`, `getListServiceCategories`, and `getListbranches` methods — all returning mock data.
- `subscribe.tsx` calls `apiClient.getStripeRetrieveSession(sessionId)` (line 100), `apiClient.getGetsubscriptionplans()` (line 239), `apiClient.postCreatecheckoutsession()` (line 255), `apiClient.postCreateguestcheckoutsession()` (line 307).
- **None of these methods exist on the `ApiClient` class.** They will throw `TypeError: apiClient.getStripeRetrieveSession is not a function` at runtime.
- The plan (Phase 1, Task 1.1) only strips `console.log` calls from `subscribe.tsx`. It does not acknowledge that the entire Stripe checkout flow is calling non-existent methods on a stub class.

**Impact:** The guest checkout flow (Journey A) is already broken at runtime. Stripping console.logs from dead code is pointless until the underlying API calls are fixed or migrated to working endpoints.

**Recommendation:** Phase 1 must either (a) restore the real `apiClient` methods that call the server's REST endpoints, or (b) migrate `subscribe.tsx` to use direct `fetch()` calls to the server's `/api/v1/stripe/*` endpoints (which it already partially does for guest session fallback). The plan should acknowledge this as a prerequisite.

---

### F2 — HIGH: Proxy mock only covers `client` but tests also mock `orpc` with `queryOptions`/`mutationOptions`

**Evidence:**
- The plan's Proxy mock (Phase 3, Task 3.1) replaces `mock-client.ts` to auto-handle `client.X.Y` calls.
- However, 7+ test files mock `orpc` separately (not just `client`):
  - `useProductData.test.ts:41` — `vi.mock("@/utils/orpc", () => ({ client: {}, orpc: mockOrpc }))`
  - `useProductForm.test.ts:24` — exports `orpc: mockOrpc`
  - `add-appointment-modal.test.tsx:8` — inline `orpc: { ... queryOptions ... }`
  - `brands.test.tsx:29`, `categories.test.tsx:29`, `products.test.tsx:18`, `suppliers.test.tsx:16` — all mock `orpc` inline
- Production code uses `orpc.X.Y.queryOptions(...)` pattern (found in `useAppointmentFormData.ts`, `useAppointmentFormState.ts`, `usePermissions.ts`, `products/view.tsx`, `customers.tsx`, `user/view.tsx`).
- The plan's Proxy intercepts `queryOptions` and returns `{ queryKey, queryFn }`, but it only applies to the `client` object. The `orpc` export from `@/utils/orpc` is a separate object (`createTanstackQueryUtils(client)`) and needs its own Proxy mock.

**Impact:** If only `mockClient` is replaced with a Proxy but `orpc` is not, tests using `orpc.X.Y.queryOptions(...)` will still break. This accounts for at least 7 test files.

**Recommendation:** The Proxy mock must also export a `mockOrpc` that handles nested `router.procedure.queryOptions(...)` and `router.procedure.mutationOptions(...)` patterns. Update the plan's mock-client.ts snippet to export both `mockClient` and `mockOrpc`.

---

### F3 — HIGH: Mock client is missing routers that exist in `appRouter`

**Evidence:**
The current `mock-client.ts` has 30 router namespaces. The real `appRouter` (in `packages/api/src/routers/index.ts`) has **51 router keys** in `baseRouter` plus 4 server-side routers (`auth`, `admin`, `tenantAdmin`, extended `invitations`).

Missing from mock (routers in `baseRouter` not in mock-client.ts):
- `hierarchy`, `invitations`, `preferredTimes`, `notificationPreferences`, `customerProfiles`, `userActivityLog`, `rolePermissions`, `serviceCategoryConfig`, `payouts` (present in baseRouter, missing from mock), `cancelledSales`, `invoices`, `pos`, `goodsReceipts`, `registration`, `coachIntake`, `trainerAvailability`, `organizationSettings`, `googleCalendar`, `customerDirectory`, `auditLogs`, `memberships`, `households`, `refunds`, `analytics.getStaffPerformance` (only partially mocked)

While the Proxy approach will auto-handle these, this finding confirms the plan's claim that 77 tests fail due to mock drift. However, the plan should note that the Proxy **silently passes** tests that call non-existent procedures — a test calling `client.fooBar.baz()` will get `undefined` instead of an error.

**Impact:** The Proxy trades false negatives (tests failing on missing mock) for false positives (tests passing against non-existent procedures). This is acknowledged in the plan's risk table but should be elevated to a concrete mitigation task.

**Recommendation:** Add a test helper that validates mock overrides against the real router type at compile time. The plan's `type Client = typeof client` assertion helps, but `vi.mocked()` on a Proxy target will not catch typos in procedure names.

---

### F4 — MEDIUM: `typeof client` type assertion requires careful import path

**Evidence:**
- `apps/web/src/utils/orpc.ts` exports: `export { queryClient, client, orpc }` and re-exports `export type { AppRouterClient } from "@avantej-core/api/routers/index"`.
- The plan says `type Client = typeof client` imported from `@/utils/orpc`.
- This works IF the test file can resolve `@/utils/orpc` at type level. Since `vi.mock("@/utils/orpc", ...)` replaces the module, `typeof client` from the mocked module will be `typeof mockClient`, not the real type.
- The correct import is: `import type { AppRouterClient } from "@/utils/orpc"` and then `export const mockClient = makeMockNamespace() as AppRouterClient`.

**Impact:** If the type import is done wrong, the Proxy mock loses type safety — which is the entire point of Phase 3.

**Recommendation:** Update the plan's code snippet to use `import type { AppRouterClient } from "@/utils/orpc"` instead of `typeof client`.

---

### F5 — MEDIUM: `subscribe.tsx` Stripe endpoints are raw REST, not oRPC — plan scope conflict

**Evidence:**
- `subscribe.tsx` uses `fetch()` to call `/api/v1/stripe/guest-session/${sessionId}` (line 110-111) and `/api/v1/auth-setup/get-setup-token/${email}` (line 157-158).
- These are **REST endpoints on the server**, not oRPC procedures. They do not appear in `appRouter`.
- The plan says "no new oRPC procedures are created" and scope is "frontend-only". But fixing `subscribe.tsx` properly would require either:
  (a) Verifying these REST endpoints exist on the server (out of scope per plan), or
  (b) Creating oRPC procedures for Stripe session retrieval (also out of scope).

**Impact:** The plan's Phase 1 strips logs from a file whose core API calls may already be broken. If the Stripe REST endpoints work via raw `fetch()` but `apiClient.getStripeRetrieveSession` does not (it doesn't — the method doesn't exist on the stub), then the code path at line 100 always throws and falls through to the `catch` block's `fetch()` path.

**Recommendation:** Add a note in Phase 1 that `subscribe.tsx:100` will always throw because `apiClient.getStripeRetrieveSession` is not implemented. The `catch` block (lines 101-126) is the actual working code path via raw `fetch()`. The dead `apiClient` call should be removed, not just have its logs stripped.

---

### F6 — LOW: Route file paths all verified as correct

**Evidence:**
All route files cited in the plan exist:
- `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx` -- exists
- `apps/web/src/routes/_authenticated/dashboard/_layout/customers/$id.tsx` -- exists
- `apps/web/src/routes/_authenticated/dashboard/_layout/payouts/view.tsx` -- exists
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/tax-rates.tsx` -- exists
- `apps/web/src/routes/_authenticated/dashboard/_layout/promotions/view.tsx` -- exists
- `apps/web/src/routes/_authenticated/dashboard/_layout/notifications/view.tsx` -- exists
- `apps/web/src/components/pages/packages/installments-page.tsx` -- exists
- `apps/web/src/components/calendar/appointment.tsx` -- exists
- `apps/web/src/components/appointments/appointment-list.tsx` -- exists
- `apps/web/src/components/forms/service-form.tsx` -- exists
- `apps/web/src/routes/subscribe.tsx` -- exists

**Impact:** None — all paths are correct.

---

### F7 — INFO: Router count in `appRouter` is 55, not explicitly stated in plan

**Evidence:**
`baseRouter` has 51 keys (including `healthCheck` and `privateData`). `appRouter` adds `auth`, `admin`, `tenantAdmin`, and extends `invitations` with `sendEmail`. Total unique router namespaces: **55**.

The plan says "77 failing tests because mock-client.ts drifted from real oRPC router tree" and proposes auto-mock. The plan does not state the router count, which matters for validating coverage.

---

### F8 — INFO: Two distinct mock patterns coexist; plan only addresses one

**Evidence:**
Tests use two patterns:
1. **`mockClient` pattern** (16 files): `vi.mock("@/utils/orpc", () => ({ client: mockClient }))` — mocks `client.X.Y()` direct calls.
2. **`mockOrpc` pattern** (7 files): `vi.mock("@/utils/orpc", () => ({ client: {}, orpc: mockOrpc }))` — mocks `orpc.X.Y.queryOptions()` for TanStack Query integration.

The plan's Phase 3 Proxy mock only covers pattern 1. Pattern 2 needs a parallel Proxy that returns `{ queryOptions: vi.fn(), mutationOptions: vi.fn() }` at every nested level.

---

### F9 — INFO: `apiClient` (from `lib/api.ts`) is only imported by `subscribe.tsx`

**Evidence:**
`grep "from.*lib/api" apps/web/src` shows only `subscribe.tsx:34`. The stub class is not used anywhere else.

This means Phase 6 dep cleanup should include removing `apps/web/src/lib/api.ts` entirely once `subscribe.tsx` is migrated (or at minimum, the plan should track this as follow-up debt).

---

## Procedure Name Verification

All oRPC procedure names cited in the plan were verified against `packages/api/src/routers/index.ts`:

| Cited Procedure | Exists in Router | Status |
|----------------|-----------------|--------|
| `client.expenses.list` | `expensesRouter` in baseRouter | OK |
| `client.permissions.list` | `permissionsRouter` in baseRouter | OK |
| `client.purchaseOrders.list` | `purchaseOrdersRouter` in baseRouter | OK |
| `client.promotions.bulkUpdate` | Not in codebase (hypothetical example in plan) | OK (example only) |
| `client.announcements.listActive` | `announcementsRouter` in baseRouter | OK |

No procedure name errors found in the plan.

---

## Action Items for Plan Update

1. **[CRITICAL]** Add Phase 0 or pre-Phase-1 task: fix or remove `apiClient.getStripeRetrieveSession` call in `subscribe.tsx:100`. The method does not exist. Either remove the try/catch wrapper and use the raw `fetch()` path directly, or restore the real Stripe API methods.

2. **[HIGH]** Phase 3 mock-client Proxy must also export a `mockOrpc` Proxy that handles `orpc.X.Y.queryOptions(...)` pattern. At least 7 test files depend on this.

3. **[HIGH]** Add compile-time guard so that `vi.mocked(mockClient.nonExistent.procedure)` produces a type error, not a silent Proxy pass-through. Use `import type { AppRouterClient }` for the cast.

4. **[MEDIUM]** Fix the `typeof client` import in the Proxy snippet to use `import type { AppRouterClient } from "@/utils/orpc"` instead.

5. **[MEDIUM]** Add Phase 6 task to delete `apps/web/src/lib/api.ts` after `subscribe.tsx` migration.
