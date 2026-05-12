# Swarm Audit — GAPS.md
**Session:** 05-07_10-00_trainer-scheduling
**Run at:** 2026-05-07T10:30:00Z (Pass 1)
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 27 (2 critical · 7 high · 9 medium · 6 low · 3 info)

---

## Priority Fix Order

### P1 — Critical

| # | Lens | Finding | File | Fix |
|---|---|---|---|---|
| C1 | doc-consistency + type-safety | `preferredData` undefined in `PackageRow` — plan's T2.2 code will NOT compile: `preferredData` lives inside `PreferredTimesSection` sub-component, not in `PackageRow` scope | `apps/web/src/components/customers/customer-360/package-row.tsx` | Lift the preferred times query out of `PreferredTimesSection` into `PackageRow`, pass data down as prop; OR refactor `PreferredTimesSection` to accept `editMode` + `onEditStart` callback |
| C2 | test-coverage | `upsert` mutation (admin write) has no test for non-admin getting 403; only `listForMember` 403 test is specified | `apps/server/src/tests/integration/category-buffer-overrides.test.ts` | Add to integration test list: "non-admin cannot `upsert`" + "member with only `service_management:update` can `upsert`" |

### P2 — High

| # | Lens | Finding | File | Fix |
|---|---|---|---|---|
| H1 | doc-consistency | `organizationId` scope in `my-services/view.tsx` not verified — plan uses `organizationId!` but source unknown | `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx` | Read the file before implementing T3.1; confirm `organizationId` source (likely `useUserContext()`) |
| H2 | type-safety | `CategoryOverrideRow.bufferTimeMinutes: number \| null` return type is unnecessarily wide for the upsert (non-null) case | `packages/services/src/category-buffer-overrides.service.ts` | Keep `number \| null` as declared (semantics are correct); add inline comment explaining null = deleted |
| H3 | type-safety | `result!` non-null assertion on `.returning()` — safe for ON CONFLICT DO UPDATE but fragile | `packages/services/src/category-buffer-overrides.service.ts` | Add a guard: `if (!result) throw new Error("Upsert returned no rows")` |
| H4 | type-safety | No `isPending` prop on `CategoryBufferRow` — double-click races | `apps/web/src/components/trainers/category-buffer-row.tsx` | Add `isPending?: boolean` prop; disable Save/Edit buttons when true |
| H5 | test-coverage | `updateMine` null (delete) for owned category — not in test plan | `apps/server/src/tests/integration/category-buffer-overrides.test.ts` | Add test case |
| H6 | api-surface | DB query inside router handler (`updateMine` verification) — style deviation from codebase pattern | `packages/api/src/routers/category-buffer-overrides.ts` | Consider extracting `hasCategoryAssignment(tenantDb, memberId, categoryId)` into service file |
| H7 | scalability | `upsertPreferredTimes` is non-atomic (delete then insert, no transaction) — acknowledged in plan | `packages/services/src/preferred-time.service.ts` | Wrap in `tenantDb.transaction(async (tx) => { ... })` — plan defers but recommends it |

### P3 — Medium

| # | Lens | Finding | File | Fix |
|---|---|---|---|---|
| M1 | type-safety | `PreferredTimeItem.dayOfWeek: string` — oRPC client will infer enum union; `string` not assignable | `apps/web/src/components/customers/customer-360/preferred-times-editor.tsx` | Change to `type DayOfWeek = "monday" \| "tuesday" \| ... \| "sunday"; dayOfWeek: DayOfWeek` |
| M2 | api-surface | `try/catch` loop for OR-permission check swallows non-permission DB errors → 403 instead of 500 | `packages/api/src/routers/category-buffer-overrides.ts` | Check error type in catch: rethrow if not a permission error |
| M3 | doc-consistency | Unnecessary `as CategoryBufferRowData` type cast | `apps/web/src/components/trainers/TrainerServicesSection.tsx` | Remove cast; use imported type directly |
| M4 | type-safety | `refetch` used instead of `queryClient.invalidateQueries` — inconsistent with existing pattern | `apps/web/src/components/trainers/TrainerServicesSection.tsx` and `my-services/view.tsx` | Use `queryClient.invalidateQueries` for consistency |
| M5 | test-coverage | Phase 2 & 3 UI testing deferred — non-trivial behaviors (priority re-assign on remove, max-4 enforcement) | plan/plan.md | Add note that a follow-up test task covers PreferredTimesEditor component tests |
| M6 | api-surface | DB query for `updateMine` verification in router — style deviation | `packages/api/src/routers/category-buffer-overrides.ts` | Move to service layer |
| M7 | scalability | Single-query optimization available for `listCategoryBufferOverridesForMember` | `packages/services/src/category-buffer-overrides.service.ts` | Optional: merge into one JOIN query; current 2-query approach is acceptable |
| M8 | schema-drift | `preferred_times.createdAt` lacks `withTimezone: true` — pre-existing inconsistency | `packages/db/src/schema/tenant/preferred-times.ts` | Track separately; not in scope for this plan |
| M9 | test-coverage | `upsert` OR-permission test (service_management only → success) missing | integration test | Add test case |

