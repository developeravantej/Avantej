## Agent: Agent B (mobile) — Phase 1
**Completed:** 2026-05-12 14:35

### What I Did
- apps/native/contexts/booking-flow-context.tsx: Added `status: string | null` and `expiresAt: string | null` fields to `BookingFlowState` interface and `initialState`.
- apps/native/app/(app)/dashboard/book-workout/book-workout.tsx: Populated new `status` and `expiresAt` fields in `update()` call inside `handleContinue`, alongside existing trainer hydration.
- apps/native/app/(app)/dashboard/book-workout/schedule.tsx:
  - Added module-scope constants `SLOT_STEP_MIN = 30` and `MIN_LEAD_MIN = 15`.
  - Changed `sliceWindowIntoSlots` default `stepMin` from `durationMin` to `SLOT_STEP_MIN` (loop bound `t + durationMin <= endMin` unchanged).
  - Added `dropPastTimes(slots, dateKey)` helper that filters today's slots whose start time is in the past or within 15 min of now.
  - Wrapped `privateTimeSlots` useMemo return with `dropPastTimes(slots, key)`.
  - Added status-gate branch above existing `isClassSlot ? ... : isPrivate ? ... : ...` ternary: renders a friendly empty-state card with icon, copy ("awaiting trainer assignment" vs "no longer active"), and Go Back button when `state.status !== "active"` OR `state.expiresAt` is in the past.
  - Verified date `onPress` in private path already calls `setSelectedTime(null)` alongside `setSelectedDate` (line ~599–601). No change needed.
- apps/native/app/(app)/dashboard/book-workout/review.tsx: Added defensive status guard at top of `confirmMutation.mutationFn`. If `state.status !== "active"`, fires an Alert (different copy for pending vs other), calls `router.back()`, and throws to abort the mutation before the API call.

### Decisions Made
- Status-gate icon uses `hourglass-outline` for pending and `alert-circle-outline` for other inactive states — keeps friendly empty-state visually distinguishable from hard errors.
- Used `Date.now()` comparison against `new Date(state.expiresAt).getTime()` for past-expiry check — matches the existing `inst.expiresAt` shape (ISO date string) on the server.
- Kept `dropPastTimes` returning unfiltered slots for future dates (early return on `dateKey !== today`) — zero overhead path for the 6 non-today dates in the picker.
- 30-min step is independent of duration: a 60-min service in a 9–13 window now yields 9:00, 9:30, 10:00, 10:30, 11:00, 11:30, 12:00 (loop bound prevents 12:30 since 12:30+60 > 13:00).

### Issues Encountered
- None. `bunx tsc --noEmit` from `apps/native` reports zero errors in any of the four files. Errors observed when running tsc from repo root are all pre-existing JSX/path-mapping issues with the root tsconfig and unrelated to this change.

DONE: #9
DONE: #10
DONE: #11
DONE: #12
DONE: #13
DONE: #14
DONE: #15

---

## Agent: Agent A (backend) — Phase 1
**Completed:** 2026-05-12 14:55

### What I Did
- packages/db/src/schema/control-panel/organizations.ts: Added `timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur'` column with docstring explaining the booking/availability semantic (admin wall-clock, not Worker UTC).
- packages/db/src/migrations/control-panel/0013_org_timezone.sql: New idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration. Backfill automatic via DEFAULT.
- packages/db/src/migrations/control-panel/meta/_journal.json: Appended idx 13 entry so `drizzle-kit migrate` picks up 0013.
- packages/services/src/trainer-availability.service.ts:
  - Added `coachIntakeAvailability` and `isNull` imports.
  - Rewrote `listTrainerAvailability` to `.select({...}).from(trainerAvailability).innerJoin(members, ...)` filtering `isNull(members.deletedAt)`. Return shape preserved (id, trainerId, dayOfWeek, startTime, endTime, isActive, createdAt, updatedAt).
  - Added `listCoachIntakeAvailability(tenantDb, trainerId)` mirroring the same pattern. Filters `isActive = true` AND `isNull(members.deletedAt)`.
  - Added `toDateStringInTz`, `toHHMMInTz`, `dayNameInTz` Intl-based helpers (Workers-compatible — no Date.getHours()).
  - Removed unused `JS_DAY_TO_NAME` and old `toDateString`/`toHHMM` helpers.
  - Rewrote `computeAvailableSlots` signature to require `orgTimezone: string` parameter. Reads both availability tables in parallel via `Promise.all`, dedupes by `(dayOfWeek|startTime|endTime)` Set key. All HH:MM math (appt indexing, dayName lookup, date keys) now in `orgTimezone`. Updated docstring.
