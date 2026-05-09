# Swarm Audit — GAPS.md
**Session:** 05-09_15-30_web-debt-cleanup
**Run at:** 2026-05-09
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 51 (9 critical · 18 high · 13 medium · 8 low · 3 info)

---

## Priority Fix Order

### P1 — Critical (block execution — fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| C1 | api-surface | `subscribe.tsx` calls `apiClient.getStripeRetrieveSession()` — method doesn't exist on stub class; entire auth try-block always throws | `subscribe.tsx:100` | Remove dead `apiClient` try-block; the `catch` → raw `fetch()` is the real code path. Strip `as any` → use direct fetch pattern. |
| C2 | test-coverage | Proxy mock design is broken — every `get` returns new Proxy so `.mockResolvedValue()` never works | `plan.md Phase 3.1` | Proxy must cache children by key AND wrap a `vi.fn()` as target; see corrected implementation below |
| C3 | test-coverage | Zero tests for `subscribe.tsx` — plan's #1 security deliverable has no automated regression guard | — | Add test that renders subscribe route and asserts `console.log` was not called during guest checkout flow |
| C4 | type-safety | Plan Task 2.3a: `Permission` type doesn't exist in `@avantej-core/types` — build will fail | `useAuth.ts:88` | Use `FlattenedPermission[]` from `@/types/auth` (already imported at line 19) |
| C5 | type-safety | Plan Task 2.4: Removing eslint-disable in `usePermissionMatrixState.ts:153` would break initial state (suppression is CORRECT) | `usePermissionMatrixState.ts:153` | Keep suppression; add explanatory comment instead of removing |
| C6 | type-safety | Plan Task 2.4: Removing eslint-disable in `members-tab.tsx:527` would cause infinite render loop (suppression is CORRECT) | `members-tab.tsx:527` | Keep suppression; document why `initialUsers` cannot be in deps |
| C7 | type-safety | Plan Task 2.4: Removing eslint-disable in `use-entity-table.ts:95` without `useCallback` refactor first would cause render thrashing across all entity tables | `use-entity-table.ts:95` | Fix: wrap `openEdit`/`openDelete` in `useCallback` first, then remove suppression |
| C8 | scalability | `recharts` not in `package.json` — `"vendor-charts"` manualChunk will cause build error | `plan.md Phase 5.1` | Remove `"vendor-charts": ["recharts"]` from manualChunks entirely |
| C9 | schema-drift | Proxy mock doesn't cover `orpc` export — production code uses `orpc.X.Y.queryOptions()` pattern extensively; at least 7 test files mock `orpc` separately | `plan.md Phase 3.1` | Proxy must also export `mockOrpc` handling `queryOptions`/`mutationOptions`/`.key()` patterns |

---

