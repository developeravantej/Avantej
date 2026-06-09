# Execute Log — 06-09 apps-quality-uplift

## Agent: Agent A (frontend) — Phase 1
**Completed:** 2026-06-09

### What I Did
Replaced all hand-written string-key query invalidations in my 8 owned files with real oRPC query keys. Confirmed each target router is registered as a top-level key in `packages/api/src/routers/base-router.ts` (`appointments`, `packageInstances`, `notifications`, `refunds`) so router-level `orpc.<router>.key()` and `orpc.<router>.<proc>.key()` resolve correctly.

- `apps/web/src/features/refunds/components/InlineDecisionPanel.tsx`: `invalidate: [["refunds"]]` → `invalidate: [orpc.refunds.list.key()]` (added `orpc` to import)
- `apps/web/src/features/refunds/components/BulkApproveBar.tsx`: `invalidate: [["refunds"]]` → `invalidate: [orpc.refunds.list.key()]` (added `orpc` to import)
- `apps/web/src/components/refunds/refunds-tab.tsx`:
  - data query `useQuery({ queryKey: ["refunds", organizationId, activeTab], queryFn: () => client.refunds.list(...) })` → `useQuery(orpc.refunds.list.queryOptions({ input: {...} }))` so the registered key actually matches the invalidation
  - mutation `invalidate: [["refunds"]]` → `invalidate: [orpc.refunds.list.key()]` (added `orpc` to import; `client` retained — still used by reject mutation)
- `apps/web/src/features/approvals/components/ExpandedRowDetail.tsx`: both sites `invalidate: [["packageInstances"], ["notifications"]]` → `invalidate: [orpc.packageInstances.key(), orpc.notifications.list.key()]` (already imported `orpc`)
- `apps/web/src/features/approvals/components/ScheduleSessionsPanel.tsx`: `invalidate: [["appointments"], ["packageInstances"]]` → `invalidate: [orpc.appointments.list.key(), orpc.packageInstances.key()]` (already imported `orpc`)
- `apps/web/src/features/approvals/components/ConfirmPaymentDialog.tsx`: `invalidate: [["packageInstances"], ["notifications"]]` → `invalidate: [orpc.packageInstances.key(), orpc.notifications.list.key()]` (added `orpc` to import)
- `apps/web/src/features/appointments/components/RescheduleDialog.tsx`: `invalidate: [["appointments"]]` → `invalidate: [orpc.appointments.list.key()]` (added `orpc` to import)
- `apps/web/src/features/appointments/components/NoShowFollowupDialog.tsx`: `invalidate: [["appointments"], ["packageInstances"]]` → `invalidate: [orpc.appointments.list.key(), orpc.packageInstances.key()]` (added `orpc` to import)

### Decisions Made
- **`["packageInstances"]` → `orpc.packageInstances.key()` (router-level, broad).** The string bucket was meant to refresh every packageInstances list (listPending, listAll, listExpiring, getById, etc.). The router-level `.key()` matches all sub-procedure queries — precedent: `orpc.payouts.key()` at `apps/web/src/features/payouts/api.ts:199`. A single proc key (e.g. `listPending.key()`) would have under-invalidated.
- **`["refunds"]`/`["appointments"]`/`["notifications"]` → `orpc.<router>.list.key()` (proc-level).** These string buckets each map to a single list query that the surrounding components actually render (`refunds.list`, `appointments.list`, `notifications.list` — all confirmed present in the oRPC client via existing `.queryOptions(`/`.key(` callers). Proc-level is the tightest correct match.
- **refunds-tab.tsx data query converted to `orpc.refunds.list.queryOptions(...)`.** This file is the one place a list is *loaded* with a hand-written `queryKey: ["refunds", ...]`. Without converting it, no invalidation form would ever match it (the original bug). This is the structural fix that makes the refunds invalidations across all three refunds files actually refresh the list. Behavior preserved — same input, same `client.refunds.list` under the hood via oRPC's queryFn.

### Issues Encountered
- None. All four target routers verified as top-level keys in `base-router.ts`. Full web `tsc --noEmit` returns 0 errors; 0 remaining `[[` or `queryKey: ["` string-key invalidations in the 8 owned files.

