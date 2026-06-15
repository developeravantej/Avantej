# API Surface Audit
**Session:** 05-30_15-23_commission-tracks
**Findings:** 9 (0 C · 3 H · 3 M · 2 L · 1 I)

## Findings

### [HIGH] Web route paths in plan do not exist — commission review UI lives at `/dashboard/commissions`, not `/dashboard/operations/commissions`
**Plan claims:** Journey C and §3.4/§5 P3 repeatedly reference `/dashboard/operations/commissions` as the commission review inbox, and Journey A references `/dashboard/settings/commissions` as the commission config page.
**Actual:** No `operations/` directory under `dashboard/_layout/` contains a commissions route, and there is no `settings/commissions` route. The actual review/liability inbox is `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx` (renders `<ReviewTab />` + `<LiabilityTab />` from `components/pages/commissions/`). The only commission-related `settings/` route is `settings/commission-cycles.tsx`.
**File:** apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx:75-77 ; apps/web/src/routes/_authenticated/dashboard/_layout/settings/commission-cycles.tsx
**Fix:** Rewrite Journeys A/C "Where it lives" and the P3 file list to target the real routes: review grouping goes into `commissions/view.tsx` + `components/pages/commissions/review-tab.tsx`; the track config editor either extends the existing `category-commission-form.tsx` (see next finding) or adds a new `settings/commissions.tsx`. Decide and pin one — do not leave `operations/commissions` in the plan.
---

### [HIGH] Commission config UI is not a standalone settings page — it is a form embedded in the service-category table
**Plan claims:** Journey A: "Manager navigates to `/dashboard/settings/commissions` → selects 'Personal Training' → sees tabs Delivery · + Add track." Implies a dedicated commission settings page with a category picker.
**Actual:** Commission config is authored via `apps/web/src/components/forms/category-commission-form.tsx`, launched from `apps/web/src/components/tables/service-category/view/data-table.tsx` (per-category row action). There is no top-level commission settings page with a category selector; the "selects Personal Training" step is actually "open the commission config dialog for that category row."
**File:** apps/web/src/components/forms/category-commission-form.tsx ; apps/web/src/components/tables/service-category/view/data-table.tsx
**Fix:** Either (a) build the tabbed track editor INTO `category-commission-form.tsx` (matches "same place the old flow lived" rule), or (b) introduce a new dedicated route and explicitly state the old per-category-row entry point is being replaced. Update Journey A steps to reflect the real launch point.
---

### [HIGH] Backend router merge point is `base-router.ts`, not `routers/index.ts` — new `commission-tracks` router must register there
**Plan claims:** §3.4 / §5 P3.5: add `packages/api/src/routers/commission-tracks/` folder module. The orchestration brief states the merged router is `baseRouter`/`appRouter` in `packages/api/src/routers/index.ts`.
**Actual:** `routers/index.ts` only assembles `appRouter` from `baseRouter` + server-only router type stubs. The real `baseRouter` object — where shared routers like `commissionSplits`, `categoryCommission`, `commissionCycle` are merged — is `packages/api/src/routers/base-router.ts` (commissionSplits registered at line 110). A new `commissionTracks` key must be imported and added to the `baseRouter` literal in `base-router.ts`. The plan never names this file.
**File:** packages/api/src/routers/base-router.ts:10-15,110-112
**Fix:** Add a P3.5 sub-task: `import { commissionTracksRouter } from "./commission-tracks"` in `base-router.ts` and add `commissionTracks: commissionTracksRouter,` to the `baseRouter` object. It will then flow through `appRouter`/`AppRouter` automatically (no `_types` stub needed — it is a shared, not server-only, router).
---

