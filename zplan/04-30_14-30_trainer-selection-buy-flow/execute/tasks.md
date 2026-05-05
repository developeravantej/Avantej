# Task Inventory

**Plan:** zplan/04-30_14-30_trainer-selection-buy-flow/plan/plan.md
**Generated:** 2026-04-30 15:35
**Total tasks:** 17

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | Add `preferredTrainerId` column to `package_instances` schema (`packages/db/src/schema/tenant/package-instances.ts`) + run `bun db:generate` + `bun db:push` | Agent A (backend) | pending |
| 2 | 1 | Update `createPackageInstance` service to accept + insert `preferredTrainerId` (`packages/services/src/package-instance.service.ts`) | Agent A (backend) | pending |
| 3 | 1 | Add `preferredTrainerId` to `packageInstances.create` input schema and pass through to service (`packages/api/src/routers/package-instances.ts`) | Agent A (backend) | pending |
| 4 | 1 | Enrich `getById` response with `preferredTrainerName` (resolve from control panel via members → user.name) | Agent A (backend) | pending |
| 5 | 1 | Enrich `listPending` rows with `preferredTrainerId` + `preferredTrainerName` | Agent A (backend) | pending |
| 6 | 1 | Add `listByBranch` procedure to `trainerAvailability` router + service function | Agent A (backend) | pending |
| 7 | 2 | Add `preferredTrainerId` + `preferredTrainerName` to `PurchaseFlowState` (defaults null, cleared in `reset()`) | Agent B (native) | pending |
| 8 | 2 | Create `apps/native/app/(app)/dashboard/buy-package/trainer.tsx` (new) — list active trainers in branch, expandable availability, select/skip | Agent B (native) | pending |
| 9 | 2 | Wire trainer step into buy-package `_layout.tsx` (add Stack.Screen) and `setup.tsx` (conditional nav based on `schedulingType`) | Agent B (native) | pending |
| 10 | 2 | Show preferred trainer card on `review.tsx` (inline View/Ionicons/Text matching existing pattern) | Agent B (native) | pending |
| 11 | 2 | Pass `preferredTrainerId` in `packageInstances.create` call from `pay.tsx` | Agent B (native) | pending |
| 12 | 3 | Create `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/availability.tsx` (new) — table grid using `trainerAvailability.listByBranch` | Agent C (web-avail) | pending |
| 13 | 3 | Create `apps/web/src/components/trainers/trainer-availability-sheet.tsx` (new) — per-trainer detail sheet | Agent C (web-avail) | pending |
| 14 | 3 | Add "Trainer Availability" link to `apps/web/src/components/app-sidebar.tsx` (icon: `CalendarRange`) | Agent C (web-avail) | pending |
| 15 | 4 | Add `preferredTrainerId`+`preferredTrainerName` to `PendingRow` type + show "Preferred: {name}" badge on Approvals table (`apps/web/src/routes/_authenticated/dashboard/_layout/operations/approvals.tsx`) | Agent D (web-approvals) | pending |
| 16 | 4 | Pass `row.preferredTrainerId` as `defaultTrainerMemberId` when opening AssignTrainerDrawer in `approvals.tsx` (drawer prop already exists) | Agent D (web-approvals) | pending |
| 17 | 4 | Show preferred trainer section on native `apps/native/app/(app)/dashboard/packages/[id].tsx` when status==="pending" | Agent D (web-approvals) | pending |