### P2 — High (fix before merging)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| H1 | type-safety | 12 casts bypass type-checking on `checkIns.*` and `refunds.*` (financial/attendance ops) — not in plan | 7 files (attendance/, refunds/) | Investigate if stale type build is root cause; if `checkIns`/`refunds` are in `appRouter`, a rebuild may eliminate these for free |
| H2 | type-safety | 27 casts on API response fields including RBAC-critical `.role`, `.hierarchyScopeId` — none addressed in plan | 13 files | Add Phase 2 sub-task: fix response-shape casts, prioritize RBAC fields first |
| H3 | type-safety | Plan Task 2.4: Removing eslint-disable in `appointment.tsx:393` would cause scroll-jump UX bug (scroll fires on every data refetch) | `appointment.tsx:393` | Keep suppression; document that `appointments` must NOT be in deps |
| H4 | type-safety | Plan Task 2.4: Removing eslint-disable in `customer-profile-panel.tsx:247` / `customer-detail-sheet.tsx:232` would wipe unsaved form edits | Both files | Keep suppressions; document that `profile` data must not trigger form reset |
| H5 | type-safety | Plan Task 2.5 "no behavior change" claim is wrong — `go-highlevel-integration.tsx:60` guards on `adminLoading=true`; removing fake async changes first-render behavior | `go-highlevel-integration.tsx:50-60` | Derive `loading` from `useAuth()`'s actual `isLoading` state, not remove it entirely |
| H6 | type-safety | Plan underestimates `as any` count by 4x: 47 hand-written casts in 26 files, not "12+" | All of `apps/web/src/` | Expand Phase 2 task list to cover all 47; group by category (client-cast, response-shape, enum-coercion) |
| H7 | api-surface | Proxy mock only covers `client`; 7+ test files also mock `orpc` with `queryOptions` | `mock-client.ts` (plan Phase 3.1) | Export `mockOrpc` Proxy alongside `mockClient` |
| H8 | api-surface | Mock client type should use `AppRouterClient` named export, not `typeof client` after vi.mock replaces module | `mock-client.ts` (plan Phase 3.1) | `import type { AppRouterClient } from "@/utils/orpc"` instead of `typeof client` |
| H9 | api-surface | Mock client has phantom `packages` router (mock-client.ts:126) — no `packages` router in real `appRouter` | `mock-client.ts:126-131` | When switching to Proxy, audit tests calling `mockClient.packages.*` — they test against non-existent API |
| H10 | test-coverage | No baseline tests for `customers/$id.tsx` or `appointment.tsx`/`appointment-list.tsx` before Phase 4 splits them | Both files | Add baseline tests BEFORE splitting; regressions are invisible without them |
| H11 | test-coverage | `render-with-providers.tsx` lacks TanStack Router context — Phase 4 extracted components using `useNavigate()`/`Route.useParams()` will fail | `render-with-providers.tsx` | Extend with minimal `RouterProvider` or `MemoryRouter` before Phase 4 |
| H12 | test-coverage | No `useAuth.test.ts` or `usePermissions.test.ts` — hooks underpinning every auth route have zero test coverage | `hooks/` | Add unit tests as part of Phase 2 (not after) |
| H13 | scalability | Zero lazy route examples in codebase — `createLazyFileRoute` unvalidated in this project | `plan.md Phase 5.2` | Add proof-of-concept on ONE route (purchase-orders) before rolling out to 5 routes |
| H14 | scalability | `@cloudflare/vite-plugin` loaded unconditionally — may defeat code splitting in build; Task 5.4 must be FIRST in Phase 5, not last | `vite.config.ts:9` | Reorder: 5.4 → 5.1 → 5.2 → 5.3 |
| H15 | scalability | Proxy mock breaks `orpc.*.key()` calls used in `invalidateQueries` — returns new Proxy instead of array | `plan.md Phase 3.1` | Add `.key` handler to Proxy returning deterministic array |
| H16 | doc-consistency | Task 2.4: `today-bookings.tsx:221` and `drop-in-form.tsx:54` suppress `@typescript-eslint/no-explicit-any`, NOT `react-hooks/exhaustive-deps` — plan prescribes wrong fix | Both files | Fix approach: type the `any` parameter, not the dep array |
| H17 | schema-drift | `Permission` type import in Task 2.3 references non-existent export in `@avantej-core/types` | `packages/types/src/index.ts` | Use `FlattenedPermission` from `@/types/auth` (duplicate of C4 — fix once) |
| H18 | api-surface | `subscribe.tsx` Stripe endpoints are raw REST; plan scope doesn't address the broken `apiClient` wrapper calls vs. working `fetch()` path | `subscribe.tsx:100-126` | Remove dead try/catch; expose that the `fetch()` fallback is the only working path; address in Phase 1 |

---

### P3 — Medium (fix before shipping)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| M1 | doc-consistency | Task 2.4: `category-commission-form.tsx:411` is annotation-any (`tier: any`), not a cast — different fix approach | `category-commission-form.tsx:411` | Type the `tiers` array source so the map callback is inferred |
| M2 | doc-consistency | `useAppointmentFormState.ts` is 868 lines, not "400+" — split is 2x more work than implied | `plan.md Task 4.5` | Update estimate; consider 4-way split not 3-way |
| M3 | doc-consistency | No `ci.yml` exists — only `drift-check.yml`; plan assumes wrong filename | `.github/workflows/` | Create new `ci.yml` or add to `drift-check.yml`; update plan |
| M4 | type-safety | Plan Task 2.2a (`app-sidebar.tsx`) proposes unnecessary type extension — `firstName` already exists via `inferAdditionalFields` plugin | `app-sidebar.tsx:269` | Just remove `as any`; try-compile first before extending types |
| M5 | type-safety | Plan Task 2.4: `go-highlevel-integration.tsx:245` needs `useCallback` on `refresh` before removing suppression | `go-highlevel-integration.tsx:245` | Wrap `refresh` in `useCallback` first, then safely add to deps |
| M6 | type-safety | Biome `noExplicitAny` at root scope would flag `packages/types/` type guards — scope must be `apps/web/src/` only | `biome.json` | Set `noExplicitAny` rule in `apps/web/biome.json` override, not root |
| M7 | type-safety | 6 enum/callback coercion casts (`sales/view.tsx`, `invitations-page.tsx`, `useApiMutation.ts` etc.) not in plan | Various | Add sub-task to Phase 2 for enum/form coercions |
| M8 | scalability | `radix-ui` wrapper not in `manualChunks` — files importing `"radix-ui"` (not `@radix-ui/*`) pull full Radix into main chunk | `vite.config.ts` (plan Phase 5.1) | Add `"radix-ui"` to `vendor-radix` array OR complete Phase 6.2 before Phase 5.1 |
| M9 | scalability | `lucide-react` (~150KB), `react-hook-form` (~50KB), `zod` (~60KB) missing from `manualChunks` | `plan.md Phase 5.1` | Add `"vendor-ui": ["lucide-react"]`, `"vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"]` |
| M10 | scalability | `tw-animate-css` IS used via CSS `@import "tw-animate-css"` in `index.css` — JS grep misses this | `index.css:2` | Mark as confirmed-in-use; do NOT remove; note that `depcheck` will falsely flag it |
| M11 | test-coverage | `vitest.config.ts` include pattern only scans `src/__tests__/` — Phase 4 colocated tests in `src/features/` will be missed | `vitest.config.ts` | Update include to also match `src/features/**/*.test.{ts,tsx}` |
| M12 | test-coverage | No test for `service-form.tsx` before Phase 4.6 split | — | Add baseline render test before extracting `TimePresetEditor` |
| M13 | schema-drift | Phantom `packages` router in mock-client (no corresponding real router) — tests referencing it test against non-existent API surface | `mock-client.ts:126-131` | Flag in Phase 3: tests calling `mockClient.packages.*` need rewrite |

