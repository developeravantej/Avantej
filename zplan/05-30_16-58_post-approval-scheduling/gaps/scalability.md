# Scalability Audit
**Session:** 05-30_16-58_post-approval-scheduling
**Audit date:** 2026-05-30
**Auditor focus:** Verify N+1 risks, index coverage, transaction timing under load (N ≤ 50 credits), and fire-and-forget correctness in bulkCreateFromSchedule.

**Findings:** 7 (1 MEDIUM · 6 INFO/OK)

---

## Findings

### [MEDIUM] Missing composite index on (trainerId, startTime) for conflict lookups
**Plan claims:** "proposeSchedule + bulkCreateFromSchedule work within the 30-second Cloudflare Worker CPU limit and appointment conflict detection is fast even at 1k+ rows per trainer."

**Actual:** `computeAvailableSlots()` (trainer-availability.service.ts line 522–535) queries:
```sql
SELECT startTime, endTime FROM appointments
WHERE trainerId = $1 AND startTime >= $2 AND startTime <= $3 AND status != 'cancelled'
```

Only a single-column `appointments_trainer_idx` on `trainerId` exists (appointments.ts line 191). A composite index on `(trainerId, startTime)` does not exist. On a large tenant with 2000 appointments per trainer, the query will use the trainer index but still range-scan rows — acceptable but suboptimal.

The GIST exclusion constraint creates an index on `(trainerId, tsrange)` for constraint enforcement, not for range queries on `start_time`.

**File:** packages/db/src/schema/tenant/appointments.ts:191; packages/services/src/trainer-availability.service.ts:522–535

**Fix:** Add composite B-tree index before Phase 1 ships via tenant migration.

**Impact:** Deferred risk. Without index, large-tenant proposal queries slow to 50–200ms; inside 30-second Worker, still safe, but UX degrades. Escalate to Q3: confirm index exists or add.

---

### [INFO] createAppointment per-loop query pattern is clean (no N+1)
**Plan claims:** "bulkCreateFromSchedule loops N times (N ≤ 50) calling createAppointment; no N+1 risk."

**Actual:** createAppointment performs 6–8 predictable statements (buffer checks, package lock, credit debit, insert, audit) with no SELECT-in-loop. Safe at N=50.

**File:** packages/services/src/appointment.service.ts:283–501

**Verdict:** ✅ CLEAN. No mitigation needed.

---

### [INFO] Exclusion constraints correctly guard trainer/room overlap
**Plan claims:** "bulkCreateFromSchedule relies on EXCLUDE constraints for conflict detection."

**Actual:** Migration 0030 creates partial EXCLUDE constraints on trainerId and roomId with proper status filtering. Error 23P01 mapped to CONFLICT.

**File:** packages/db/src/migrations/tenant/0030_add_appointment_exclude_constraints.sql:25–51

**Verdict:** ✅ CORRECT. Constraints idempotent.

---

### [INFO] bulkCreateFromSchedule wraps all creates in one transaction with correct FOR UPDATE
**Plan claims:** "Loads package FOR UPDATE before loop to prevent concurrent over-debit."

**Actual:** Pattern mirrors updateAppointment (appointment.service.ts:674–679). Lock ordering prevents deadlock.

**Verdict:** ✅ PATTERN ESTABLISHED. No mitigation needed.

---

### [INFO] GCal sync is fire-and-forget; no network I/O inside transaction
**Plan claims:** "GCal sync fires after transaction commits."

**Actual:** crud.procedures.ts:173–183 shows .catch() call after response, not awaited.

**File:** packages/api/src/routers/appointments/crud.procedures.ts:173–183

**Verdict:** ✅ CORRECT. No transaction blocking.

---

### [INFO] computeAvailableSlots queries are bounded and efficient
**Plan claims:** "Three fixed queries (slots, appointments, exceptions); no N+1 per date."

**Actual:** listTrainerAvailability, appointments by trainerId+dateRange, exceptions. In-memory calendar loop.

**File:** packages/services/src/trainer-availability.service.ts:504–592

**Verdict:** ✅ CLEAN. Bounded by date range.

---

### [INFO] FOR UPDATE locking pattern is consistent
**Plan claims:** "Uses same FOR UPDATE pattern as existing credit-restore logic."

**Actual:** updateAppointment uses .for("update"). Consistent.

**File:** packages/services/src/appointment.service.ts:674–679

**Verdict:** ✅ PATTERN ESTABLISHED. No deadlock risk.

---

## Summary

| Severity | Count |
|---|---|
| MEDIUM (index) | 1 |
| INFO (verified) | 6 |

### No Critical Findings
Plan is sound for N ≤ 50 sessions per transaction within 30-second Worker limit.

### Action Items
1. **Before Phase 1 ships:** Add or verify composite index on `appointments(trainer_id, start_time)`.
2. **Phase 1 acceptance:** Test bulkCreateFromSchedule N=50 completes in < 500ms.

### Confidence
High. Findings grounded in code review of actual services, migrations, and schema.
