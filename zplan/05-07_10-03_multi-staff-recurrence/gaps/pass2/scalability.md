# Pass 2 — Scalability Audit

## Summary

Pass 1 HIGH findings SC-003 (isRecurring index) and SC-004 (concurrent materialization) are addressed in plan Phase 2.0 and Phase 0. New finding: the EXCLUSION constraint on `appointments.trainerId` creates a subtle performance issue when updating slot 0 staff — the constraint scan will use a GiST index, which is slower than btree but acceptable.

---

## New Findings

### SC-P2-001 — EXCLUDE constraint recheck on every `trainerId` update in multi-staff replace
**Severity: LOW (informational)**

When Phase 1.1 updates `appointments.trainerId` during staff replace (slot 0 change), the DB will recheck the `appointments_trainer_no_overlap` EXCLUSION constraint. This uses a GiST index scan over `tsrange(start_time, end_time)` for the trainer. For a tenant with thousands of appointments per trainer, this is O(log N) — fast.

No action required, but implementers should be aware the EXCLUSION constraint triggers on UPDATE as well as INSERT. The `mapPgError` function in `packages/api/src/lib/orpc-error-mapper.ts` already handles `23P01` for `appointments_trainer_no_overlap` — confirm it maps to a user-friendly message in the update path too.

---

### SC-P2-002 — `listAppointmentsWithRecurrence` adds JOIN on `recurrence_rules` for ALL recurring parents in window
**Severity: LOW (informational)**

Phase 2.3 query: fetch parent appointments with `isRecurring = true` in window, then JOIN `recurrence_rules`. The `recurrence_rules.appointmentId` has a unique index (confirmed). The JOIN is O(1) per parent. For 50 recurring series in a 60-day window, this is 50 lookups — negligible.

The `isRecurring` index added in Phase 2.0 makes the filter fast. No further optimization needed for MVP.

---

### SC-P2-003 — Virtual occurrence expansion for "weekly on Mon/Wed/Fri" over 60-day window: bounded
**Severity: INFORMATIONAL**

60-day window, weekly Mon/Wed/Fri = ~26 occurrences per series. 10 concurrent series = 260 virtual occurrences. Well within the 500-cap proposed in Phase 2.1. No concern.

---

## Pass 1 Findings Status

| SC | Status |
|----|--------|
| SC-001: unbounded 'never' cap | Added to plan Phase 2.1 (500-cap + log warning) |
| SC-002: buffer-time N round-trips + staff count cap | Noted in plan Phase 1.1 |
| SC-003: isRecurring index | Added to plan Phase 2.0 |
| SC-004: concurrent materialization | Added unique constraint to plan Phase 0 task 6 |
| SC-007: splitSeries bulk UPDATE | Low risk, acknowledged |
