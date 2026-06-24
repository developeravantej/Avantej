# Audit Report: Trainer Availability + Conflict-Aware Booking

**Session:** `zplan/05-12_12-42_trainer-availability-booking/`
**Audited:** 2026-05-12 (re-audit after /audit-apply patch)
**Auditor:** Claude Code (automated)
**Status:** needs-attention

---

## Summary

8/8 plan sections present with substantive content. 1 missing file reference (`apps/server/scripts/check-trainer-availability-union.ts` — new script, expected pre-execution). All existing file paths verified. All symbols verified (pre-existing plus not-yet-created tasks are expected). Plan has 3 `<!-- TODO (audit): -->` markers injected by /audit-apply; 2 are BLOCKING (Phase 1, Phase 4) and 1 is partially self-answering from codebase inspection. Web `appointments.create` callers now identified in §6; `packageInstanceId` is `nullable().optional()` meaning the new guard fires only when supplied — web staff flows are safe without a bypass flag. Plan has not been executed.

---

## 1. Structural Completeness

| Section | Status | Notes |
|---------|--------|-------|
| 1. Overview (problem, goals, scope) | PASS | Two failure modes, 6 success criteria, explicit in/out scope |
| 2. Result (Before/After) | PASS | Customer and Admin/Trainer perspectives both covered |
| 3. Technical Architecture | PASS | Current-state diagram, 3-option decision table, data flow diagram, API contracts, key decisions |
| 4. User Journeys (with "Where it lives") | PASS | 3 journeys with explicit file attribution |
| 5. Phased Implementation | PASS | 6 phases, each with tasks, files, dependencies, acceptance criteria |
| 6. Impact & Breakage Analysis | PASS | Table of files/procedures, caller trace (with confirmed web callers), multi-tenant isolation, domain breakage vectors |
| 7. Cross-Cutting Concerns | PASS | Error handling, testing strategy, migration plan, rollback, performance checklist |
| 8. Open Questions / Risks | PASS | 6 open questions with BLOCKING priority bands, 5 risks |

**Score: 8/8**

---

## 2. Codebase Alignment (Broken References)

### File Paths

| Path | Status | Notes |
|------|--------|-------|
| `packages/services/src/trainer-availability.service.ts` | EXISTS | Contains `computeAvailableSlots` (:314), `listTrainerAvailability` (:40), `subtractBookings` (:248) |
| `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx` | EXISTS | `assignedTrainerId ?? preferredTrainerId` fallback at :133-134 (Phase 2.1 pre-done confirmed) |
| `apps/native/app/(app)/dashboard/book-workout/schedule.tsx` | EXISTS | Has `sliceWindowIntoSlots` |
| `apps/native/app/(app)/dashboard/book-workout/review.tsx` | EXISTS | |
| `apps/native/contexts/booking-flow-context.tsx` | EXISTS | `status` and `expiresAt` fields NOT YET added — Phase 2.2 gap |
| `packages/api/src/routers/appointments.ts` | EXISTS | `packageInstanceId` is `nullable().optional()` at :334; guard fires only when supplied (:416) |
| `packages/api/src/routers/trainer-availability.ts` | EXISTS | Has `getComputedSlots` at :62 and `listByBranch` at :41 |
| `apps/web/src/components/calendar/appointment.tsx` | EXISTS | `appointments.create` call at :79 — does NOT pass `packageInstanceId` |
| `apps/web/src/components/appointments/appointment-list.tsx` | EXISTS | `appointments.create` call at :54 — does NOT pass `packageInstanceId` |
| `apps/server/scripts/check-trainer-availability-union.ts` | MISSING | Expected — Phase 1.3 creates this new script |
| `packages/db/src/migrations/tenant/00XX_appointments_trainer_start_unique.sql` | MISSING | Expected — optional Phase 4.6 only |

**Plan-blocking broken refs: 0.** Both missing files are future artifacts created during execution.

### Symbols

| Symbol | Status | Notes |
|--------|--------|-------|
| `computeAvailableSlots` | EXISTS | `trainer-availability.service.ts:314` |
| `listTrainerAvailability` | EXISTS | `trainer-availability.service.ts:40` |
| `subtractBookings` | EXISTS | `trainer-availability.service.ts:248` |
| `sliceWindowIntoSlots` | EXISTS | `schedule.tsx` (current step = `durationMin` — Phase 3 changes this) |
| `listCoachIntakeAvailability` | NOT YET CREATED | Phase 1.1 task — expected |
| `assertTrainerSlotAvailable` | NOT YET CREATED | Phase 4.2 task — expected |
| `getComputedSlots` | EXISTS | `trainer-availability.ts:62` |
| `coachIntake.listByBranch` | EXISTS | Exposed as `listByBranch` on trainer-availability namespace at :41 |
| `coach_intake_trainer_idx` | EXISTS | `packages/db/src/schema/tenant/coach-intake-availability.ts` |
| `assignedTrainerId` / `preferredTrainerId` | EXISTS | `book-workout.tsx:133-134` |
| `BookingFlowState` | EXISTS | `booking-flow-context.tsx:3` — missing `status` and `expiresAt` (Phase 2.2 gap) |

**Terminology note:** Plan refers to `client.coachIntake.listByBranch` (web call) but the API router exposes `listByBranch` on the `trainerAvailability` namespace. Verify which namespace the web admin page uses before Phase 6. Low risk.

### Packages

No new package dependencies. All imports use existing `@avantej-core/*` packages.

---

## 3. Domain Logic Check

