# API Surface Audit
**Session:** 05-30_16-58_post-approval-scheduling
**Findings:** 4 (C: 2 · H: 2 · M: 0 · L: 0 · I: 0)

## Findings

### [CRITICAL] appointments.proposeSchedule missing
**Plan claims:** New query procedure `appointments.proposeSchedule` in `packages/api/src/routers/appointments/` folder module
**Actual:** No proposeSchedule procedure exists in any appointments/*procedures.ts file. Existing procedures: create, update, reinstateCredits, materializeOccurrence, splitSeries, list, getById
**File:** packages/api/src/routers/appointments/index.ts:7 (router merge point)
**Fix:** Create proposals.procedures.ts with proposeSchedule query; add to appointments/index.ts exports

---

### [CRITICAL] appointments.bulkCreateFromSchedule missing
**Plan claims:** New mutation procedure `appointments.bulkCreateFromSchedule` in `packages/api/src/routers/appointments/` folder module
**Actual:** No bulkCreateFromSchedule procedure found. Only CRUD procedures: create, update, reinstateCredits
**File:** packages/api/src/routers/appointments/index.ts:7 (router merge point)
**Fix:** Add bulkCreateFromSchedule to proposals.procedures.ts or create bulk.procedures.ts; export from index.ts

---

### [CRITICAL] trainerAvailability.coverageForPreferredTimes missing
**Plan claims:** New query procedure `appointments.reschedule` (HIGH, actually part of appointments mutation)
**Actual:** No coverageForPreferredTimes procedure in trainer-availability.ts. Existing procedures: list, listByBranch, getComputedSlots, upsert, delete, create, update, getConflicts, getUtilisation, addException, listExceptions, deleteException (13 total)
**File:** packages/api/src/routers/trainer-availability.ts:34–343 (full router)
**Fix:** Add coverageForPreferredTimes query procedure to trainer-availability.ts

---

### [CRITICAL] appointments.reschedule missing
**Plan claims:** New mutation procedure `appointments.reschedule` in `packages/api/src/routers/appointments/` folder module
**Actual:** No reschedule procedure found. Recurrence procedures (materializeOccurrence, splitSeries) exist but not reschedule
**File:** packages/api/src/routers/appointments/index.ts:7 (router merge point)
**Fix:** Add reschedule to proposals.procedures.ts or reschedule.procedures.ts; export from index.ts

---

### [HIGH] schedule-proposal.service.ts missing
**Plan claims:** New file `packages/services/src/schedule-proposal.service.ts` for schedule proposal logic
**Actual:** File does not exist. Services directory contains 85 service files but no schedule-proposal.service.ts
**File:** packages/services/src/ (directory listing)
**Fix:** Create schedule-proposal.service.ts with required exports; ensure it's indexed in packages/services/src/index.ts if applicable

---

### [HIGH] ScheduleSessionsPanel.tsx missing
**Plan claims:** New file `apps/web/src/features/approvals/components/ScheduleSessionsPanel.tsx`
**Actual:** File does not exist. Approvals components: BulkActionBar, BulkApproveDialog, BulkRejectDialog, ExpandedRowDetail, FilterBar, HeroStats, InboxList, InboxRow, PriorityDot, TrainerAvatar (10 components, no ScheduleSessionsPanel)
**File:** apps/web/src/features/approvals/components/ (directory listing)
**Fix:** Create ScheduleSessionsPanel.tsx in approvals components folder

---

## Verification checklist (PASSED)
✓ appointments folder is a module (has index.ts)
✓ baseRouter exports `appointments` at key `appointments` (line 81 of base-router.ts)
✓ baseRouter exports `trainerAvailability` at key `trainerAvailability` (line 122 of base-router.ts)
✓ trainerAvailability.list takes trainerId (line 39 of trainer-availability.ts)
✓ trainerAvailability.getComputedSlots exists (line 69 of trainer-availability.ts)
✓ preferredTimes.list exists and takes packageInstanceId (line 35 of preferred-times.ts)
✓ appointments.reinstateCredits exported from crud.procedures.ts (line 328 of crud.procedures.ts)
✓ appointments.create exists and uses tenantProcedure (line 51 of crud.procedures.ts)
✓ appointments.update exists and uses tenantProcedure (line 201 of crud.procedures.ts)
✓ packageInstances.assignTrainer exists (found in assign.procedures.ts)
✓ members.list exists in members/list.procedures.ts (line 22)
✓ ExpandedRowDetail.tsx exists in approvals/components
✓ AppointmentDetailDialog.tsx exists in appointments/components
✓ AttendanceDialog.tsx exists in appointments/components

## Exports verified
✓ tenantProcedure pattern used consistently across routers

## Summary
**Critical issues:** 4 (3 procedures not created, 1 service file)
**High issues:** 2 (1 service file, 1 component file)
**Action:** Implement all 3 procedures (proposeSchedule, bulkCreateFromSchedule, reschedule, coverageForPreferredTimes) before plan execution. Create schedule-proposal.service.ts and ScheduleSessionsPanel.tsx.
