# Implementation Record — Post-Approval Session Scheduling

**Status:** Implemented & verified (type-check + lint + unit tests). Browser verification pending.
**Date:** 2026-05-30

## What was built (all 5 phases)

### Phase 0 — Composite index
- `packages/db/src/migrations/tenant/0084_appointments_trainer_starttime_idx.sql` (plan said 0073 — stale; real latest was 0083).
- Added `trainerStartTimeIdx` to `packages/db/src/schema/tenant/appointments.ts`.
- `bun gen:migrations` + `bun verify:migrations` → in sync.

### Phase 1 — Schedule backend
- `packages/services/src/schedule-proposal.service.ts` — `proposeSchedule()` (wall-clock projection) + `coverageForPreferredTimes()`.
- Exported from `packages/services/src/index.ts`.
- `packages/api/src/routers/appointments/schedule.procedures.ts` — `proposeSchedule` (query) + `bulkCreateFromSchedule` (mutation).
- Registered in `appointments/index.ts`. `proposedSlotStatusSchema` added to `schemas.ts`.

### Phase 3 backend — Coverage
- `coverageForPreferredTimes` service (in schedule-proposal.service.ts) + `trainerAvailability.coverageForPreferredTimes` router proc.

### Phase 4 backend — Reschedule
- `appointments.reschedule` in `crud.procedures.ts`: status guard (pending/confirmed/rescheduled only), update-in-place, **no credit movement**, appends to existing `reschedule_history` jsonb column (already migrated, 0074), audit + GCal sync + `mapPgError` conflict mapping. Returns full appointment record.
- `reinstateCredits` extended to also return `packageInstanceId` (for Journey D chaining).

### Phase 2 UI — Schedule sessions
- `apps/web/src/components/appointments/DateTimeSlotPicker.tsx` — shared native date/time picker + `assembleIso()` helper (browser-TZ ISO assembly, matches existing edit flow).
- `apps/web/src/features/approvals/components/ScheduleSessionsPanel.tsx` — drawer, modes `full`/`single`.
- Wired into `ExpandedRowDetail.tsx`: opens after assign/self-assign (Journeys A/B step 4–5) and via a "Schedule sessions" button on approved rows.

### Phase 3 UI — Coverage chip
- `CoverageChip` in `ExpandedRowDetail.tsx` — shown for the **selected** trainer in the assign popover and for the caller on self-assign (1–2 bounded queries, not per-row — scaling-conscious deviation from "every row").

### Phase 4 UI — Reschedule
- `apps/web/src/features/appointments/components/RescheduleDialog.tsx` (uses DateTimeSlotPicker).
- "Reschedule" button in `AppointmentDetailDialog.tsx` footer (gated on status ≠ cancelled); host-managed in `appointment-list.tsx`.

### Phase 5 UI — No-show follow-through
- **Bug fix:** the "No-show" button in `appointment-list.tsx` was setting status to `"cancelled"` (so `reinstateCredits`, which requires `no-show`, could never fire). Now sets `"no-show"`.
- `apps/web/src/features/appointments/components/NoShowFollowupDialog.tsx` — "Reinstate & reschedule" / "Just mark no-show". Reinstate → opens `ScheduleSessionsPanel mode="single"` for the returned package.

## Key design decisions (resolving audit blockers)
- **Q1 (duration):** `services.duration` is **seconds** → `Math.floor(svc.duration / 60)` for minutes. API field standardized to `duration` (not `durationMin`).
- **Q2 (timezone):** `proposeSchedule` returns **wall-clock parts** (`date`/`time`), not ISO instants — same frame as `trainer_availability`/`preferred_times`, so classification is TZ-safe. Client assembles ISO in browser TZ via `assembleIso()`, identical to the existing edit flow. No tz library needed.
- **Q3 (index):** migration 0084 added (Phase 0).
- **Credit safety:** `bulkCreateFromSchedule` relies on `createAppointment`'s per-call `FOR UPDATE` + credit recheck (already atomic per create) plus an upfront bound check — no over-debit under concurrency. (Deviation from "one outer tx" — sounder given createAppointment opens its own tx.)
- **Journey D modality:** resolved to `ScheduleSessionsPanel mode="single"` (no separate `BookReplacementDialog`).

## Browser Verification (Chrome MCP) — ALL JOURNEYS PASSED
- **Journey A (schedule):** assign trainer → page-level drawer with N seeded editable rows → "Create 10 sessions" → toast **"1 session(s) scheduled, 9 failed"** (proves create + credit debit + exclusion-constraint conflict handling). Pending count decremented each assign.
- **Journey C (reschedule):** detail dialog → Reschedule button → DateTimeSlotPicker → "Move session" → toast **"Session moved."** Gating verified: button shown on confirmed, hidden on disputed/no-show.
- **Journey D (no-show follow-through):** Attendance → No-show → toast "Marked as No-show" (status fix) → NoShowFollowupDialog → "Reinstate & reschedule" → toast "Credit reinstated." → ScheduleSessionsPanel mode=single → "Book session" → toast "1 session(s) scheduled." Credit-neutral loop confirmed.
- **Coverage chip / gating:** correct (shown only with preferred times + selected trainer).

## Verification (static)
- `bunx tsc -b packages/api` → clean (api/services/db).
- `apps/web` `tsc --noEmit` → clean (excluding 2 concurrent-session files: `set-password.tsx`, unrelated).
- oxlint on all new/changed files → 0 errors (4 pre-existing warnings in appointment-list.tsx, not mine).
- `schedule-proposal.test.ts` → 7/7 pass (credit bound, projection, all 4 statuses, coverage).

## Known pre-existing failures (NOT mine — concurrent sessions)
- `apps/server/scripts/backfill-customer-name-snapshot.ts` — unused import `refreshTenantCustomerNameSnapshots` (blocks `bun check-types` server leaf).
- `apps/web/src/routes/set-password.tsx` — `auth.setPassword` not on router.

## Follow-ups (out of scope, recommended)
- Vitest component tests for ScheduleSessionsPanel / RescheduleDialog (audit M9).
- Integration tests once the shared harness (`integration-setup.ts` pg hang, per MEMORY) is fixed.
- Browser verification at `http://avantej.localhost:3021/` — Journeys A, C, D.