- packages/services/src/index.ts: Exported `listCoachIntakeAvailability`.
- packages/api/src/routers/trainer-availability.ts :: `getComputedSlots`: Pulls `organizations.timezone` via `getControlPanelDb(context)` + `controlPanelDb.query.organizations.findFirst({ where: eq(orgs.id, input.organizationId), columns: { timezone: true } })`. Passes `orgTimezone` (with `Asia/Kuala_Lumpur` fallback) to `computeAvailableSlots`.
- apps/server/scripts/check-trainer-availability-union.ts: New verification script. Lists all trainers in tenant, prints `(trainer_availability_count, coach_intake_count, merged_window_count)` plus per-day breakdown, then smoke-tests tz helpers on real appointments (UTC startTime → HH:MM in org tz).

### Decisions Made
- Plan said `members.isDeleted = false`; the actual column is `deletedAt` (timestamp soft-delete, see members.ts comment + members.ts L51). Used `isNull(members.deletedAt)` — matches the established pattern in packages/api/src/routers/members.ts L99.
- Kept the original `findMany` return shape for `listTrainerAvailability` by explicitly projecting all columns including `isActive` (the `trainer_availability` schema has `isActive` even though the prior `findMany` path inferred it implicitly — TS caught a regression when I initially omitted it).
- Used `columns: { timezone: true }` projection in the router query — only fetches what's needed.
- Migration journal entry uses `1778920000000` (post-0012) so drizzle-kit migrate sees it as pending. Confirmed by re-running `bun db:migrate:control-panel` after journal update — column appeared on dev DB.
- Fallback to `Asia/Kuala_Lumpur` in router if the org row or column is somehow null — defensive, since the migration enforces NOT NULL DEFAULT but better to fail-soft than 500 the booking flow.

### Issues Encountered
- First `bun db:migrate:control-panel` reported "applied successfully" but the column didn't exist. Root cause: drizzle-kit uses `meta/_journal.json` (not just the .sql files in the dir) as the source of truth for which migrations are pending. Fix: appended the 0013 entry to `_journal.json`, re-ran migrate, column appeared.
- Initial typecheck failed on `listTrainerAvailability`: I'd omitted `isActive` from the explicit `.select({...})` and TS rightly flagged that the return type `(typeof trainerAvailability.$inferSelect)[]` requires it. Fixed by adding `isActive: trainerAvailability.isActive` to the projection.

### Verification
- `bunx tsc --noEmit` from packages/services, packages/api, and repo root: 0 errors on any of the touched files (`trainer-availability.service.ts`, `trainer-availability.ts`, `organizations.ts`, `check-trainer-availability-union.ts`).
- `grep -rn "computeAvailableSlots("` → only the router caller (already updated) and the function definition. No broken callers.
- Smoke test on `test-fitness-franchise` (after applying migration to dev DB):
  - Maya Krishnan: trainer_availability=0, coach_intake=10, merged=10 (mon..fri × 2 windows). Confirms the prod bug — Maya would currently show "no availability" but union read exposes her windows.
  - Alex Wong: 7 + 10 = 17 (small dedup overlap acceptable).
  - Daniel Tan: 0 + 10 = 10 (same scenario as Maya).
  - Deterministic Trainer: 5 + 0 = 5 (legacy-only, unaffected by the change).
  - TZ helper smoke test on real appointments: UTC `2026-04-23T02:15:00Z` → `10:15` in Asia/Kuala_Lumpur (+8h, correct). UTC `12:30` → `20:30`. Asymmetry around midnight handled by `Intl.DateTimeFormat`.

DONE: #1
DONE: #2
DONE: #3
DONE: #4
DONE: #5
DONE: #6
DONE: #7
DONE: #8

---

## Agent: Agent C (backend) — Phase 2
**Completed:** 2026-05-12 13:55