### [MEDIUM] Existing analogs (`category-commission`, `commission-cycle`) are single-file routers, not folder modules — folder pattern is correct for new code but precedent is mixed
**Plan claims:** §3.4: new procedures under `packages/api/src/routers/commission-tracks/` "(folder module)"; CLAUDE.md says newly created routers should use the folder pattern from the start.
**Actual:** Confirmed: `commission-splits/` IS a folder module (index.ts re-export + read/lifecycle/analytics/review.procedures.ts), matching the plan's description exactly. However the directly comparable config routers `category-commission.ts` and `commission-cycle*` are single `.ts` files. The folder pattern is the documented convention (and required if >400 LOC), so the plan's choice is correct — just note the new router should re-export via `index.ts` and split files only if it approaches 400 LOC. `list/upsertTrack/setTrackRates/setCoachSlots/deactivateTrack` is ~5 procedures and may comfortably fit one file initially.
**File:** packages/api/src/routers/commission-splits/index.ts:1-12 ; packages/api/src/routers/category-commission.ts
**Fix:** No change required; optionally relax §5 P3.5 to "single file or folder module per the 400-LOC gate." Keep `index.ts` re-export so the `base-router.ts` import path is stable.
---

### [MEDIUM] Review procedure key is `resolveReview`, not `resolvePendingReview` — plan conflates the procedure name with the service fn name
**Plan claims:** §3.4 Review router: extend `commission-splits/review.procedures.ts` `listPendingReview`. (Procedure names cited in brief: listPendingReview / resolveReview.)
**Actual:** `review.procedures.ts` exports two procedure keys: `listPendingReview` (correct) and `resolveReview` (NOT `resolvePendingReview`). The underlying service fn is `resolvePendingReview` (commission-splits.service.ts:2452) but the oRPC procedure key clients call is `commissionSplits.resolveReview`. The `listPendingReview` service fn and procedure key happen to share a name. Plan text is fine for `listPendingReview` but anywhere it implies `resolvePendingReview` as a procedure is wrong.
**File:** packages/api/src/routers/commission-splits/index.ts:119-120 ; packages/api/src/routers/commission-splits/review.procedures.ts:119-120
**Fix:** When extending review, the client call is `client.commissionSplits.listPendingReview(...)` / `.resolveReview(...)`. Add `trackId?`/`roleType?` to `listPendingReviewProcedure`'s input zod object (line 18-30) and thread into the `listPendingReview` service call.
---

### [MEDIUM] Permission resource `commission_track_management` is absent — must be added to the Resource union
**Plan claims:** §3.4 / §5 P3.5: "New permission resource `commission_track_management` (config)."
**Actual:** Confirmed absent. The `Resource` type in `permission.service.ts` (lines 40-69) has `commission_management`, `trainer_tier_management`, `category_commission_management`, `commission_payout`, `commission_review` — but no `commission_track_management`. It must be added to the union, and any permission-seeding / role-defaults that enumerate resources must include it.
**File:** packages/services/src/permission.service.ts:47-51
**Fix:** Add `| "commission_track_management"` to the Resource union. Trace seed/role-default lists (search for `category_commission_management` usages) and grant it wherever `category_commission_management` is granted, so existing config admins gain track config access without a manual grant. Note (from memory): localStorage permission cache means admins must clear localStorage or wait 5 min after the grant lands.
---

