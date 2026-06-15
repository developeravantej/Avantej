# Test Coverage Audit

**Session:** 05-30_16-58_post-approval-scheduling
**Plan snapshot:** 05-30_16-58 post-approval-scheduling implementation plan
**Audit date:** 2026-05-30

---

## Summary

**Status:** CRITICAL GAPS — zero coverage on all Phase 1 server functions (proposeSchedule, bulkCreateFromSchedule) and Phase 5 no-show+reinstate flow. Test infrastructure (fixtures, mock DB, integration helpers) exists and is functional.

**Findings:** 7 CRITICAL · 3 HIGH · 2 MEDIUM

---

## Test Infrastructure Available

### Fixtures & Helpers ✓
- **fixtures.ts** (line 19–50): makePackageInstance() with XOR-check for clientId vs walkInCustomerId
- **db-mock.factory.ts** (line 72–117): createMockTenantDb() with query.packageInstances, query.appointments, chainable insert/update/select
- **context.factory.ts** (line 28–81): createAdminContext(), createStaffContext() with proper organization/tenant setup
- **integration-setup.ts** (line 159–205): createTenantDb() (real Neon via pg), makeIntegrationAdminContext()

✓ All test helpers present and functional.

---

## Findings

### [CRITICAL] Zero test coverage: proposeSchedule server function does not exist

**Plan claims:** Phase 1, Task 1.1 — Create packages/services/src/schedule-proposal.service.ts

**Actual:** Function does not exist. No file schedule-proposal.service.ts. Zero grep hits for proposeSchedule in packages/services/src or tests.

**Impact:** Entire backend of Journey A (steps 5–7) missing. Zero tests needed because code missing.

**File:** N/A (missing)

**Fix:** Implement packages/services/src/schedule-proposal.service.ts with unit tests covering:
- Preferred times empty → fallback to available slots
- Round-robin projection across creditsRemaining
- Conflict detection (trainer booked, outside availability)
- Edge case: preferred-times after package expiresAt → after_expiry status

**Blocked by:** Q1 (service duration column), Q2 (tenant tz)

---

### [CRITICAL] Zero test coverage: bulkCreateFromSchedule server function does not exist

**Plan claims:** Phase 1, Task 1.3 — Add bulkCreateFromSchedule mutation with single tx, FOR UPDATE, partial-failure accounting

**Actual:** Procedure does not exist. No schedule.procedures.ts or entries in appointments/crud.procedures.ts. Zero grep hits.

**Impact:** Create half of scheduling plan has zero implementation. Credit guard, FOR UPDATE, partial-failure untested.

**File:** N/A (missing)

**Fix:** Implement bulkCreateFromSchedule mutation. Tests must verify:
- Credit guard: reject slots.length > creditsRemaining BEFORE any insert
- Partial failure: one conflict does not roll back others
- FOR UPDATE: package loaded with .for("update")
- Credit debit: each appointment increments creditsUsed by 1
- Audit: appointments.bulk_scheduled written
- Rejections: status !== active, expired, no trainer

---

### [CRITICAL] Zero test coverage: appointments.reschedule mutation does not exist

**Plan claims:** Phase 4, Task 4.1 — Add appointments.reschedule mutation

**Actual:** Procedure does not exist. No reschedule in appointments/crud.procedures.ts

**Impact:** Journey C (reschedule) has zero server implementation. Invariant "reschedule does NOT debit credits" cannot be tested.

**File:** N/A (missing)

**Fix:** Implement appointments.reschedule mutation. Tests must verify:
- Invariant: creditsUsed unchanged
- Status guard: only {pending, confirmed, rescheduled} allowed
- Status transition: status → rescheduled
- Conflict detection: PG exclusion → CONFLICT error
- Audit: appointment.rescheduled logged
- GCal sync: fire-and-forget update

---

### [CRITICAL] No test for credit mutation in bulkCreateFromSchedule

**Plan claims:** Phase 1, Acceptance — developer can call bulkCreateFromSchedule and see N appointments created with creditsUsed debited correctly

**Actual:** Tests exist for individual appointment creation. No test covers:
- N credits across N appointments in one bulk call
- creditsRemaining (generated column) decreases by N
- Partial failure: 8 slots requested, 6 succeed → creditsUsed increased by 6 exactly

**File:** package-credit-consumption.integration.test.ts (incomplete)

**Fix:** Add integration test bulk-create-from-schedule.integration.test.ts:
- Seed active package with 10 credits
- Call bulkCreateFromSchedule with 8 slots
- Verify creditsRemaining: 10 → 2
- Verify 8 appointment rows created
- Test conflict: 5 slots, 1 double-booked → created=4, credits debited=4

---

### [CRITICAL] No test for reinstateCredits + no-show-replacement flow

**Plan claims:** Phase 5, Task 5.4 — Tests: reinstate increments creditsRemaining by 1, replacement debits 1, net neutral, original stays no-show

**Actual:** reinstateCredits exists and tested for reinstate-only. No test covers complete flow.

**File:** Missing (no-show-reinstate-replace.integration.test.ts)

