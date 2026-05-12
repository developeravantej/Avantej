# Execution Run — Trainer Scheduling & Buffers

**Date:** 2026-05-07  
**Plan:** `zplan/05-07_10-00_trainer-scheduling/plan/plan.md`  
**Status:** COMPLETE

---

## Phases Delivered

### Phase 1 — Category Buffer Override (backend + admin UI)

**Files created:**
- `packages/services/src/category-buffer-overrides.service.ts` — `listCategoryBufferOverridesForMember` + `upsertCategoryBufferOverride`
- `packages/api/src/routers/category-buffer-overrides.ts` — `listForMember`, `upsert`, `listMine`, `updateMine` procedures
- `apps/web/src/components/trainers/category-buffer-row.tsx` — shared `CategoryBufferRow` component

**Files modified:**
- `packages/services/src/index.ts` — exported new service functions and `CategoryOverrideRow` type
- `packages/api/src/routers/index.ts` — imported and registered `categoryBufferOverrides` router
- `apps/web/src/components/trainers/TrainerServicesSection.tsx` — added import, `categoryBuffers` query, `updateCategoryBufferMutation`, and "Category Buffer Defaults" sub-section UI

**Notes:**
- Permission OR-check: `user_management` OR `service_management` (read/update) — catch-and-continue pattern
- `inArray(col, [])` crash guarded: `if (categoryIds.length === 0) return []`
- `upsertCategoryBufferOverride` guards empty `returning()` with a throw
- `CategoryBufferRow` resets input from prop before entering edit mode (stale state avoidance)
- Category buffers query gated on `isOpen && !!organizationId && !!memberId` — lazy-loads with section

---

### Phase 2 — Admin Edit Preferred Times (Customer 360)

**Files created:**
- `apps/web/src/components/customers/customer-360/preferred-times-editor.tsx` — `PreferredTimesEditor` component (up to 4 slots, day-of-week select + time input, add/remove/save/cancel)

**Files modified:**
- `apps/web/src/components/customers/customer-360/package-row.tsx` — full rewrite:
  - Lifted `preferredTimes` query from `PreferredTimesSection` sub-component into `PackageRow`
  - `PreferredTimesSection` now accepts `data` + `isLoading` as props (no internal query)
  - Added `editingPreferred` state, `draftTimes` state, `queryClient`, `upsertPreferredMutation`
  - "Edit" button opens editor pre-populated from lifted query data
  - On save: `client.preferredTimes.upsert` called → invalidates `["preferredTimes", organizationId, pkg.id]`
  - Query now gated on `enabled: expanded` (lazy-loads only when row is opened)

**CRITICAL note from plan applied:** `preferredData` was inside `PreferredTimesSection` scope, so the query was lifted into `PackageRow` before adding edit mode.

---

### Phase 3 — Staff Self-Service Category Buffer (My Services)

**Files modified:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx`:
  - Added `useMutation`, `useQueryClient` to imports
  - Added `CategoryBufferRow` + `CategoryBufferRowData` import
  - Added `queryClient` from `useQueryClient()` at top of component
  - Added `categoryBuffers` query (`listMine`) gated on `!!organizationId`
  - Added `updateCategoryMutation` calling `updateMine`
  - Added "Category Buffer Defaults" section to render (below DataTable, above Edit Buffer Dialog)
  - `organizationId` confirmed from `userContext?.currentOrganizationId ?? ""`

---

## Type-Check Result

```
web:check-types: PASSED — zero errors
server:check-types: errors present — ALL pre-existing (scripts/, test files, better-auth, admin.ts, middleware); zero new errors from this change
```

---

## Deviations from Plan

None. The plan was followed exactly, including:
- The CRITICAL T2.2 note about lifting the preferred times query into `PackageRow`
- Matching `useMutation` pattern (not `useApiMutation`) in Phase 3 to allow `queryClient.invalidateQueries`
- `isOpen` gate on category buffer query in `TrainerServicesSection`

---

## Open Items (from plan, not in scope)

1. Booking engine does not read `member_category_buffer_overrides` — follow-up task required
2. `upsertPreferredTimes` service is not transactional (pre-existing) — tracked in plan Open Questions
3. `preferred_times.time` format (24h vs 12h display) — QA verification recommended
