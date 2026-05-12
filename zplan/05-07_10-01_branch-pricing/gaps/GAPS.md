# GAPS — Per-Branch Pricing Overrides — Pass 1
**Session:** `05-07_10-01_branch-pricing`
**Date:** 2026-05-07
**Pass:** 1 of 2

---

## Priority Fix Order

### P1 — Critical (must fix before implementation)

| # | Finding | Lens | Auto-fixable |
|---|---|---|---|
| C1 | 4 missing oRPC procedures not yet implemented: `services.expireBranchPrice`, `services.deleteBranchPrice`, `products.expireBranchPrice`, `products.deleteBranchPrice` | api-surface | No (implementation required) |
| C2 | 4 missing service-layer functions: `expireServicePrice`, `expireProductPrice`, `deleteServicePrice`, `deleteProductPrice` | api-surface | No (implementation required) |
| C3 | `handleServiceSelect` async void pattern: calling `await client.services.resolvePrice()` inside a `onValueChange` handler typed as `void` — TypeScript strict will error | type-safety | Yes — add pattern guidance to plan |
| C4 | Zero unit tests for new `expire*` / `delete*` service functions | test-coverage | No (test authoring required) |
| C5 | Zero POS component tests for `items-step.tsx` branch-aware price resolution | test-coverage | No (test authoring required) |

### P2 — High (fix before first review)

| # | Finding | Lens | Auto-fixable |
|---|---|---|---|
| H1 | Plan §3.4: `products.listPriceOverrides` documented as `service_management:update` — actual code uses `inventory:read`. Fix plan text. | schema-drift / api-surface / doc-consistency | Yes |
| H2 | N+1 on admin pricing page load: fetching all service overrides requires N service calls. Plan should specify filter-first UX or add batch endpoint. | scalability | Yes (UX spec) |
| H3 | `customerType` should be validated as `z.enum(["member", "walk_in"])` not `z.string()` in `setBranchPrice`/`expireBranchPrice` Zod schemas | type-safety | Yes (update plan spec) |
| H4 | Branch name not returned by `listPriceOverrides` — UI table needs lookup strategy (client-side from hierarchy cache or server-side join) | type-safety | Yes (add to plan Phase 3) |
| H5 | `ItemsStepProps.selectedCustomer` should be optional (`?: SelectedCustomer | null`) to avoid breaking `pos-workflow.tsx` call site during implementation | type-safety | Yes (update plan interface) |
| H6 | Phase 4 under-specifies `validateSearch` addition to `products/view.tsx` route definition | doc-consistency | Yes (add to plan) |
| H7 | `deleteBranchPrice` missing tenant isolation check spec in Phase 1 handler | type-safety | Yes (add to plan) |
| H8 | `deleteBranchPrice` authorization rejection test (staff without delete permission) missing from test plan | test-coverage | No (test authoring) |
| H9 | `expireBranchPrice` tenant isolation test missing | test-coverage | No (test authoring) |
| H10 | Line numbers in §3.5 (`lines 187–199`, `line 154`) are stale — remove or qualify | doc-consistency | Yes |

### P3 — Medium (fix before implementation complete)

| # | Finding | Lens | Auto-fixable |
|---|---|---|---|
| M1 | `apps/web/src/components/pages/products/` directory doesn't exist — must be created | doc-consistency | Yes (note in plan) |
| M2 | `hierarchyNodes.type` column existence not confirmed — plan filters branches by type | schema-drift | No (needs verification) |
| M3 | `resolveServicePrice` JS-side filtering skips index for branchId/customerType dimensions | scalability | Yes (note in plan, defer) |
| M4 | `expireServicePrice` last-write-wins race condition — not documented | scalability | Yes (note in plan) |
| M5 | `setBranchPrice` accumulates superseded rows (no auto-expire) | scalability | Yes (note in plan) |
| M6 | `listServicePriceOverrides` expired-row exclusion not tested | test-coverage | No (test authoring) |
| M7 | Phase 3 UX: `effectiveFrom` dialog field should pre-fill to current datetime | schema-drift | Yes (note in plan) |

### P4 — Low (informational, fix if time allows)

| # | Finding | Lens | Auto-fixable |
|---|---|---|---|
| L1 | Phase 1 step 2 (`index.ts` re-export) is redundant — `export *` wildcard covers it | api-surface | Yes (remove step) |
| L2 | `resolveProductPrice` has zero test coverage | test-coverage | No |
| L3 | `listServicePriceOverrides` no pagination | scalability | No |

---

## Lens Summary Table

| Lens | CRITICAL | HIGH | MEDIUM | LOW | INFO |
|---|---|---|---|---|---|
| schema-drift | 0 | 2 | 2 | 0 | 4 |
| api-surface | 5 | 3 | 1 | 1 | 5 |
| test-coverage | 2 | 2 | 1 | 1 | 1 |
| doc-consistency | 0 | 4 | 3 | 1 | 2 |
| type-safety | 1 | 3 | 2 | 1 | 0 |
| scalability | 0 | 1 | 3 | 2 | 1 |
| **TOTAL** | **8** | **15** | **12** | **6** | **13** |

---

## Auto-fixable Findings

The following can be fixed by editing `plan/plan.md` directly:

| ID | Fix |
|---|---|
| C3 | Add async handler pattern note to Phase 2 items-step spec |
| H1 | Fix §3.4 table: `products.listPriceOverrides` → `inventory:read` |
| H2 | Add filter-first UX note to Phase 3, or add batch endpoint to Phase 1 |
| H3 | Change `customerType: z.string().nullable().optional()` to `z.enum(["member","walk_in"]).nullable().optional()` in Phase 1 spec |
| H4 | Add branch name lookup strategy note to Phase 3 |
| H5 | Change `selectedCustomer: SelectedCustomer \| null` to `selectedCustomer?: SelectedCustomer \| null` in Phase 2 interface spec |
| H6 | Add `validateSearch` to Phase 4 step 1 spec |
| H7 | Add tenant isolation check to Phase 1 `deleteBranchPrice` handler spec |
| H10 | Remove/qualify line numbers in §3.5 |
| M1 | Add note that `apps/web/src/components/pages/products/` must be created |
| M3 | Add note about JS-side filtering in §7 Performance |
| M4 | Add race condition note to §7 Transaction safety |
| M5 | Add superseded-row accumulation note to §6 |
| M7 | Add `effectiveFrom` pre-fill note to Phase 3 dialog spec |
| L1 | Remove Phase 1 step 2 (index.ts re-export) or note it's a no-op |

Non-auto-fixable (require implementation work or external verification):
- C1, C2: Implementation required (Phase 1)
- C4, C5, H8, H9, M6, L2: Test authoring required
- M2: Verify `hierarchyNodes.type` column

---

## Token Cost Estimates

- Auto-fixes to `plan.md`: ~15 targeted edits, ~2K tokens
- Pass 2 re-audit: ~3K tokens (smaller scope)
- Total audit passes: ~8K tokens

---

## Non-auto-fixable Summary

| Category | Count | Action |
|---|---|---|
| Implementation (Phase 1) | 2 | Dev work — new service functions + oRPC procedures |
| Test authoring | 6 | Dev work — unit + integration + component tests |
| External verification | 1 | Check `hierarchyNodes.type` column in hierarchy.ts |