### What I Did
- `packages/services/src/trainer-availability.service.ts`:
  - Added `lt`, `gt` to drizzle-orm imports.
  - Added new exported helper `assertTrainerSlotAvailable(tx, trainerId, startTime, endTime, orgTimezone)`. Two-stage guard:
    1. `SELECT ... FOR UPDATE` on non-cancelled `appointments` with `start_time < endTime AND end_time > startTime AND trainer_id = $trainer`. Any row → throws `Error("SLOT_TAKEN")`. The row-lock serializes concurrent bookers — the second TX blocks until the first commits, then sees the freshly-inserted overlap row.
    2. Re-derives `HH:MM` + date in `orgTimezone` via existing private helpers (`toHHMMInTz`, `toDateStringInTz`), calls `computeAvailableSlots(tx, trainerId, startTime, startTime, orgTimezone)` to fetch that day's free windows (union read of `trainer_availability ∪ coach_intake_availability`, minus bookings). If no window covers `[start, end]` → throws `Error("OUT_OF_WINDOW")`.
- `packages/services/src/index.ts`: Re-exported `assertTrainerSlotAvailable` from the barrel.
- `packages/api/src/routers/appointments.ts` `create` handler:
  - Imported `assertTrainerSlotAvailable`.
  - **Task #19**: Replaced the old "if pending → FORBIDDEN" check with a tri-state gate that runs only when `packageInstanceId` is supplied:
    - `!pkg` → `NOT_FOUND`
    - `pkg.status === "pending"` → `FORBIDDEN` (preserved old friendlier message)
    - `pkg.status !== "active"` → `BAD_REQUEST` with status in message
    - When `packageInstanceId` is absent, the gate is skipped entirely (preserves staff web-flow exemption).
  - **Task #18**: Sourced `orgTimezone` from `organizations.timezone` via `getControlPanelDb(context)`, defaulting to `Asia/Kuala_Lumpur` (matches the Phase 1 router pattern).
  - Wrapped the existing `createAppointment(...)` call in `context.tenantDb.transaction(async (tx) => { ... })`. Before the create, calls `assertTrainerSlotAvailable(tx, ...)` ONLY if `input.trainerId` is supplied (legacy paths without a trainer skip the assert). Passes `tx as unknown as TenantDb` into `createAppointment` so it nests as a savepoint instead of opening a sibling TX (matching the existing `evaluateAndLockIfOverdue(tx as unknown as TenantDb, ...)` pattern already in the service).
  - Outer `catch` now maps `Error("SLOT_TAKEN")` → `ORPCError("CONFLICT", "That slot is no longer available.")` and `Error("OUT_OF_WINDOW")` → `ORPCError("CONFLICT", "Trainer is no longer available for this time.")`. Existing PG-error mapping + generic `BAD_REQUEST` fallback preserved.

### Decisions Made
- **Nested transactions via cast**: `createAppointment` strictly types its first arg as `NeonDatabase<typeof tenantSchema>` and opens its own internal `tenantDb.transaction(...)`. Drizzle on Neon-serverless implements nested calls as PG savepoints, so this is safe. I used the same `as unknown as TenantDb` escape hatch the codebase already uses (`appointment.service.ts:308-309`, `installment.service.ts`, etc.) rather than changing the service signature in this phase — keeps the diff focused. Atomicity is therefore single-savepoint-deep: outer TX holds the FOR UPDATE lock until the inner savepoint commits + the outer TX commits, which is exactly the serialization we need.
- **Single-day computeAvailableSlots in the assert**: Calling with `(startTime, startTime)` returns at most one `ComputedDayAvailability` for the requested org-local date. Cheap inside the TX — only two reads (recurring rows + appointments-in-range), and the appointments query already runs `FOR UPDATE`-lockless (read-committed). The cost is acceptable for a per-booking call.
- **String comparison on HH:MM**: Coverage check uses `w.startTime <= requestedStartHHMM && w.endTime >= requestedEndHHMM` — `"HH:MM"` sorts lexically the same as numerically when zero-padded, matching the convention used throughout `subtractBookings`.
- **packageInstanceId gate placement**: Moved BEFORE the TX (per task instructions). This is a fast-fail without holding a DB lock. The old "pending → friendlier message" path is preserved so we don't regress UX.

