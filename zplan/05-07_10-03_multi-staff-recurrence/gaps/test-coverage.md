# Test Coverage Audit

## Summary

The plan's Phase 1.6 and 2.11 test lists are broadly correct but several CRITICAL gaps exist: (1) no test verifies multi-staff commission distribution with 2 actual staff members, (2) no tests for the `resolveMemberIdFromUserId` helper, (3) no test coverage for duplicate materialization prevention, (4) no frontend tests for the staffId convention bug.

---

## Acceptance Criteria vs. Test Coverage Map

### AC-1: createAppointment with multi-staff → correct userId stored in appointment_staff
**Existing coverage:** commission-calculator.test.ts uses `staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }]` (single staff). No test with 2 staff members.
**Proposed coverage:** Phase 1.6 integration test — LISTED in plan. Good.
**Gap:** No test that verifies the WRONG value (member.id) is rejected or warned. The runtime assertion mentioned in Phase 1.1 ("Add runtime assertion / warn log if a UUID-shaped staffId is passed") is not testable without a sentinel. Consider: add a test that intentionally passes `members.id` and verifies the commission calculator returns 0 splits (demonstrating the bug) — this becomes a regression guard once Phase 1.3 fixes it.

### AC-2: updateAppointment staffAssignments → delete+re-insert
**Existing coverage:** NONE.
**Proposed coverage:** Phase 1.6 integration test — LISTED in plan. Good.
**Gap:** No edge case for updating to empty staffAssignments (remove all staff).

### AC-3: calculateCommissionForAppointment with 2 staff → 2 commission_split rows
**Severity: CRITICAL — GAP**
**Existing coverage:** commission-calculator.test.ts TC-CC-003 tests "unfilled slot redistribution" with 1 actual trainer and 2 config slots — verifies single trainer absorbs 100%. It does NOT test 2 actual trainers each getting their share.
**Proposed coverage:** Phase 1.6 integration test — LISTED ("calculateCommissionForAppointment with 2 staff → verify 2 commission_split rows, correct slot redistribution"). 
**Gap:** This is listed but NOT yet written. It is the most important test for the feature. Mark as CRITICAL to ensure it is not skipped.

### AC-4: packageInstanceStaff CRUD procedures
**Existing coverage:** NONE.
**Proposed coverage:** Phase 1.6 integration test — LISTED. Good.
**Gap:** No test for the UNIQUE constraint enforcement (assign same staffId twice to same packageInstance → should fail). No test for `replacePackageInstanceStaff` (which does DELETE+INSERT atomically).

### AC-5: expandRecurrenceRule — weekly/monthly/daily with all end conditions
**Existing coverage:** NONE (function doesn't exist yet).
**Proposed coverage:** Phase 2.11 unit test — LISTED. Good.
**Gap:** Plan mentions DST edge cases. Weekly recurrence crossing DST boundary is non-trivial. The plan says "use tenant's timezone" — but there is NO timezone column in org settings (confirmed by grep). The test cannot be written until the timezone source is resolved. This is a BLOCKING dependency.

### AC-6: createAppointment with recurrence → parent row + recurrence_rules row
**Existing coverage:** NONE.
**Proposed coverage:** Phase 2.11 integration test — LISTED. Good.
**Gap:** No test for invalid recurrence params (frequencyValue=0, endsAfterOccurrences=0).

### AC-7: listAppointmentsWithRecurrence → virtual occurrences in window
**Existing coverage:** NONE.
**Proposed coverage:** Phase 2.11 integration test — LISTED. Good.
**Gap:** No test for window edge cases (occurrence exactly on windowStart or windowEnd boundary). No test verifying materialized children are NOT duplicated in virtual expansion.

### AC-8: materializeOccurrence → child row created, subsequent list excludes virtual for that date
**Existing coverage:** NONE.
**Proposed coverage:** Phase 2.11 integration test — LISTED. Good.
**Gap (CRITICAL):** No test for concurrent materialization race (two simultaneous calls for same occurrence). Without the unique constraint on `(recurringParentId, startTime)` (SD-004), this is untestable. Plan must add the constraint first.

### AC-9: splitSeries → old parent truncated, new parent + rule created, children migrated
**Existing coverage:** NONE.
**Proposed coverage:** Phase 2.11 integration test — LISTED. Good.
**Gap:** No test for edge case where `fromDate` equals `parentStartTime` (splitting from the very first occurrence). No test for `fromDate` after all occurrences have been cancelled.

### AC-10: Buffer-time conflict for multi-staff
**Existing coverage:** `appointment-overlap.test.ts` exists but likely tests single-trainer only.
**Proposed coverage:** NOT LISTED in Phase 1.6 or 2.11. 
**Gap (HIGH):** Plan section 3.5 describes wrapping buffer check in a loop for all staff. No test is proposed for: (a) first trainer has no conflict but second does → whole create fails, (b) first trainer has conflict → error names which trainer.

### AC-11: resolveMemberIdFromUserId helper
**Existing coverage:** NONE.
**Proposed coverage:** NOT LISTED in plan tests.
**Gap (MEDIUM):** Phase 0 says "Write resolveMemberIdFromUserId helper" but proposes no test for it. Should have a unit test: (a) valid userId → returns member.id, (b) unknown userId → returns null.

### AC-12: Frontend staffId convention (unit test)
**Existing coverage:** NONE.
**Proposed coverage:** NOT LISTED.
**Gap (HIGH):** The critical bug (TrainerRow.id = member.id, not userId) has no frontend unit test. A test that renders StaffPicker with a mock members list and asserts `staffAssignments[0].staffId === member.userId` would catch regressions.

---

## Test Infrastructure Notes

- Integration test helpers in `apps/server/src/tests/helpers/integration-setup.ts` include `TEST_USER_ID` and `TEST_MEMBER_ID` constants. For multi-staff tests, a second trainer member must be created (similar to what `commission-calculator.test.ts` does).
- `appointment_staff` rows can be inserted directly in test setup or via `createAppointment` with `staffAssignments`.
- `recurrence_rules` rows need a parent appointment with `isRecurring: true` and `recurringEndDate`.

---

## Summary Table

| AC | Description | Coverage Status |
|----|-------------|-----------------|
| 1 | Multi-staff create → correct userId | Proposed (Phase 1.6) |
| 2 | updateAppointment staffAssignments | Proposed (Phase 1.6) |
| 3 | 2 staff → 2 commission splits | CRITICAL GAP — proposed but not written |
| 4 | packageInstanceStaff CRUD | Proposed (Phase 1.6) |
| 5 | expandRecurrenceRule all cases | Proposed (Phase 2.11) — blocked on timezone |
| 6 | create with recurrence → DB rows | Proposed (Phase 2.11) |
| 7 | list virtual occurrences | Proposed (Phase 2.11) |
| 8 | materializeOccurrence + dedup | CRITICAL GAP — needs unique constraint first |
| 9 | splitSeries | Proposed (Phase 2.11) |
| 10 | Buffer-time multi-staff loop | HIGH GAP — not listed anywhere |
| 11 | resolveMemberIdFromUserId | MEDIUM GAP — not listed anywhere |
| 12 | Frontend staffId convention | HIGH GAP — not listed anywhere |
