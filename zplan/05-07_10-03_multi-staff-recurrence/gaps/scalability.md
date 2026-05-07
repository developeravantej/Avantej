# Scalability Audit

## Summary

Three scalability concerns require plan-level decisions: (1) recurrence expansion is bounded by the API window but unbounded `endsType='never'` series could be a footgun if window is large. (2) Buffer-time multi-staff loop adds N sequential SELECTs per create/update — acceptable for 2-3 staff but needs a maximum enforced. (3) Missing index for `isRecurring=true` filter on appointments list. (4) Concurrent materialization race is unmitigated without the unique constraint. (5) `package_instance_staff` slot uniqueness enforcement at DB level is correct.

---

## Findings

### SC-001 — Recurrence expansion: unbounded `endsType='never'` within large windows
**Severity: MEDIUM**

Plan section 3.3: "Virtual expansion is in-memory (cheap). The DB query adds one JOIN on recurrence_rules."

The expansion algorithm stops at `windowEnd`. For `endsType='never'` with `timeUnit='day'` and `frequencyValue=1` (daily), a 60-day window = 60 virtual occurrences. For a year window = 365. For a 5-year window = 1,825.

Current API: `list` already enforces a date window via `startFrom`/`startTo`. The plan mentions "60-day window via `getAppointmentQueryRange()`". If this is enforced at the router level, exposure is limited.

**Risk:** No server-side cap on the number of virtual occurrences returned from `expandRecurrenceRule`. If `windowEnd - windowStart` is large, expansion can produce thousands of objects.

**Recommendation:** Add a max virtual occurrence cap (e.g., 500 per parent series per window) inside `expandRecurrenceRule` as a safety valve. Log a warning when the cap is hit.

---

### SC-002 — Buffer-time multi-staff loop: N sequential SELECTs + N lookups
**Severity: MEDIUM**

Plan Phase 1.1 / Section 3.5:
```typescript
for (const assignment of staffAssignments) {
  const memberId = await resolveMemberIdFromUserId(tenantDb, assignment.staffId);
  if (!memberId) continue;
  await checkAppointmentBufferConflict(tenantDb, { trainerId: memberId, ... });
}
```

Each iteration: 1 SELECT for `resolveMemberIdFromUserId` + 1 SELECT for `checkAppointmentBufferConflict` = 2 round-trips per staff member.

For 2 staff (typical): 4 round-trips. For 10 staff: 20 round-trips. This is on the hot path of appointment create.

**Current implementation:** The existing `createAppointment` does this for 1 trainer (2 calls total). Phase 1.1 multiplies by N.

**Optimization:** Batch the userId→memberId lookup into one `IN` query, then batch conflict checks. But `checkAppointmentBufferConflict` is not designed for batching. For 2-3 staff (typical use case) the sequential approach is fine.

**Recommendation:** Add a staff count cap (max 5 or 10 staff per appointment) at the router level to bound the loop. Plan should state the maximum.

---

### SC-003 — Missing index on `appointments.isRecurring` for Phase 2.3 list query
**Severity: HIGH**

Phase 2.3 adds a query that fetches all parent appointments with `isRecurring = true` in the window. The current appointments schema has NO index on `isRecurring`:

```typescript
// appointments.ts indexes:
branchIdIdx, serviceIdIdx, startTimeIdx, statusIdx, typeIdx,
recurringParentIdIdx, stripePaymentIntentIdIdx, startTimeStatusIdx,
bookingNumberIdx, userIdIdx, trainerIdIdx, packageInstanceIdIdx,
classSlotIdIdx, userStatusIdx, roomIdIdx, salesOrderIdIdx
// ← no isRecurringIdx
```

`listAppointmentsWithRecurrence` will likely query with `AND isRecurring = true AND startTime >= windowStart AND startTime <= windowEnd`. The `startTimeIdx` or `startTimeStatusIdx` index will cover the date range filter, but the `isRecurring` filter adds a heap filter on top.

For small tables (< 10,000 appointments) this is fine. For large orgs with many appointments it degrades.

**Recommendation:** Add `isRecurringIdx: index("appointments_is_recurring_idx").on(table.isRecurring)` to appointments schema, or a composite `(isRecurring, startTime)` index. Include this in Phase 2 schema changes.

---

### SC-004 — Concurrent materialization race: UNMITIGATED
**Severity: HIGH**

Plan section 7 (Transactions): "add unique constraint on `(recurringParentId, startTime)` if not already present."
Confirmed absent (SD-004). Without this constraint, two simultaneous "Edit this occurrence" clicks by different users will both succeed and create two child rows for the same virtual occurrence date.

The plan acknowledges this as Open Question Q2 (MEDIUM risk). It should be elevated to HIGH and moved to Phase 0 / Phase 2 schema preparation.

**Fix:** Add `uniqueIndex("appointments_recurring_occurrence_unique_idx").on(table.recurringParentId, table.startTime)` to appointments schema. This requires a migration. Must be added before `materializeOccurrence` is deployed.

Caveat: This unique constraint only prevents duplicate materialization of the same occurrence. It does NOT prevent two real appointments (non-recurring) from having the same startTime on the same parent — but since non-recurring appointments have `recurringParentId = null`, the constraint becomes `(null, startTime)` which PostgreSQL does NOT enforce (NULL != NULL in unique indexes). This is correct behavior.

---

### SC-005 — `appointment_staff` N+1 in appointments.list — already mitigated by batch fetch
**Severity: INFORMATIONAL**

The existing `appointments.list` handler already batches:
- One query for all `appointmentStaff` rows for all appointment IDs
- One query for member id resolution
- One query for profiles

This is the correct pattern. No N+1 issue in the current implementation.

Phase 2.3 `listAppointmentsWithRecurrence` must maintain the same batch pattern — it should return a flat list and let the router do its existing enrichment rather than querying inside the expansion loop.

---

### SC-006 — `package_instance_staff` unique constraints properly protect against races
**Severity: INFORMATIONAL (confirmed correct)**

Two unique constraints:
1. `UNIQUE(packageInstanceId, staffId)` — prevents same staff in multiple slots
2. `UNIQUE(packageInstanceId, slotIndex)` — prevents two staff in same slot

PostgreSQL will enforce these atomically. No additional application-level locking needed for the `assign` procedure, as long as it uses INSERT (which will fail with constraint violation on race) rather than upsert.

The `replacePackageInstanceStaff` procedure (DELETE + INSERT) should be wrapped in a transaction to ensure atomicity.

---

### SC-007 — `series split` migrates materialized children with UPDATE — could be slow for large series
**Severity: LOW**

Phase 2.5 `splitSeries` step 4:
> "Migrate all materialized children with startTime >= fromDate to point to new parent (`UPDATE appointment SET recurringParentId = newParentId`)"

For a series with many materialized (individually edited) occurrences, this is a bulk UPDATE. The `recurringParentIdIdx` index speeds the WHERE clause. For typical gym use cases (< 50 materialized children per series), this is fast.

For long-running series (years) with many edits, this could scan many rows. No action required for MVP — note in plan for future optimization.

---

## Summary Table

| ID | Issue | Severity |
|----|-------|----------|
| SC-001 | Unbounded virtual expansion for 'never' series | MEDIUM |
| SC-002 | Buffer-time loop: N sequential round-trips | MEDIUM |
| SC-003 | Missing isRecurring index for Phase 2.3 | HIGH |
| SC-004 | Concurrent materialization race unmitigated | HIGH |
| SC-005 | N+1 in appointments.list — already mitigated | OK |
| SC-006 | package_instance_staff constraint race | OK |
| SC-007 | splitSeries bulk UPDATE for large series | LOW |