### Issues Encountered
- None functionally. Type-check on `packages/api` and `packages/services` is clean for our files; the only TS errors in the project are pre-existing (`bun:test` types, an unrelated unused-var warning in `payouts.service.ts`).
- **Limitation flagged**: We pass `tx` into `createAppointment` via the existing unsafe cast. If a future refactor changes how Drizzle handles nested transactions, this savepoint nesting could surface differently. Recommend a follow-up to make `createAppointment` accept `TenantDb | TenantTx` polymorphically at the type level. Not blocking — runtime behaviour matches existing nesting patterns.

DONE: #16
DONE: #17
DONE: #18
DONE: #19

---

## Agent: Agent D (mobile) — Phase 3
**Completed:** 2026-05-12 13:43

### What I Did
- apps/native/app/(app)/dashboard/book-workout/review.tsx: Added `conflictMessage` state, `onMutate` clears it, `onError` now detects CONFLICT (via `err.code`, `err.data.code`, `err.status === 409`, or string match on the server messages) and routes to inline banner instead of Alert. Banner sits inside the bottom SafeAreaView above the Confirm button — amber soft background (#FFF7ED) with primary-1 border, alert-circle icon, message text, and "Pick another time" outlined button that clears the banner, invalidates `["trainerAvailability"]` prefix, and `router.back()`. Confirm button is disabled while banner is shown.
- apps/native/app/(app)/dashboard/book-workout/schedule.tsx: Added `useQueryClient` + `useEffect` imports. Added `staleTime: 30_000` to the `getComputedSlots` useQuery. Added mount-only `useEffect` that invalidates `["trainerAvailability"]` so returning via `router.back()` after a conflict always refetches.

### Decisions Made
- Used prefix-match invalidation (`queryKey: ["trainerAvailability"]`) instead of the precise oRPC `queryKey()` helper because (a) review.tsx doesn't know the exact start/end dates the schedule screen used, and (b) prefix invalidation matches all date-range variants anyway — strictly safer for "make stale slot disappear" semantics.
- Kept three CONFLICT signals as fallbacks (`code`, `data.code`, status 409, message regex) so a transport quirk in oRPC's error serialization can't demote a real conflict into the generic Alert. The actual error shape is logged via `console.error` already, so we'll see in dev which path triggers.
- `onMutate` clears `conflictMessage` so a user who hits "Pick another time" then somehow lands back at review can retry cleanly.
- Disabled the Confirm button while the banner is visible — forces the user through "Pick another time" rather than letting them re-submit a known-bad slot.
- Banner styling reuses `colors.primary[1]` border + warm #FFF7ED background (the only non-token color); chosen because the existing palette has no dedicated warning hue and #FFF7ED is the standard amber-50 used in the codebase's other soft callouts.

### Issues Encountered
- None. Type check on review.tsx + schedule.tsx is clean.

DONE: #20
DONE: #21

---

## Run: 2026-05-12 14:10
**Trigger:** /execute
**Plan version:** plan.md (after audit-apply 2026-05-12)

### Phase outcomes
- Round 1 (parallel: backend Phase 1 + mobile Phases 2+3): pass — 15/15 tasks done, typecheck clean
- Round 2 (sequential: backend Phase 4): pass — 4/4 tasks done, TX + FOR UPDATE concurrency guard live
- Round 3 (sequential: mobile Phase 5): pass — 2/2 tasks done, CONFLICT-aware UX wired

### Final build status
- type check: pass (only pre-existing unrelated errors in (drawer)/index.tsx, useAuth.ts, colors.ts, members.test.ts)
- lint: not run
- tests: not run

### Cross-agent decisions
- Sed regex over tasks.md over-marked done; reverted Round 2/3 rows manually.
- `createAppointment` service helper kept strict-typed; tx passed via `as unknown as TenantDb` per existing codebase pattern (runtime correct, type-level cleanup deferred).
- CONFLICT detection in review.tsx uses 3-way fallback (err.code, err.data.code, err.status === 409, message regex) for transport robustness.
- Cache invalidation uses prefix `["trainerAvailability"]` not precise queryKey to wipe all date-range variants on conflict recovery.

### Subagent retry summary
- 2 retries total; both fell back to general-purpose due to codex model 400 error on backend-engineer + mobile-engineer subagent types
- 0 inline fallbacks needed

---