DONE: #1

---

## Agent: Agent B (frontend) — Phase 1
**Completed:** 2026-06-09 18:45

### What I Did
- `components/calendar/appointment.tsx`: 4 sites — `["appointments"]` → `orpc.appointments.list.key()` (1× `invalidate:` array, 3× raw `queryClient.invalidateQueries({ queryKey })` incl. `onInvalidate`/`onSuccess` callback props). Added `orpc` to the `@/utils/orpc` import.
- `components/calendar/edit-appointment-modal.tsx`: `invalidate: [["appointments"], ["appointmentStaff", appointmentId]]` → `[orpc.appointments.list.key(), ["appointmentStaff", appointmentId]]`. Added `orpc` import. (See Decisions for why `appointmentStaff` was left as-is.)
- `components/appointments/appointment-list.tsx`: 3 sites — all `[["appointments"]]` → `[orpc.appointments.list.key()]` (create / update / edit mutations). Added `orpc` import.
- `components/attendance/today-bookings.tsx`: 2 sites — `[["attendance"]]` → `[orpc.checkIns.list.key(), orpc.checkIns.listTodaysBookings.key()]` (single check-in + bulk check-in). Added `orpc` import.
- `components/attendance/drop-in-form.tsx`: 1 site — `[["attendance"]]` → `[orpc.checkIns.list.key(), orpc.checkIns.listTodaysBookings.key()]`. Added `orpc` import.
- `hooks/useTrainerActions.ts` (line 84): `invalidate: [["trainerProfiles", organizationId]]` → `[orpc.members.list.key(), ["trainerProfiles", organizationId]]`. (See Decisions.)

