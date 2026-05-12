# Task Inventory

**Plan:** zplan/05-12_12-42_trainer-availability-booking/plan/plan.md
**Generated:** 2026-05-12 13:20
**Total tasks:** 21

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | Add `timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur'` column to `organizations`. Schema update in `packages/db/src/schema/control-panel/organizations.ts` + migration file under `packages/db/src/migrations/control-panel/` | Agent A (backend) | done |
| 2 | 1 | Add `listCoachIntakeAvailability(tenantDb, trainerId)` in `packages/services/src/trainer-availability.service.ts`. Filter `isActive=true` AND `members.isDeleted=false`. | Agent A (backend) | done |
| 3 | 1 | Add `members.isDeleted=false` filter to existing `listTrainerAvailability` (backfill pre-existing gap) | Agent A (backend) | done |
| 4 | 1 | Modify `computeAvailableSlots` to: (a) accept `orgTimezone: string` param, (b) fetch both lists in parallel via Promise.all, (c) dedupe identical (dayOfWeek, startTime, endTime) triples, (d) use `Intl.DateTimeFormat` for day-of-week + HH:MM in org tz | Agent A (backend) | done |
| 5 | 1 | Add helpers `toHHMMInTz(date, tz)` and `dayNameInTz(date, tz)` in same file using Intl.DateTimeFormat (Workers-compatible) | Agent A (backend) | done |
| 6 | 1 | Update `trainerAvailability.getComputedSlots` router in `packages/api/src/routers/trainer-availability.ts` to read `organizations.timezone` from control-panel DB and pass to `computeAvailableSlots` | Agent A (backend) | done |
| 7 | 1 | Verification script `apps/server/scripts/check-trainer-availability-union.ts`: per-trainer counts (trainer_availability, coach_intake, merged) | Agent A (backend) | done |
| 8 | 1 | Update docstring on `computeAvailableSlots` noting both sources are read + tz-aware | Agent A (backend) | done |
| 9 | 2 | Add `status: string \| null`, `expiresAt: string \| null` to `BookingFlowState` in `apps/native/contexts/booking-flow-context.tsx`, init to `null` | Agent B (mobile) | done |
| 10 | 2 | In `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx`, populate `status` + `expiresAt` from selected package in `update()` call (alongside existing `trainerId` hydration) | Agent B (mobile) | done |
| 11 | 2 | In `apps/native/app/(app)/dashboard/book-workout/schedule.tsx`, render gate UI if `state.status !== "active"` or `state.expiresAt` past — "Awaiting approval" / "Package expired" with back button | Agent B (mobile) | done |
| 12 | 2 | In `apps/native/app/(app)/dashboard/book-workout/review.tsx`, defensive guard re-checking `state.status === "active"` before `appointments.create` | Agent B (mobile) | done |
| 13 | 3 | In `schedule.tsx`, change `sliceWindowIntoSlots` default `stepMin = SLOT_STEP_MIN = 30` (constant). Loop bound stays `t + durationMin <= endMin` | Agent B (mobile) | done |
| 14 | 3 | Add `dropPastTimes(slots, dateKey)` helper in `schedule.tsx`. Filter slots whose start <= now + `MIN_LEAD_MIN = 15` when dateKey === today | Agent B (mobile) | done |
| 15 | 3 | Verify `selectedDate` change clears `selectedTime` (already present — confirm) | Agent B (mobile) | done |
| 16 | 4 | Locate `appointments.create` handler. Verify path (likely `packages/api/src/routers/appointments.ts`) | Agent C (backend) | done |
| 17 | 4 | Add `assertTrainerSlotAvailable(tenantDb, trainerId, startTime, endTime, orgTimezone)` in `trainer-availability.service.ts`. Inside provided TX: SELECT … FOR UPDATE on non-cancelled appts for trainer in date range overlapping `[startTime, endTime)`. Throw `Error("SLOT_TAKEN")` on overlap. | Agent C (backend) | done |
| 18 | 4 | Wrap `appointments.create` insert in Drizzle TX. Call `assertTrainerSlotAvailable` first. Translate `SLOT_TAKEN` → `ORPCError("CONFLICT")` | Agent C (backend) | done |
| 19 | 4 | Gate `appointments.create` on `package_instances.status='active'` only when `input.packageInstanceId` is supplied (preserves staff web-flow exemption). Throw `ORPCError("BAD_REQUEST", { message: "Package not active." })` otherwise | Agent C (backend) | done |
| 20 | 5 | In `review.tsx`, catch `appointments.create` error; if `err.code === "CONFLICT"`, show inline banner + "Pick another time" → `router.back()` to schedule + invalidate `["trainerAvailability"]` query | Agent D (mobile) | done |
| 21 | 5 | Set `staleTime: 30s` on trainerAvailability query in `schedule.tsx` + invalidate on mount | Agent D (mobile) | done |