---

### P4 — Low / Info

- **doc-consistency L1:** `auth-debug.ts` console.group block ends at line 83, not 79. Minor; doesn't affect implementation.
- **doc-consistency L2:** Task 2.2 title says "as any casts" but includes annotation-any cases. Cosmetic.
- **doc-consistency L3:** Deployment coupling table slightly inconsistent with per-phase dep lines. Authoritative = per-phase entries.
- **doc-consistency L4:** `CopyableCell` range should be `25-59` not `30-59` (interface at 25-29 should be included).
- **type-safety L1:** `auth-debug.ts` fix is correct and straightforward (C/L swap: was catalogued as CRITICAL in review but is LOW effort).
- **type-safety L2:** `useAuth.ts` catch narrowing (Task 2.3b) is correct and straightforward.
- **type-safety L3:** Mock client could use `AppRouterClient` named export instead of `typeof client` — marginally cleaner.
- **type-safety I1:** `TestDataDialog.tsx` referenced in Task 2.2d doesn't exist — phantom file; remove from plan.
- **scalability L1:** Global no-arg `invalidateQueries()` in `orpc.ts:14` error handler refetches entire cache on any API error — not introduced by this plan but will worsen with more cached routes.
- **scalability L2:** Two form libraries installed (`react-hook-form` 21 files + `@tanstack/react-form` 3 files) — ~40KB savings available; out of current scope.
- **scalability I1:** No circular chunk dependency risk from proposed grouping.
- **scalability I2:** `lodash-es` confirmed unused — safe to remove (plan is correct).

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 0 | 2 | 3 | 1 | 1 | Written ✅ |
| api-surface | 1 | 2 | 2 | 1 | 3 | Written ✅ |
| test-coverage | 2 | 4 | 5 | 2 | 4 | Written ✅ |
| doc-consistency | 0 | 1 | 3 | 4 | 6 | Written ✅ |
| type-safety | 5 | 6 | 4 | 3 | 3 | Written ✅ |
| scalability | 1 | 3 | 3 | 3 | 4 | Written ✅ |
| **TOTAL** | **9** | **18** | **13** | **8** | **3** | |

---

## Corrected Proxy Mock Implementation

The plan's Phase 3.1 code snippet is broken. Replace with:

```typescript
// apps/web/src/__tests__/helpers/mock-client.ts
import type { AppRouterClient } from "@/utils/orpc";

function makeMockNamespace(path: string[] = []): unknown {
  const cache = new Map<string | symbol, unknown>();
  const fn = vi.fn().mockResolvedValue(undefined); // leaf IS a vi.fn()

  return new Proxy(fn, {
    get(target, prop) {
      // Delegate vi.fn() methods (mockResolvedValue, mockReturnValue, etc.)
      if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
      // .key() for queryClient.invalidateQueries compatibility
      if (prop === "key") return () => [...path, String(prop)];
      // .queryOptions() for orpc TanStack Query integration
      if (prop === "queryOptions") return (opts?: unknown) => ({
        queryKey: path,
        queryFn: vi.fn().mockResolvedValue(undefined),
        ...((opts && typeof opts === "object") ? opts : {}),
      });
      if (prop === "mutationOptions") return (opts?: unknown) => ({
        mutationFn: vi.fn().mockResolvedValue(undefined),
        ...((opts && typeof opts === "object") ? opts : {}),
      });
      // Cache child namespaces so the same path always returns the same vi.fn()
      if (!cache.has(prop)) {
        cache.set(prop, makeMockNamespace([...path, String(prop)]));
      }
      return cache.get(prop);
    },
  });
}

export const mockClient = makeMockNamespace() as AppRouterClient;
export const mockOrpc = makeMockNamespace();
```