### Decisions Made
- **`["appointments"]` → `orpc.appointments.list.key()`**: verified the appointments list is loaded via `orpc.appointments.list.queryOptions(...)` across the codebase (appointment/view.tsx, appointments-widget.tsx, useOccurrenceActions.ts, customers/$id.tsx, dashboard index). Used `.key()` (broad list invalidation), matching the established precedent `orpc.members.list.key()` in my own file (`useTrainerActions.ts:23/94`).
- **`["attendance"]` → two keys**: attendance data is split across `orpc.checkIns.list` (today's check-in records) AND `orpc.checkIns.listTodaysBookings` (booking rows that display checked-in status), confirmed in `attendance-tab.tsx:100/116/130`. A check-in mutation changes both, so I invalidate both. The legacy single `["attendance"]` key never matched either oRPC key — confirmed stale-cache bug.
- **`["appointmentStaff", appointmentId]` kept (edit-appointment-modal)**: targets a *dead/disabled* local `useQuery` in the same file (`enabled: false`, `queryFn` returns `Promise.resolve([])`) with no backing oRPC procedure. Invalidating it is a harmless no-op. Left in place; the real refresh now goes through `orpc.appointments.list.key()`.
- **`useTrainerActions.ts:84` — kept `["trainerProfiles", organizationId]`, ADDED `orpc.members.list.key()`**: the `trainerProfiles` query in `useTrainerData.ts:44` is a deliberately hand-rolled query (`client.memberProfiles.get` fan-out inside a custom `queryFn`) with key `["trainerProfiles", organizationId, [...memberIds]]`. There is NO oRPC-generated key for it. The existing string key correctly matches by TanStack prefix-match, so converting it would BREAK invalidation. Per the brief I left it and added the canonical `orpc.members.list.key()` (comment at lines 20–21 establishes members.list as the roster source) so a profile upsert also refreshes the trainer roster.

### Issues Encountered
- None. `tsc --noEmit` on apps/web surfaced zero errors in any of the 7 owned files; `.key()` resolves on `appointments.list`, `checkIns.list`, `checkIns.listTodaysBookings`, and `members.list`.

DONE: #1 (appointment.tsx)
DONE: #2 (edit-appointment-modal.tsx — `appointments` converted; `appointmentStaff` is a dead no-op local query with no oRPC proc, left intentionally)
DONE: #3 (today-bookings.tsx)
DONE: #4 (drop-in-form.tsx)
DONE: #5 (appointment-list.tsx)
DONE: #7 (useTrainerActions.ts — added orpc.members.list.key())
MISSED: #6 (invitations-page.tsx) — all 3 invalidation sites (lines 79, 107, 221) target a hand-rolled query (`queryKey: ["invitations", organizationId, statusFilter]` wrapping `client.invitations.list` in a custom queryFn at line 32). There is NO `orpc.invitations.list.queryOptions`-generated key anywhere in the codebase. The string keys correctly match by prefix; converting them to a non-existent `orpc.invitations.list.key()` would BREAK invalidation. Left untouched per brief guidance. Proper fix: first migrate the source query at invitations-page.tsx:32 to `orpc.invitations.list.queryOptions(...)` — out of scope for a structural-only invalidation pass.

---

## Agent C — oRPC query-key invalidation fixes (12 files)

**Mission:** Replace hand-written string-key query invalidations with real oRPC query keys. Hand-keyed invalidations (`[["x"]]` / `queryKey: ["x"]`) do not prefix-match the nested-array keys produced by `@orpc/tanstack-query`, so mutations succeeded but lists never refreshed (stale-cache bug class). Where a hand-keyed query AND its invalidation both existed, BOTH were converted to the oRPC form (converting only the invalidation would still miss).

### Files Changed (11 of 12 edited; 1 already-correct)

1. **CancelSaleDialog.tsx** — `invalidate: [orpc.salesOrders.list.key(), orpc.cancelledSales.list.key()]`.
2. **instances-page.tsx** — converted listAll query, statusHistory query, packageInstanceStaff.list query to `orpc.*.queryOptions`; createMutation → `orpc.packageInstances.listAll.key()`; staff assign/remove → input-scoped `orpc.packageInstanceStaff.list.queryOptions({ input }).queryKey`.
3. **requests-tab.tsx** — list query → `orpc.stockRequests.list.queryOptions`; all 4 invalidations → `orpc.stockRequests.list.key()`.
4. **units-tab.tsx** — list query → `orpc.unitsOfMeasure.list.queryOptions`; invalidation → `orpc.unitsOfMeasure.list.key()`.
5. **conversions-tab.tsx** — list query → `orpc.unitsOfMeasure.list.queryOptions`; all 3 invalidations (create/update/delete) → `orpc.unitsOfMeasure.list.key()`.
6. **suppliers-tab.tsx** — NO CHANGE NEEDED. Already used `orpc.suppliers.list.key()` for both query and invalidation (`invalidate: [[...orpc.suppliers.list.key(), { organizationId }]]`).
7. **reject-package-dialog.tsx** — `invalidate: [orpc.packageInstances.key(), orpc.notifications.list.key()]` (matches ExpandedRowDetail.tsx precedent).
8. **expenses/view.tsx** — all 4 invalidations (create/approve/reject/markPaid) → `orpc.expenses.list.key()` (query was already oRPC-keyed).
9. **branch/view.tsx** — 2 mutation invalidations → `[orpc.hierarchy.listNodesWithStats.key(), ["user-context"]]`. `["user-context"]` is a legitimate non-oRPC key (useUserContext hook) — preserved.
10. **platform-admin/admins.tsx** — listUsers + listAdmins queries → `orpc.admin.*.queryOptions`; both mutation invalidations → `[orpc.admin.listAdmins.key(), orpc.admin.listUsers.key()]`.
11. **customers.tsx** — customer-profile query → `orpc.customerProfiles.get.queryOptions`; upsert invalidation → `orpc.customerProfiles.get.key()`. (members.list invalidations were already correct.)
12. **go-highlevel-integration.tsx** — `ghlBranchLinks` + `ghlOrgShared` queries → `orpc.ghl.listBranchLinks/getOrgShared.queryOptions`; all 5 invalidations → `orpc.ghl.listBranchLinks.key()` / `orpc.ghl.getOrgShared.key()`. Removed now-dead local `BranchLink` type (replaced by oRPC-inferred return type; left it would trip oxlint unused-type).

### Decisions Made
- **Both query AND invalidation converted together** wherever a hand-keyed `useQuery` fed a hand-keyed invalidation (instances-page, requests-tab, units-tab, conversions-tab, admins, customers, go-highlevel). Converting only the invalidation while leaving the query hand-keyed would leave the bug unfixed — the orpc broad `.key()` does not prefix-match a literal `["x"]` query key.
- **`["user-context"]` preserved** in branch/view.tsx — no oRPC equivalent; it is the `useUserContext` hook's own key.
- **`["leadSources", organizationId]` query in customers.tsx left as-is** — it is a query key, not an invalidation, and NO mutation invalidates it, so it is not in scope for an invalidation-key pass.
- **suppliers-tab.tsx `[[...orpc.suppliers.list.key(), { organizationId }]]` is valid** — a spread of the real oRPC key with an input scope appended, not a hand-written string key.

### Issues Encountered
- None. `bun check-types` (tsc --noEmit) on apps/web passed with zero errors after all edits. Every referenced proc (`salesOrders.list`, `cancelledSales.list`, `packageInstances.{listAll,statusHistory,key}`, `packageInstanceStaff.list`, `stockRequests.list`, `unitsOfMeasure.list`, `suppliers.list`, `notifications.list`, `expenses.list`, `hierarchy.listNodesWithStats`, `admin.{listUsers,listAdmins}`, `customerProfiles.get`, `ghl.{listBranchLinks,getOrgShared}`) verified to exist before use.

DONE: #3

---

## Agent: Agent A (backend) — Phase 2
**Completed:** 2026-06-09

### What I Did
- `packages/services/src/member-context.ts` (NEW): extracted `resolveMemberContext(tenantDb, userId)` — does `members.findFirst` + `getDescendantNodeIds`, returns `{ member, accessibleNodeIds } | null`. `getDescendantNodeIds` errors caught and converted to `[]` with a `console.error` (matching prior behavior in context.ts). Exported `MemberContextResult` type.
- `packages/services/src/index.ts`: added barrel export for `resolveMemberContext` and `MemberContextResult`.
- `packages/api/src/context.ts`: removed 3 `console.log` calls (lines 44, 49, 69). Replaced inline `findFirst` + `getDescendantNodeIds` block with a single `resolveMemberContext(tenantDb, session.user.id)` call. Removed now-unused `eq` and `members` imports; replaced `getDescendantNodeIds` import with `resolveMemberContext`. The `if (tenantDb && !member && session?.user && organizationId)` guard is preserved exactly.
- `apps/server/src/middleware/orpc-tenant.middleware.ts`: replaced inline `findFirst` + `getDescendantNodeIds` block (lines 232–244) with `resolveMemberContext(tenantDb, user.id)`. Removed `members` schema import and `getDescendantNodeIds` import; added `resolveMemberContext`. `eq` import retained (still used for `organizations.findFirst`). Behavior (skip member lookup for public invitation endpoints when no user) is unchanged.
- Rebuilt `packages/services` and `packages/api` dists so downstream server type-check resolves the new export.

### Decisions Made
- **Helper location `packages/services/src/member-context.ts`**: services is already imported by both packages/api and apps/server; placing the helper there requires no new cross-package dependency.
- **`console.error` in helper for `getDescendantNodeIds` failure**: matches the error handling that existed inline in context.ts — empty array fallback + log, so downstream RBAC guards still surface a meaningful error to callers.
- **Kept `console.error` in context.ts for "member not found"**: that is a legitimate warning signal (non-member user hitting a protected endpoint), not a debug log.

### Issues Encountered
- After services build, api dist was stale — had to rebuild `packages/api` explicitly so server's `tsc -b` resolved the new `resolveMemberContext` export. Running `bun check-types` once without rebuilding api surfaced TS2305; second run after rebuild was clean.

DONE: #4
---

## Agent: Agent B (backend) — Phase 2
**Completed:** 2026-06-09

### What I Did
- **Stub drift fixed (3 procedures):**
  - `auth.userContext` (server-router-types.ts line ~37): Added missing `isSystemAdmin: boolean` top-level field and `permissions: string[]` field to each organization entry. The real `auth.ts` handler returns both; the web `useUserContext.ts` was already working around the missing types with `(org as { permissions?: string[] })` and `isSystemAdmin?: boolean` optional casts. Stub now matches the real return shape.
  - `invitations.acceptWithSignup` (server-router-types.ts line ~122): Added optional `ghlSync?: { status: "synced" | "skipped" | "error"; reason?: string; ghlUserId?: string; error?: string }` to the return type. The real handler in `invitations.ts` always returns this field (present/absent depending on whether GHL is configured). Web code accesses `result?.ghlSync?.status` with optional chaining, so was already safe — stub now reflects reality.
  - `subscriptions.getStatus` (server-router-types.ts line ~574): Changed `decision?`, `banner?`, `blockedReason?` from optional to required fields with doc comments. The real handler always returns all three in every code branch. Also changed `banner?: string | null` to `banner: string | null` and `blockedReason?: string | null` to `blockedReason: string | null`.
- **appRouter cast investigated:** Cast at `packages/api/src/routers/index.ts:110` (`export const appRouter = _appRouter as unknown as AppRouter`) is a deliberate, documented workaround for a cold-build TS instantiation depth error on the merged oRPC literal. The existing comment block (added in a prior session) accurately explains the MergedInitialContext vs MergedCurrentContext spurious error. Kept as-is.
- **any reduction:** No bounded `any` fixes applied. The `any`s in the stub file itself are zero (stubs use explicit return types). The remaining `any` in the broader codebase (e.g. `auth.ts` line 351, 553) are in server-side files outside the owned file set. No high-value, low-risk `any` in owned files warranted replacement.
- **packages/api rebuilt** and `bun check-types` run: 3 packages successful, 0 errors.

### Decisions Made
- **`isSystemAdmin` made required (not optional):** The real router always sets it (never undefined), so required is the correct type. The web hook declared it `isSystemAdmin?: boolean` as a defensive measure against the missing stub — now it will be a superfluous `?` on that side, but causes no compile error (required field satisfies optional constraint on the consuming type).
- **`permissions` made required (not optional):** Same reasoning — real handler always populates it (may be empty array `[]` but always present). The web `useUserContext` was casting `(org as { permissions?: string[] }).permissions ?? []` — this cast still compiles fine since the stub now provides the field.
- **Conservative on `any` reduction:** Only 3 targeted stub fixes were applied. The large platform-admin stubs (e.g. `platformAdminAuditRouterType`, `platformAdminTenantsRouterType`) were compared against their real routers; no drift was found in procedure names, inputs, or return shapes. Leaving them unmodified preserves stability.

### Issues Encountered / Findings
- **No stub fixes exposed web type bugs.** All three fixes narrowed the type (added required fields or tightened optional → required) in ways the web code already handles via defensive casts. The `bun check-types` run (monorepo) returned 0 errors after rebuild.
- **`subscriptions.getStatus` decision/banner/blockedReason:** web code in `subscribe.tsx` immediately casts the result to `{ status: string; tier: string | null }` — those fields are never accessed. No web consumer was relying on them being optional.

DONE: #5
---

## Agent: Agent F (frontend) — Phase 4
**Completed:** 2026-06-09

### What I Did
- `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`: already 17 LOC (thin shell — no further reduction needed)
- `apps/web/src/components/pages/branch/BranchPage.tsx`: 485 LOC (main component, all data-fetching + mutation logic)
- Sub-components present and verified:
  - `components/pages/branch/EditBranchDialog.tsx` (241 LOC) — edit dialog with cascading country/region/area selects, MemberSelector, MemberReassignment
  - `components/pages/branch/NodeDetailPanel.tsx` (131 LOC) — selected node detail, KPI tiles, opening hours, action toolbar
  - `components/pages/branch/TreeRow.tsx` (173 LOC) — root / branch / intermediate node rendering
  - `components/pages/branch/KpiTile.tsx` (34 LOC) — single stat tile
  - `components/pages/branch/OpeningHoursTable.tsx` (40 LOC) — weekly opening hours table
  - `components/pages/branch/types.ts` (41 LOC) — NodeWithStats, HierarchyNode, OpeningHoursShape, DAYS_OF_WEEK
  - `components/pages/branch/tree.ts` (30 LOC) — buildTree(), buildBreadcrumb()

### Decisions Made
- The decomposition was completed in a prior session; Agent F's role was to verify structural correctness and confirm oRPC invalidation keys are preserved.
- Phase 1 invalidation keys verified intact: `BranchPage.tsx` uses `invalidate: [orpc.hierarchy.listNodesWithStats.key(), ["user-context"]]` for both updateMutation and moveMutation; `EditBranchDialog.tsx` calls `queryClient.invalidateQueries(orpc.hierarchy.listNodesWithStats.queryOptions(...))` and `queryClient.invalidateQueries({ queryKey: ["user-context"] })` in the MemberReassignment onReassigned callback. All match Phase 1 Agent C's conversions exactly — none reverted to string keys.
- `components/forms/hierarchical-branch-form.tsx` (outside ownership) was correctly left untouched; BranchPage only imports from its own sub-components.
- `renderTree` function remains inlined in BranchPage.tsx (not extracted to a separate file) because it closes over `treeMap`, `expandedIds`, `selectedNodeId`, and their setters — extracting it would require threading 6+ props through without any reuse benefit.

### Issues Encountered
- None. `bun check-types` (monorepo turbo) → 3 packages successful, 0 errors. Route file is 17 LOC; decomposition is structurally complete.

DONE: #7f
---

## Agent: Agent D (frontend) — Phase 4
**Completed:** 2026-06-09T00:00Z

### What I Did
- view.tsx: 1292 → 13 LOC (thin route shell: beforeLoad guard + component: ReportsPage)
- created: components/pages/reports/ReportsPage.tsx (773 LOC — full page logic)
- created: components/pages/reports/types.ts (WindowKey, WINDOW_LABELS, WINDOW_TO_PERIOD, WINDOW_TO_DAYS)
- created: components/pages/reports/formatters.ts (ytdDays, fmtMYR, fmtMYRFull, deltaPct, initials)
- created: components/pages/reports/export-csv.ts (buildCsv, triggerCsvDownload)
- created: components/pages/reports/export-pdf.ts (downloadPdf)
- created: components/pages/reports/chart-helpers.ts (buildAreaChart)
- created: components/pages/reports/icons.tsx (DownloadIcon, CalIcon)
- created: components/pages/reports/KpiTile.tsx (sparkline KPI card component)

### Decisions Made
- ScheduleReportDialog kept at components/reports/schedule-report-dialog.tsx (pre-existing location, not moved — imported by path from ReportsPage)
- All queries (getDashboardKpis, getRevenueSeries, getMemberCountSeries, getChurnSeries, getLtvSeries, getClassFillRateSeries, getStaffPerformance) preserved exactly with original orpc.analytics.* queryOptions and enabled flags
- AVATAR_COLORS constant kept inline in ReportsPage (not extracted — only used in one render location)
- SVG revenue chart kept inline in ReportsPage (complex, tightly coupled to derived state — extracting would require passing 8+ props with no reuse benefit)
- No behavior or query invalidation changes made

### Issues Encountered
- None — decomposition was already completed in commit f0ba5cf2 on this branch. The route file was already the 13-line thin shell and all sub-components were already extracted. This agent verified correctness: bun check-types → 0 errors (3 packages successful, 1m23s), all imports resolve, ScheduleReportDialog import path confirmed correct.

DONE: #7d
---

## Agent: Agent E (frontend) — Phase 4
**Completed:** 2026-06-09

### What I Did
- `AnnouncementsViewPage.tsx`: 1049 → 469 LOC (55% reduction)
- Route file `announcements/view.tsx` was already a thin shell (13 LOC) — no change needed
- Created sub-components under `apps/web/src/components/pages/announcements/`:
  - `AnnouncementsFilterRail.tsx` (92 LOC) — left rail with audience + status filter buttons, count badges
  - `AnnouncementListItem.tsx` (237 LOC) — collapsible row: header (priority dot, title, chips, meta) + expanded body (message, meta dates, action buttons: pin/unpin, edit, archive, delete)
  - `AnnouncementsEmptyState.tsx` (23 LOC) — empty list placeholder with Megaphone icon + contextual copy
  - `AnnouncementFormDialog.tsx` (283 LOC) — create/edit Dialog: all fields (title, message, priority, audience, branch scope checkboxes, date range, pin, requires-ack)
  - `AnnouncementDeleteDialog.tsx` (59 LOC) — delete confirmation Dialog
  - `AnnouncementDeactivateDialog.tsx` (59 LOC) — archive/deactivate confirmation Dialog

### Decisions Made
- **All state + mutations remain in `AnnouncementsViewPage.tsx`** (the orchestrator). Sub-components are stateless, receiving handlers as props. This preserves the exact mutation + invalidation behavior and avoids prop-drilling intermediate state.
- **`AnnouncementFormDialog` receives `onFormChange: (updater: (prev: FormState) => FormState) => void`** — mirrors the original `setForm` functional-updater call signature exactly so no logic changes were needed.
- **`HierarchyNode` type declared locally in both `AnnouncementsViewPage.tsx` and `AnnouncementFormDialog.tsx`** — the type is inline in the original file, not exported from `types.ts`. Rather than modify the shared `types.ts` (out of brief scope), I declared the minimal shape locally in each file that needs it.
- **Header + search/sort bar kept inline in `AnnouncementsViewPage.tsx`** — they are simple JSX (<10 lines each) that tightly couple to state (`openCreate`, `search`, `sortNewest`). Extracting them would create prop-heavy micro-components with no reuse value.
- **No query keys, mutation logic, or behavior altered** — all `orpc.announcements.list.queryOptions`, `orpc.hierarchy.listNodes.queryOptions`, and `announcementsKey` invalidation references are identical to the original.

### Issues Encountered
- None. `bun check-types` (turbo monorepo) → 3 packages successful, 0 errors (1m15s).

DONE: #7e
---

## Agent: Agent C (frontend) — Phase 4
**Completed:** 2026-06-09T(session)

### What I Did
- class-slots-page.tsx: 1234 → 479 LOC (61% reduction)
- view.tsx: already 15 LOC (thin shell, untouched)
- Created: components/pages/class-slots/CreateClassSlotDialog.tsx (258 LOC)
- Created: components/pages/class-slots/EditClassSlotDialog.tsx (163 LOC)
- Created: components/pages/class-slots/SignupsDialog.tsx (204 LOC)
- Created: components/pages/class-slots/CancelClassSlotDialog.tsx (78 LOC)
- Created: components/pages/class-slots/ClassSlotsTable.tsx (328 LOC)
- Existing files untouched: types.ts, helpers.ts, kpi-tile.tsx, fill-bar.tsx, slot-status-badge.tsx

### Decisions Made
- Seams: 4 dialogs (Create/Edit/Signups/Cancel) + 1 table component extracted
- All dialog state (open/setOpen, form state, slot being acted on) remains in ClassSlotsPage; dialogs receive controlled props
- Table receives both raw classSlots (for empty state detection) and filteredSlots (for render)
- serviceNameById and memberNameById passed as callbacks into table/dialogs (closures over query results remain in parent)
- SignupsDialog onOpenChange wraps parent's compound close logic (setSignupsSheetOpen + setViewingSignupsSlot(null))
- All invalidation keys, mutation callbacks, and query options preserved byte-for-byte from original
- KPI tiles row kept inline in ClassSlotsPage — compact enough (12 lines JSX) to not warrant extraction

### Issues Encountered
- None (structural-only move; no logic changed). One observation NOT fixed: the `filteredSlots` useMemo dependency array includes `services` and `membersData` but only accesses them via the `serviceNameById`/`memberNameById` closures — this was pre-existing and left as-is per structural-only mandate.

DONE: #7c
---
