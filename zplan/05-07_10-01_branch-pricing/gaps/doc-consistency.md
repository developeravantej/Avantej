# Documentation Consistency Audit — Pass 1
**Lens:** doc-consistency-auditor
**Date:** 2026-05-07

## Summary

Verified all file paths mentioned in plan/META, line number citations, phase dependencies, and explicit claims.

---

## File Path Verification

### Existing files (plan claims these exist — verified)
| File | Status |
|---|---|
| `packages/db/src/schema/tenant/service-prices.ts` | ✓ EXISTS |
| `packages/db/src/schema/tenant/product-prices.ts` | ✓ EXISTS |
| `packages/services/src/pricing.service.ts` | ✓ EXISTS |
| `packages/services/src/index.ts` | ✓ EXISTS |
| `packages/api/src/routers/services.ts` | ✓ EXISTS |
| `packages/api/src/routers/products.ts` | ✓ EXISTS |
| `apps/web/src/components/pos/items-step.tsx` | ✓ EXISTS |
| `apps/web/src/components/pos/pos-workflow.tsx` | ✓ EXISTS |
| `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx` | ✓ EXISTS |
| `apps/web/src/routes/_authenticated/dashboard/_layout/products/view.tsx` | ✓ EXISTS |

### New files (plan creates these — not yet existing, expected)
| File | Status |
|---|---|
| `apps/web/src/components/pages/services/pricing-page.tsx` | ✗ NOT YET (correct, new) |
| `apps/web/src/components/pages/services/service-price-override-dialog.tsx` | ✗ NOT YET (correct, new) |
| `apps/web/src/components/pages/products/pricing-page.tsx` | ✗ NOT YET (correct, new) |
| `apps/web/src/components/pages/products/product-price-override-dialog.tsx` | ✗ NOT YET (correct, new) |

### [MEDIUM] `apps/web/src/components/pages/products/` directory does not exist
- Glob `apps/web/src/components/pages/` only contains `services/` subdirectory (categories-page.tsx, promotions-page.tsx, rooms-page.tsx, services-page.tsx)
- Plan creates two new files under `apps/web/src/components/pages/products/` — this directory must be created
- **Risk:** Not blocking — just needs `mkdir` before file creation

---

## Line Number Citations

### [HIGH] Plan §3.5 claims `items-step.tsx` lines 187–199 contain the stale price code
- Actual code was read and verified. The `useQuery` for services-list is present and `services.map` with `price: typeof s.price === "number" ? s.price : null` exists.
- However line numbers change with edits. The description matches but exact lines differ (code starts around line 170 in actual file).
- Line number citation is approximate — **not blocking** for implementation but could mislead a precise line-diff.

### [HIGH] Plan §3.5 references `line 154` for the `disabled={isLookup && !!item.refId}` logic
- Actual code in `items-step.tsx`: The disabled logic reads `disabled={isLookup && !!item.refId && item.type !== "custom"}` — **matches plan description** but the `&& item.type !== "custom"` guard is not mentioned in the plan. This is the existing behavior; plan should note it.

---

## Phase Dependencies

### [INFO] Phase 2 depends on Phase 1 (`services.resolvePrice` must exist)
- `services.resolvePrice` already EXISTS in the current codebase (Agent 2.2 built it)
- Phase 2 can be implemented without waiting for Phase 1 (new expire/delete functions)
- **Plan's phase ordering is safe but the stated dependency is overstated** — Phase 2 is independent of Phase 1 today.

### [INFO] Phase 3 depends on Phase 1 (`services.expireBranchPrice` needed for Expire action)
- Correct dependency: the Expire button in Phase 3 calls `services.expireBranchPrice`
- If Phase 3 is built before Phase 1 completes, the Expire button will fail at runtime
- Plan ordering (P1 → P3) is correct.

### [INFO] Phase 4 depends on Phase 1 (same pattern as Phase 3)
- Correct. Plan ordering is correct.

---

## "Resolved: YES" Claims

The plan does not use "Resolved: YES" notation. No such claims to verify.

---

## Other Consistency Issues

### [HIGH] Plan §3.4 documents `products.listPriceOverrides` as guarded by `service_management:update (check)` but the actual code uses `inventory:read`. **Documentation inconsistency** — code is correct, plan doc is wrong.

### [MEDIUM] Plan §5 Phase 3 Step 1 says to add `"pricing"` to the `TABS` array in `service/view.tsx`. The actual TABS array is:
```typescript
const TABS = [
  { id: "services", label: "Services" },
  { id: "categories", label: "Categories" },
  { id: "rooms", label: "Rooms" },
  { id: "promotions", label: "Promotions" },
];
```
Plan says add `{ id: "pricing", label: "Pricing" }`. The content switch uses `tab === "pricing"` — also needs to be added to the conditional chain. Plan describes this but the existing content switch uses if-else chain, not a map. **Implementation note: must add both the TABS entry and the conditional branch.**

### [MEDIUM] Plan §5 Phase 4 Step 1 says products/view.tsx needs a tab URL search param added (`tab` default "products"). But the current `products/view.tsx` does NOT have tab state or `validateSearch`. The plan correctly identifies this as something to add, but the description "add tab state: URL search param `tab` (default "products"); values: "products" | "pricing"" requires adding `validateSearch` to the route definition, not just wrapping existing content. **The plan is correct but under-specifies the TanStack Router `validateSearch` addition.**

### [LOW] Plan §5 Phase 3 says query key `["service-price-overrides", organizationId, serviceId]` — but the plan also says the page shows "all active overrides across all accessible services" on load. If the page fetches all services and then all overrides per service, the query key per service is correct. But the "all overrides" initial view would need a different key like `["service-price-overrides-all", organizationId]`. Both are listed in the plan — consistent.

### [LOW] Plan §2 (After section) says admin opens `/dashboard/service/view?tab=pricing`. The actual route is `/_authenticated/dashboard/_layout/service/view` with `validateSearch` already configured (`tab` defaulting to `"services"`). Adding `"pricing"` to the schema is straightforward.

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| `products/` component dir doesn't exist yet | MEDIUM | Yes — note in plan |
| Line numbers in §3.5 are approximate | HIGH | Yes — remove/qualify line numbers |
| `products.listPriceOverrides` permission doc incorrect | HIGH | Yes — fix plan §3.4 table |
| Phase 4 under-specifies `validateSearch` addition | MEDIUM | Yes — add to plan |
| `items-step.tsx` disabled logic has `&& item.type !== "custom"` not noted | HIGH | Yes — add to plan |