**Fix:** Add integration test:
1. Create package with 5 credits
2. Create 2 appointments (creditsUsed=2, creditsRemaining=3)
3. Mark first no-show → call reinstateCredits
4. Verify creditsRemaining: 3 → 4
5. Call bulkCreateFromSchedule for 1 replacement
6. Verify creditsRemaining: 4 → 3
7. Verify original still status=no-show
8. Verify new appointment is pending

---

### [HIGH] No test for coverageForPreferredTimes

**Plan claims:** Phase 3, Task 3.4 — Tests: coverage computation (in-window, on-boundary, blocked)

**Actual:** Function coverageForPreferredTimes does not exist. Zero grep hits. Phase 3 has zero implementation.

**Impact:** Availability cross-check at assignment (coverage chip) has no backend.

**File:** N/A (missing)

**Fix:** Implement service helper + query. Tests must verify:
- Trainer Monday 09:00–17:00 covers Monday 10:00 preferred-time ✓
- Same trainer does not cover Saturday 10:00 ✗
- Blocked date prevents specific matching
- Boundary: window 09:00–10:00, preferred 10:00 → covered?

---

### [HIGH] No frontend test for ScheduleSessionsPanel drawer

**Plan claims:** Phase 2, Task 2.4 — Frontend tests: panel renders proposed slots, disables confirm when 0 slots, calls mutation with edited slots

**Actual:** Component does not exist (ScheduleSessionsPanel.tsx missing). Zero Vitest checks.

**File:** N/A (missing)

**Fix:** Implement component + Vitest:
- Mock client.appointments.proposeSchedule → 3 proposed slots
- Render ScheduleSessionsPanel
- Verify 3 slot rows
- Verify Create button enabled
- Change slot to invalid → verify button disabled
- Click confirm → verify bulkCreateFromSchedule called with edited slots

---

### [HIGH] No frontend test for RescheduleDialog

**Plan claims:** Phase 4, Task 4.4 — Frontend tests: no credit change, rejects on completed/no-show, conflict → CONFLICT

**Actual:** Component does not exist (RescheduleDialog.tsx missing). Zero Vitest tests.

**File:** N/A (missing)

**Fix:** Implement tests:
- Mock client.appointments.reschedule
- Dialog opens with current slot pre-filled
- User changes date/time → mutation called
- Mock returns CONFLICT → verify toast
- Verify appointment detail re-fetches

---

### [MEDIUM] createAppointment test does not verify FOR UPDATE prevents over-booking

**Plan claims:** Phase 1, Acceptance — FOR UPDATE concurrency guard prevents credit over-booking

**Actual:** Unit test appointment.service.test.ts (lines 339–368) tests package-lock gate. Does NOT test:
- Concurrent bulkCreateFromSchedule calls
- FOR UPDATE prevents second caller over-debiting

**File:** apps/server/src/tests/unit/services/appointment.service.test.ts (lines 339–368)

**Fix:** Add test:
1. Package: creditsRemaining = 2
2. Concurrent caller A: bulkCreateFromSchedule(3 slots)
3. Concurrent caller B: bulkCreateFromSchedule(3 slots)
4. Expected: A locks, books 2, creditsRemaining → 0
5. B loads package, sees creditsRemaining=0, rejects

---

### [MEDIUM] package-credit-consumption test incomplete due to schema-drift

**Plan claims:** Phase 1.5 — acceptance: developer can call against seeded active package, see N appointments created with creditsUsed debited

**Actual:** File package-credit-consumption.integration.test.ts exists. Documents schema-drift blocker:
  Drizzle schema includes reschedule_history (jsonb) not in dev Neon tenant DB.
  createAppointment fails with "column 'reschedule_history' does not exist"

Test inserts appointments via raw SQL (line 223–249) to work around. Unblocks tests but incomplete:
- Tests only individual credit-debit path, not createAppointment via bulkCreateFromSchedule
- Once reschedule_history migrated, tests should call createAppointment directly

**File:** apps/server/src/tests/integration/package-credit-consumption.integration.test.ts (lines 1–25, 212–249)

**Fix:**
1. Migrate reschedule_history column to dev Neon (run bun db:migrate:tenant)
2. Update test to call createAppointment directly
3. Add explicit test: bulkCreateFromSchedule → N appointments, creditsRemaining decreases by N

---

## Blocking Conditions

1. **Q1: Service duration column name** — Must resolve before Phase 1.1. Grep packages/db/src/schema/tenant/services.ts
2. **Q2: Tenant timezone source** — Needed before Phase 1.1 projects today forward
3. **Schema migration: reschedule_history column** — Missing from dev Neon. Block: createAppointment tests. Unblock: bun db:migrate:tenant
4. **Q3: Index on appointments(trainerId, startTime)** — If missing, conflict detection degrades. Check; if absent, add tenant migration

---

## Recommendations

1. Define test suite outline before implementing:
   - schedule-proposal.test.ts
   - bulk-create-from-schedule.integration.test.ts
   - appointments-reschedule.integration.test.ts
   - no-show-reinstate-replace.integration.test.ts

2. Resolve Q1 & Q2 immediately (5-minute lookups)

3. Frontend tests — use existing mocks, defer UI after server APIs locked

4. Migrate reschedule_history early
