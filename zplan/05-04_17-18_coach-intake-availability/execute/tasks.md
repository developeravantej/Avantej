# Task Inventory

**Plan:** zplan/05-04_17-18_coach-intake-availability/plan/plan.md
**Generated:** 2026-05-05 HH:MM
**Total tasks:** 13

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | Create `packages/db/src/schema/tenant/coach-intake-availability.ts` | Agent A (backend) | done |
| 2 | 1 | Create `packages/db/src/schema/tenant/coach-intake-exceptions.ts` | Agent A (backend) | done |
| 3 | 1 | Register both schemas in `packages/db/src/schema/tenant/index.ts` | Agent A (backend) | done |
| 4 | 1 | Run `bun db:generate` + `bun db:push` | Agent A (backend) | done |
| 5 | 1 | Create `packages/services/src/coach-intake.service.ts` with 7 functions | Agent A (backend) | done |
| 6 | 1 | Export coach-intake service in `packages/services/src/index.ts` | Agent A (backend) | done |
| 7 | 1 | Create `packages/api/src/routers/coach-intake.ts` with 7 procedures | Agent A (backend) | done |
| 8 | 1 | Register `coachIntake` router in `packages/api/src/routers/index.ts` | Agent A (backend) | done |
| 9 | 2 | Create `apps/native/components/weekly-timetable.tsx` | Agent B (mobile) | done |
| 10 | 2 | Redesign `apps/native/app/(app)/dashboard/buy-package/trainer.tsx` with dropdown + timetable | Agent B (mobile) | done |
| 11 | 3 | Add Tabs + Intake tab to `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/availability.tsx` | Agent C (frontend) | done |
| 12 | 3 | Create `apps/web/src/components/trainers/coach-intake-editor.tsx` | Agent C (frontend) | done |
| 13 | 3 | Create `apps/web/src/components/trainers/coach-intake-claim-dialog.tsx` | Agent C (frontend) | done |