### P4 — Low / Info

| # | Lens | Finding | File | Fix |
|---|---|---|---|---|
| L1 | type-safety | `result!.bufferTimeMinutes` — safe but fragile non-null assertion | service file | Add null guard with thrown error |
| L2 | api-surface | `listMine` handler doesn't destructure `input` | router | Style only; no functional issue |
| L3 | scalability | No index on `services.category_id` — pre-existing | schema | Track separately |
| L4 | doc-consistency | `coachIntakeExceptions.date` type claim unverified in plan | plan | Minor doc inaccuracy; no implementation impact |
| L5 | type-safety | `parseInt` vs `Number.parseInt` inconsistency across plan code snippets | component | Use `Number.parseInt` consistently per Biome preference |
| L6 | schema-drift | Extra indexes on MCBO (`mcbo_member_idx`, `mcbo_category_idx`) beyond plan description | schema | Info only; extra indexes are fine |

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Notes |
|---|---|---|---|---|---|---|
| schema-drift | 0 | 0 | 1 | 1 | 3 | Tables match exactly; no drift |
| api-surface | 0 | 2 | 2 | 1 | 3 | OR-permission catch is main concern |
| test-coverage | 1 | 3 | 2 | 0 | 2 | Missing upsert permission test is critical |
| doc-consistency | 1 | 2 | 2 | 1 | 2 | preferredData scope is the blocker |
| type-safety | 1 | 2 | 3 | 2 | 1 | dayOfWeek enum + preferredData scope |
| scalability | 0 | 1 | 0 | 3 | 5 | Pre-existing non-atomic upsert is main concern |

---

## Auto-fixable findings

These can be mechanically applied to `plan/plan.md` without design judgment:

| # | Lens | Finding | Location in plan | Mechanical fix |
|---|---|---|---|---|
| AF1 | type-safety | `PreferredTimeItem.dayOfWeek: string` → enum union | T2.1 component code | Replace `dayOfWeek: string` with `dayOfWeek: DayOfWeek` and add the union type definition |
| AF2 | type-safety | `result!` non-null → guarded pattern | T1.1 service code | Add `if (!result) throw new Error(...)` after destructure |
| AF3 | test-coverage | Missing upsert permission tests | Section 7 Testing | Add 2 bullet points to the integration test list |
| AF4 | test-coverage | Missing updateMine null-delete test | Section 7 Testing | Add 1 bullet point |
| AF5 | type-safety | `refetch` → `queryClient.invalidateQueries` | T1.6 + T3.1 code | Replace `refetchCategoryBuffers()` with `queryClient.invalidateQueries({ queryKey: [...] })` |
| AF6 | doc-consistency | `organizationId` scope note missing | T3.1 | Add a note: "Verify organizationId source before implementing" |

---

## Token Cost Estimate

- Schema drift: LOW — 1 file read, trivial comparison
- API surface: MEDIUM — 3-4 files read, moderate analysis  
- Test coverage: MEDIUM — mapping criteria, no file writes needed
- Doc consistency: HIGH — requires reading package-row.tsx fully to confirm D5
- Type safety: HIGH — requires schema cross-referencing
- Scalability: MEDIUM — query analysis, 1 file deep-read

**Total estimated fix cost:** ~2 hours implementation, dominated by C1 (PackageRow refactor).