### [LOW] Calculator entry-point callers confirmed — only two, both internal; no caller breakage in P1/P2 as claimed
**Plan claims:** §6 impact table: `calculateCommissionForAppointment`/`calculateCommissionForPos` signatures unchanged in P1/P2 → no caller break; `_buildSplits` must be redirected only if imported elsewhere.
**Actual:** Verified. `calculateCommissionForAppointment` has exactly one non-test caller: `appointment.service.ts:1046`. `calculateCommissionForPos` has exactly one: `pos.service.ts:1005` (lazy `await import`). Both also exported via services barrel (`index.ts:108-109`). `_buildSplits` is referenced ONLY inside `commission-calculator.service.ts` (lines 173, 274, 311) — not imported anywhere else — so deleting it in P1.4 is safe. POS call confirmed passing `requireTrainerRole: false` (gotcha #3 accurate).
**File:** packages/services/src/appointment.service.ts:1046 ; packages/services/src/pos.service.ts:1005 ; packages/services/src/commission-calculator.service.ts:173,274,311
**Fix:** None. Plan's breakage analysis is accurate. Keep both signatures byte-stable through P2.
---

### [LOW] All cited EXISTING service functions confirmed at stated locations
**Plan claims:** applyCommissionCaps, createCommissionSplit, reverseForRefund, getLatestConfigVersionForCategory, listPendingReview, resolvePendingReview, liabilitySummary, liabilityByStaff, listCommissionLedger in commission-splits.service.ts; calculateCommissionForAppointment/calculateCommissionForPos in commission-calculator.service.ts.
**Actual:** All confirmed. commission-splits.service.ts: applyCommissionCaps:322, createCommissionSplit:508, liabilitySummary:1036, liabilityByStaff:1570, listCommissionLedger:1750, getLatestConfigVersionForCategory:1925, reverseForRefund:2053, listPendingReview:2363, resolvePendingReview:2452. commission-calculator.service.ts: calculateCommissionForAppointment:61, calculateCommissionForPos:190. The `configVersionId` INNER JOIN cap mechanism (gotcha #2) confirmed at commission-splits.service.ts:436. Note: commission-splits.service.ts is a single ~2500-LOC service file (not folder-split) — fine for services (the 400-LOC gate is router-only).
**File:** packages/services/src/commission-splits.service.ts ; packages/services/src/commission-calculator.service.ts
**Fix:** None.
---

### [INFO] New tenant migration number should be 0082+, not "NNNN" after 0078 — 0079–0081 already authored on this branch
**Plan claims:** §3.3 / P2.1 references migrations after `0078`. Memory notes 0079–0081 (stock_movements, cancellation_sequence, credit_point_ledger) authored on branches `Checkpoint_May_29`.
**Actual:** `packages/db/src/migrations/tenant/0079_stock_movements.sql` already exists on disk; memory documents 0080/0081 as authored too. The next free number is 0082 (or higher if 0080/0081 SQL files land). POS attribution (sales_orders) confirmed lacking `soldBy`/`leadSourceUserId` (only `customerType`, `totalAmount` present) — so P3.1's additive migration is correct. Schema rename targets all exist: `trainer-tiers.ts`, `commission-tier-rates.ts`, `commission-coach-slots.ts`, `commission-splits.ts`. POS checkout UI lives in `components/pos/pos-workflow.tsx` (no `checkout` file) for Journey B.
**File:** packages/db/src/migrations/tenant/0079_stock_movements.sql ; packages/db/src/schema/tenant/sales-orders.ts:28-35
**Fix:** Use 0082+ for `commission_tracks` and re-run `bun gen:migrations` after authoring. Point P3.2/Journey B at `components/pos/pos-workflow.tsx`.
---

## Summary

The plan's **service-layer surface is accurate**: every cited existing function exists at the stated file, both calculator entry points have exactly two internal callers (no P1/P2 breakage), `_buildSplits` is private and safely deletable, the `commission-splits/` folder module matches the described structure, and `resolveReview`/`listPendingReview` are the real procedure keys. The `commission-tracks/` folder and `commission_track_management` resource correctly do not yet exist.

The **gaps are concentrated in the web/router wiring the plan describes second-hand:**
- HIGH: Web route paths `operations/commissions` and `settings/commissions` are fictional — the real review UI is `dashboard/commissions/view.tsx` and config is the `category-commission-form.tsx` dialog launched from the service-category table.
- HIGH: The new router registers in `base-router.ts` (the real `baseRouter`), which the plan never names — `routers/index.ts` only assembles server-only stubs.
- MEDIUM: `commission_track_management` must be added to the `Resource` union and seeded alongside `category_commission_management`.
- MEDIUM: `resolveReview` (not `resolvePendingReview`) is the procedure key; extend `listPendingReview` input for the track filter.

No procedure references a non-existent target, and no new procedure is planned as `publicProcedure` — the convention (`tenantProcedure` + `assertOrgContextMatch` + `requirePermissionOrpc`) is consistent across the existing commission router. Fix the route/file references and the `base-router.ts` registration step before P3 implementation.
