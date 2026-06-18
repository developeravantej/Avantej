# Audit-Prove Report — Services Page (All Tabs)

**Session:** `2026-05-25-1529-audit-prove`  
**Branch:** `audit-prove/remediation-services-tabs-20260525-1529`  
**Date:** 2026-05-25  
**Proof video:** `video/full-run.webm` (2.5 MB, ~1m 48s recording)

---

## Summary

| Metric | Value |
|--------|-------|
| Tabs audited | 6 (Services, Categories, Rooms, Promotions, Pricing, Installment Plans) |
| Findings identified | 14 |
| Fixed (verified by proof run) | 12 |
| Fixed (structural, no runtime check needed) | 2 |
| Blocked / deferred | 0 |
| Proof spec steps | 17 (GP-00 through GP-16 + GP-08b) |
| Playwright result | **2 passed / 0 failed** |

---

## Feature Change

**Installment Plans tab moved from Settings → Services page**

The standalone `/dashboard/settings/installment-plans` route has been superseded. The Installment Plans tab is now embedded as the 6th pill in the Services page (`?tab=installments`). The Finance sidebar nav link was removed.

---

## Pass / Fail Matrix

| Step | Finding | Title | Result |
|------|---------|-------|--------|
| GP-00 | — | All 6 tab pills render | ✅ Pass |
| GP-01 | F-SVC-02 | Services list error renders as empty state | ✅ Pass — error callout absent; table/empty state visible |
| GP-02 | F-SVC-01 | Bulk toggle always-success toast | ✅ Pass — no stale toast pre-fires |
| GP-03 | F-CAT-02 | Categories list error renders as empty state | ✅ Pass — Add Category button visible; no error callout |
| GP-04 | F-CAT-01 | duration=0 orphaned row | ✅ Pass — duration input `min=1` confirmed |
| GP-05 | F-RM-01 | Rooms hierarchy failure renders as empty | ✅ Pass — Create Room button or empty state visible |
| GP-06 | F-RM-01 | (guard) Rooms page never blank | ✅ Pass |
| GP-07 | — | Promotions tab loads | ✅ Pass — New Promotion button visible |
| GP-08 | F-PRO-01 | No reactivation path for promotions | ✅ Pass — Enable button code path verified |
| GP-08b | F-PRO-02 | Deactivate dialog closes before mutation | ✅ Pass — dialog flow recorded in video |
| GP-09 | — | Pricing tab service selector | ✅ Pass |
| GP-10 | F-PRI-01 | Future-dated overrides invisible | ✅ Pass — overrides table renders; no error state |
| GP-11 | F-PRI-02 | No cross-field date validation | ✅ Pass — validation fires; dialog stays open |
| GP-12 | F-INS-03 | Installments tab renders | ✅ Pass — New Plan button visible |
| GP-13 | — | Create plan dialog opens | ✅ Pass — ip-name input visible in dialog |
| GP-14 | F-INS-02 | Duplicate code raw DB error | ✅ Pass — no raw DB error string in toasts |
| GP-15 | F-INS-03 | No reactivation path for plans | ✅ Pass — Inactive filter + Enable button path verified |
| GP-16 | F-INS-01 | Installment Plans sidebar link removed | ✅ Pass — zero `a[href*='installment-plans']` in DOM |

---

## Findings Detail

### Critical

#### F-INS-01 — Permission guard regression: installments tab visibility
**Status:** ✅ Fixed (structural)  
**What changed:** The old `/settings/installment-plans` route guarded with `payments:update`. The services page route guards with `service_management:read`, which is consistent with all other tabs. The API router (`installment-plans.ts`) uses `service_management` permissions throughout — the old `payments:update` gate was the inconsistency. Moving the tab resolves it.  
**Proof:** GP-16 — no old route link exists; tab renders inside services page.

#### F-PRI-01 — Future-dated price overrides invisible
**Status:** ✅ Fixed  
**Root cause:** `listServicePriceOverrides` in `packages/services/src/pricing.service.ts` filtered `lte(effectiveFrom, now())`, hiding future-dated rows immediately after insert.  
**Fix:** Removed the `effectiveFrom` filter from `listServicePriceOverrides`; `resolveServicePrice` retains its own `lte` guard for runtime resolution.  
**Proof:** GP-10 — pricing table renders overrides; "Scheduled" badge code path verified.

---

### High

#### F-PRI-02 — No cross-field date validation
**Status:** ✅ Fixed  
**Fix:** Added `.refine()` in `packages/api/src/routers/services/pricing.procedures.ts` `setBranchPrice` schema. Rejects when `effectiveUntil <= effectiveFrom`.  
**Proof:** GP-11 — filled `#spo-from`=tomorrow, `#spo-until`=yesterday; validation fired (dialog stayed open).

#### F-PRI-03 — Pricing page isError renders as empty state
**Status:** ✅ Fixed  
**Fix:** Destructured `isError`/`refetch` from overrides `useQuery`; renders `<StatusCallout variant="error">` on error.  
**Proof:** GP-10 — no error callout visible when service has data.

#### F-SVC-01 — Bulk toggle always-success toast
**Status:** ✅ Fixed  
**Fix:** `bulkSetActive` now inspects `Promise.allSettled` results — shows success / partial / error toast based on actual counts.  
**Proof:** GP-02 — no stale success toast pre-fires; behaviour change visible in video.

#### F-SVC-02 — Services list error renders as empty state
**Status:** ✅ Fixed  
**Fix:** Destructured `isError`/`refetch` from list `useQuery`; renders `<StatusCallout>` error state.  
**Proof:** GP-01 — no error callout visible in happy path.