**W1 — `booking-flow-context.tsx` missing `status` and `expiresAt` (medium, Phase 2 gap)**
Neither field exists in `BookingFlowState` (16 fields currently). Phase 2.2/2.3 require both. Additive-safe.

**W2 — `sliceWindowIntoSlots` step size still `durationMin` (confirmed gap)**
Phase 3 has not started. Plan gotcha #2 is accurate.

**W3 — `coach_intake_availability` not consulted by booking engine (core bug confirmed)**
`trainer-availability.service.ts` has zero references to `coach_intake_availability`. Phase 1 diagnosis and fix are correct.

**W4 — Web callers of `appointments.create` — OQ #3 partially self-answered by codebase**
Both web callers (`calendar/appointment.tsx:79`, `appointment-list.tsx:54`) were inspected. Neither passes `packageInstanceId`. The new Phase 4.4 guard fires only `if (input.packageInstanceId)` (confirmed `appointments.ts:416`). Staff web flows are safe without a `bypassChecks` flag — the guard is naturally opt-in. TODO in OQ #3 can be closed after product confirms this is intended.

**W5 — No soft-deleted trainer filter in `listTrainerAvailability` (pre-existing gap)**
Plan Phase 1.5 addresses this — do not skip.

**W6 — Timezone: `Date.getHours()` returns UTC on Cloudflare Workers (BLOCKING)**
Still unresolved. Must be confirmed against production data before Phase 1 ships.

**W7 — Credits double-decrement on retry (low risk)**
`appointments.ts` wraps credit debit inside the TX — rollback on conflict prevents double-decrement. If client retries a timed-out successful insert, the new overlap guard rejects it before any debit. Low risk but confirm during Phase 4 review.

---

## 4. Impact Coverage Gaps

| File modified by plan | In §6 table? | Unlisted callers |
|----------------------|-------------|-----------------|
| `packages/services/src/trainer-availability.service.ts` | YES | Only `trainer-availability.ts` router calls `computeAvailableSlots` — correct |
| `packages/api/src/routers/appointments.ts` (`create`) | YES | Web callers now listed in §6 "Trace" section — resolved by /audit-apply |
| `apps/native/.../book-workout/schedule.tsx` | YES | Leaf screen — no callers |
| `apps/native/.../book-workout/review.tsx` | YES | No additional callers |
| `apps/native/contexts/booking-flow-context.tsx` | YES | Bounded to `book-workout/*` screens |

**No new impact gaps found.**

---

## 5. TODO Markers Audit

3 `<!-- TODO (audit): -->` markers in `plan/plan.md`:

| Location | Marker | Classification |
|----------|--------|----------------|
| §5 Phase 1.0 | "confirm timezone convention + decide whether to thread org timezone through `computeAvailableSlots`" | **BLOCKING — Phase 1 cannot ship without this** |
| §8 OQ #2 | "verify timezone convention against production data" | **BLOCKING — same root cause as above** |
| §8 OQ #3 | "inspect each web caller, confirm whether `packageInstanceId` is passed, decide guard scope" | **Acknowledged / partially resolved** — codebase confirms opt-in guard; needs product sign-off to fully close |

**Blocking TODOs: 2** (both point to the same timezone root cause)
**Acknowledged non-blocking TODOs: 1**

---

## 6. Execution & Verification State

| Artifact | Status |
|----------|--------|
| `execute/log.md` | Not present — plan not yet executed |
| `chrome-test/` | Not present |
| `research/brief.md` | Not present |
| `prompts/` | Not present |

Plan has not been executed. Consistent with "Draft" status.

---

## 7. Unresolved Questions

| Location | Question | Priority |
|----------|----------|----------|
| §3 + §8 OQ #1 | Pick Option A vs B vs C for availability source reconciliation | **BLOCKING (Phase 1)** — default A, needs sign-off |
| §5 Phase 1.0 + §8 OQ #2 | Org timezone: are HH:MM windows stored local or UTC? | **BLOCKING (Phase 1)** — 8h offset risk in production |
| §8 OQ #3 | Staff override for `appointments.create` guards | Partially answered — opt-in via `packageInstanceId`; needs product sign-off |
| §8 OQ #4 | Minimum lead time (plan default: 15 min) | Low — product decision |
| §8 OQ #5 | No-show vs cancelled: does no-show release the slot? | Low — product decision |
| §4.6 | Add unique index `appointments_trainer_start_unique`? | Low — optional backstop |

---

## 8. Recommendations Before Execution

1. **Resolve OQ #1 (Option A/B/C) and OQ #2 (timezone) before Phase 1.** Spot-check production data: `SELECT start_time FROM trainer_availability LIMIT 5` and compare to known trainer schedules.

2. **Close OQ #3 with product.** Confirm: "Web staff creating appointments via calendar without selecting a package skip credit checks by design (no `packageInstanceId` passed). Intended?" If yes, remove the TODO.

3. **Phase 2.2 pre-work** — add `status: string | null` and `expiresAt: string | null` to `BookingFlowState` in `booking-flow-context.tsx`.

4. **Do not skip Phase 1.5** — soft-deleted trainer filter must cover both `listTrainerAvailability` and the new `listCoachIntakeAvailability`.

5. **Verify `coachIntake` vs `trainerAvailability` namespace** on the web admin page before Phase 6.

---

## Final Status

**needs-attention** — 8/8 sections, 0 plan-blocking broken refs, 2 BLOCKING TODOs (timezone, same root cause), 1 acknowledged non-blocking TODO (OQ #3 self-answered by codebase, needs product sign-off), not yet executed.
