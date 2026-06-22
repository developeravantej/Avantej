# Dashboard Launchpad (master/detail home + Overview split)

- **Session id:** badc2a8e-efe7-4fdc-875e-2b3a067ef2db
- **Date:** 2026-06-16 13:10
- **Branch:** feat/dashboard-launchpad @ 3750934b
- **Status:** in-progress (feature complete + gate PASS; not merged — no PR by request)
- **/closing:** Overall 8/10 (A 9 · B 9 · C 8) — PASS

## Scope
Rename the dashboard home: make `/dashboard` a master/detail **"Dashboard" launchpad** for daily front-desk tasks (cards on the left, panel on the right that swaps on click), and move the existing analytics dashboard to **"Overview"** (`/dashboard/overview`). Then pass a `/closing` quality gate (edge cases, e2e+video, best approach) and clear all residuals.

## What was done
- **Launchpad shell** `components/pages/launchpad/DashboardLaunchpad.tsx` — top glance strip (permission-gated tiles, error states), permission-gated card rail, live count badges, keep-alive panel switcher.
- **6 panels embed real components** (`panels.tsx`): New Sale → `PosWorkflow`; Create Customer → `AddCustomerDialog`; View Customers → `CustomersPanel`; Installments → `PackageInstallmentsPage`; Commission Payout → `PayoutsTab`; Trainer Schedule → `SchedulePanel`.
- **Overview route** `routes/.../overview.tsx` hosts the analytics `DashboardPage` (made prop-driven). Sidebar: Home→Dashboard + new Overview entry.
- **Shared hooks (dedup)**: `useCustomerDirectory`, `useTrainerSchedule`, `DirectoryEmptyPane`, `redirectPureSaasOwnerToMissionControl` — collapse ~160 lines of forked logic across panels + origin routes (customers/v2, appointment/view rewired, behavior-preserving).
- **Gating fixes** (from /closing): installments card key → `service_management:read`; summary-strip queries gated on `reports:read`/`user_management:read`; tiles show "—" on error not `0`.
- **Residuals**: keep-alive (POS state survives card switch); `useTrainerSchedule` fails closed when non-admin has no memberId; non-admin (staff) e2e fixture. The staff spec **caught + fixed a real pre-existing 403** — sidebar's `packageInstances.listPending` badge now gated on `hasRole(["admin","trainer"])`.
- **E2E**: `e2e/dashboard-launchpad.journey.spec.ts` (7 admin journeys incl. keep-alive + badges) + `e2e/dashboard-launchpad-nonadmin.staff.spec.ts` (staff, 0×403) + `auth-staff.setup.ts` + `launchpad-staff`/`setup-staff` projects.

## Files changed (launchpad surface, trimmed)
```
DashboardLaunchpad.tsx                  +232   cards.tsx          +78
panels.tsx              +90             customers-panel.tsx +68   schedule-panel.tsx +65
useCustomerDirectory.ts +93             useTrainerSchedule.ts +80  redirect-pure-saas-owner.ts +35
directory-empty-pane.tsx +15            DashboardPage.tsx   ±16   app-sidebar.tsx ±11
routes: overview.tsx +33 · index.tsx −40 · customers/v2/view.tsx −91 · appointment/view.tsx −52
e2e: dashboard-launchpad.journey.spec.ts +162 · *-nonadmin.staff.spec.ts +46 · auth-staff.setup.ts +33
playwright.config.ts +13 · routeTree.gen.ts +23
```

## Commits (this session)
```
3750934b harden(dashboard): launchpad residuals — keep-alive, self-scope, non-admin e2e
76767ce4 refactor(dashboard): de-dupe launchpad panels via shared hooks
0d8e64e8 fix(dashboard): gate launchpad queries by permission + add e2e
95c126ab polish(dashboard): neutral loading state for launchpad
5447e947 feat(dashboard): master/detail launchpad home + Overview split
```
All pushed to `jayng/feat/dashboard-launchpad`. **No PR opened (by request).**

## Commands run
- `bun check-types` (apps/web) → clean (every pass)
- `bunx oxlint <changed files>` → 0 warnings / 0 errors
- `bun e2e:seed` → seeded trainer/staff/client fixtures
- `PW_VIDEO=on bunx playwright test … --project=journeys-e2e --project=launchpad-staff` → **9 passed** (7 admin launchpad + 1 staff + setups), videos in `test-results/`
- `git push` → branch pushed (remote moved to ZHIYUAN-TECHNOLOGY; redirect OK)

## Decisions
- Naming inverts the common convention (landing = "Dashboard" launchpad, analytics = "Overview") — owner's explicit choice.
- Embed real components rather than deep-links; keep selection/filter state local in panels, URL in routes (only legit difference → injected into shared hooks).
- Keep-alive only for visited panels (lazy mount) — preserves POS cart without mounting all panels upfront.
- Did NOT complete a real POS charge (creates financial/Stripe records); did NOT open a PR (outward-facing, awaiting owner go-ahead).

## Open threads
- **No PR** — branch pushed only; owner to decide on PR (note: branch is ~30+ commits ahead of main, mixed history).
- **9 pre-existing failures** in `70-customers-trainers` / `95-appointments-scheduling` route specs — stale `getByRole('heading')` assertions + CRUD fixture specifics; confirmed NOT regressions (committed pre-refactor route had no such heading). Worth a separate cleanup.
- Low/cosmetic: badge still hides (vs "—") on query error; sidebar "Approvals" nav item itself not role-gated (staff click → 403 page) — out of this scope.
- /closing fix plan + full re-rate trail: `_close/closing-2026-06-16_12-38_dashboard-launchpad.md`.