Module mock (in each test file or in `__tests__/setup.ts`):
```typescript
vi.mock("@/utils/orpc", () => ({
  client: mockClient,
  orpc: mockOrpc,
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
}));
```

---

## Phase 5 Task Reorder (Required)

**Current (broken):**
5.1 manualChunks → 5.2 lazy routes → 5.3 Lighthouse → 5.4 cloudflare gate

**Required order:**
1. **5.4 (NOW 5.1):** Gate `cloudflare()` plugin first — or chunk config + lazy loading is built against a Cloudflare-transformed output.
2. **5.1 (NOW 5.2):** manualChunks WITHOUT `recharts` (remove it), ADD `lucide-react`, `react-hook-form`, `zod`. Also add `"radix-ui"` to vendor-radix OR run Phase 6.2 first.
3. **5.2 (NOW 5.3):** Lazy routes — PoC on purchase-orders first; validate `routeTree.gen.ts` regenerates correctly.
4. **5.3 (NOW 5.4):** Lighthouse comparison.

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| C1/H18: Fix subscribe.tsx dead apiClient | 1 | 400–600 | Strip dead try/catch block |
| C2/C9/H7/H8/H15: Rewrite Proxy mock | 1 + 7 test files | 2000–3000 | Mock rewrite + per-test override updates |
| C3: Add subscribe.tsx security test | 1 new | 800–1200 | New test file |
| C4/H17: Permission type fix | 1 | 200–300 | Use FlattenedPermission |
| C5/C6/C7/H3/H4: Audit eslint-disable suppressions | 5 files | 600–1000 | Add comments, fix 2 with useCallback |
| C8: Remove recharts chunk | 1 | 100 | One-line delete |
| H1/H2/H6: Expand Phase 2 as any scope | 26 files | 4000–8000 | Largest single work item |
| H10/H12: Add baseline tests for god-files | 4–6 new files | 3000–5000 | Test files before splits |
| H13/H14: Reorder Phase 5 + lazy PoC | 2 files | 600–1000 | Config reorder + one lazy route |
| M2: Update hook estimate | plan.md | 100 | Text change only |
| M3: Create ci.yml | 1 new | 400–600 | GitHub Actions workflow |
| M9: Add missing chunks | 1 | 200–300 | vite.config.ts additions |
| M10/M11: Fix vitest + depcheck notes | 1 + plan.md | 200–300 | Config + plan text |

---

## Auto-fixable findings (safe for `--apply`)

Findings that are purely mechanical plan-text corrections:

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| AF1 | doc-consistency | `useAppointmentFormState.ts` described as "400+ lines" | `plan.md Task 4.5` | Change to "868 lines" |
| AF2 | doc-consistency | `auth-debug.ts` console.group described as ending at line 79 | `plan.md Task 1.2` | Change to "lines 69-83" |
| AF3 | doc-consistency | CopyableCell range "30-59" | `plan.md Task 6.4` | Change to "25-59 (including interface definition)" |
| AF4 | doc-consistency | `ci.yml` assumed in Task 3.3 | `plan.md Task 3.3` | Change to "create new `ci.yml` — only `drift-check.yml` currently exists" |
| AF5 | type-safety | `TestDataDialog.tsx` phantom reference in Task 2.2d | `plan.md Task 2.2` | Remove `TestDataDialog.tsx` from task list; file does not exist |
| AF6 | scalability | `"vendor-charts": ["recharts"]` in Phase 5.1 code snippet | `plan.md Phase 5.1` | Remove the `vendor-charts` chunk line |
| AF7 | scalability | Phase 5 task order (5.1→5.2→5.3→5.4) | `plan.md Phase 5` | Reorder to 5.4→5.1→5.2→5.3 with explanation |
| AF8 | scalability | Missing deps from manualChunks | `plan.md Phase 5.1` | Add `"vendor-ui": ["lucide-react"]`, `"vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"]` |
| AF9 | scalability | `tw-animate-css` marked as "possibly unused" | `plan.md Task 6.1` | Mark as confirmed-in-use via CSS `@import` — do NOT remove |
| AF10 | type-safety | Permission type source wrong in Task 2.3a | `plan.md Task 2.3` | Change to "use `FlattenedPermission[]` from `@/types/auth`" |
| AF11 | test-coverage | `vitest.config.ts` include pattern gap | `plan.md Phase 4` | Add task: "Update `include` in `vitest.config.ts` to `["src/__tests__/**/*.test.{ts,tsx}", "src/features/**/*.test.{ts,tsx}"]`" |
| AF12 | schema-drift | Fake-async described as "setTimeout-style" | `plan.md Task 2.5` | Change to "`useState(true)` + `useEffect(() => setLoading(false), [])` pattern" |