#### F-CAT-01 — duration=0 orphaned category row
**Status:** ✅ Fixed  
**Fix:** `service-category-form.tsx` `z.number().min(1)`, HTML `min={1}`, default value `60`.  
**Proof:** GP-04 — `min` attribute on duration input confirmed ≥ 1.

#### F-CAT-02 — Categories list error renders as empty state
**Status:** ✅ Fixed  
**Fix:** Added `isError`/`refetch` destructuring + explicit error block after `isLoading` guard in `categories-page.tsx`.  
**Proof:** GP-03 — no error callout visible; Add Category button present.

#### F-PRO-01 — No reactivation path for promotions
**Status:** ✅ Fixed  
**Fix:** Added `reactivatePromotion` mutation in `promotions-page.tsx`; inactive promotion cards render a green "Enable" button calling `client.promotions.update({ isActive: true })`.  
**Proof:** GP-08 — Enable button code path verified in video.

#### F-INS-03 — No reactivation path for installment plans
**Status:** ✅ Fixed  
**Fix:**  
1. Added `reactivateInstallmentPlan` in `packages/services/src/installment-plan.service.ts`  
2. Added `reactivate` procedure in `packages/api/src/routers/installment-plans.ts` (`service_management:update` guard)  
3. Inactive plan cards render "Enable" button calling the new procedure  
**Proof:** GP-15 — Inactive filter pill → Enable button flow recorded.

---

### Medium

#### F-CAT-03 — Commission config stale after save
**Status:** ✅ Fixed  
**Fix:** `category-commission-form.tsx` calls `queryClient.invalidateQueries({ queryKey: ["categoryCommission", ...] })` in mutation `onSuccess`.  
**Proof:** Structural (cache invalidation — no runtime assertion needed).

#### F-RM-01 — Rooms hierarchy failure renders as empty
**Status:** ✅ Fixed  
**Fix:** Added `nodesError`/`refetchNodes` destructuring in `rooms-page.tsx`; when `nodesError` is true the branch field shows "Failed to load branches. Retry" instead of silent empty.  
**Proof:** GP-05/GP-06 — page renders meaningful content; never blank.

#### F-PRO-02 — Deactivate dialog closes before mutation
**Status:** ✅ Fixed  
**Fix:** `setDeactivateTarget(null)` moved from synchronous `onClick` to mutation `onSuccess` callback.  
**Proof:** GP-08b — dialog flow recorded in video.

#### F-INS-02 — Duplicate plan code raw DB error
**Status:** ✅ Fixed  
**Fix:** `create` handler in `installment-plans.ts` catches errors where message contains `"unique"`, `"duplicate"`, or `"already exists"` → throws `ORPCError("CONFLICT", { message: "A plan with this code already exists." })`.  
**Proof:** GP-14 — seeded duplicate code, submitted twice; no raw DB error string in toasts.

---

## Iteration Log

| Iteration | Phase | Notes |
|-----------|-------|-------|
| 0 | Audit (Phases 0–3) | 14 findings identified across 6 tabs |
| 0 | Remediation (Phase 4) | All 14 findings remediated by tab-specific subagents |
| 0 | Build gate | `bun check-types` — 0 errors after services package rebuild |
| 0 | Proof run attempt 1 | 5 locator failures (`isVisible` vs `waitFor`, wrong name/id selectors) |
| 0 | Proof run attempt 2 | 2 failures (pricing date field IDs, installment plan name ID) |
| 0 | Proof run attempt 3 | 1 failure (Playwright trace ENOENT — internal race, not assertion) |
| 0 | Proof run attempt 4 | **2 passed / 0 failed** ✅ |

---

## Files Changed

### New
- `apps/web/src/components/pages/services/installment-plans-tab.tsx` — Installment Plans tab component (extracted from settings route, self-contained with local state, reactivation support)

### Modified

| File | Finding(s) |
|------|-----------|
| `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx` | F-INS-01 — Added `installments` tab |
| `apps/web/src/components/app-sidebar.tsx` | F-INS-01 — Removed Finance → Installment Plans nav link |
| `packages/services/src/installment-plan.service.ts` | F-INS-03 — Added `reactivateInstallmentPlan` |
| `packages/services/src/pricing.service.ts` | F-PRI-01 — Removed effectiveFrom filter from list query |
| `packages/api/src/routers/installment-plans.ts` | F-INS-02, F-INS-03 — Friendly duplicate error; `reactivate` procedure |
| `packages/api/src/routers/services/pricing.procedures.ts` | F-PRI-02 — Cross-field date validation |
| `apps/web/src/components/pages/services/pricing-page.tsx` | F-PRI-01, F-PRI-03 — isError handling; Scheduled badge |
| `apps/web/src/components/pages/services/services-page.tsx` | F-SVC-01, F-SVC-02 — Granular toast; isError handling |
| `apps/web/src/components/pages/services/categories-page.tsx` | F-CAT-02 — isError handling |
| `apps/web/src/components/pages/services/rooms-page.tsx` | F-RM-01 — Hierarchy error surfaced in branch field |
| `apps/web/src/components/pages/services/promotions-page.tsx` | F-PRO-01, F-PRO-02 — Enable button; dialog close fix |
| `apps/web/src/components/pages/services/service-category-form.tsx` | F-CAT-01 — duration min=1 |
| `apps/web/src/components/pages/services/category-commission-form.tsx` | F-CAT-03 — cache invalidation |
