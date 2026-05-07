# Pass 2 — API Surface Audit

## Summary

Pass 1 CRITICAL AS-001 (staffId UUID convention) is partially mitigated by plan annotations but not yet fixed in source. New finding: Phase 2.6 cancel-all-future / cancel-all are described as additions to `appointments.update` but introduce complex logic that may conflict with the existing update transaction.

---

## New Findings

### AS-P2-001 — Phase 2.6 adds `cancelFutureFrom` and `cancelAll` to `appointments.update` — introduces ambiguity with existing update transaction
**Severity: MEDIUM**

Plan Phase 2.6:
> "`appointments.update` additions: `cancelFutureFrom?: Date` — if set, run series split with status=cancelled for tail. `cancelAll?: boolean` — if set, mark parent cancelled + all children."

The existing `updateAppointment` service already handles status transitions (with `assertValidTransition`) and credit restores. Adding `cancelAll` means:
1. Transition parent appointment status to 'cancelled'
2. UPDATE all child appointments (recurringParentId = parentId) to status 'cancelled'

The existing `assertValidTransition` only validates one transition. Bulk-cancelling children bypasses individual child status machine checks.

Additionally, `cancelFutureFrom` = `splitSeries` with `status: 'cancelled'` — this is a completely different code path from a simple update. Putting this inside `updateAppointment` will make that function handle 4 distinct code paths (simple update, cancel-all, cancel-future, materialize-and-cancel).

**Recommendation:** Keep `cancelAll` and `cancelFutureFrom` as separate procedures (`appointments.cancelSeries`, `appointments.cancelFuture`) rather than overloading `appointments.update`. This keeps each procedure's logic clean and testable. The plan should be revised accordingly.

---

### AS-P2-002 — `appointments.list` does NOT filter out materialized child rows
**Severity: HIGH**

Current `listAppointments` in service: no `WHERE recurringParentId IS NULL` filter. All appointments are returned regardless of `recurringParentId`.

After Phase 2, materialized child rows (individually edited/cancelled occurrences) will have `recurringParentId IS NOT NULL`. If `listAppointmentsWithRecurrence` also returns virtual occurrences, the calendar will double-show:
- The virtual occurrence (from expansion engine)
- The materialized child row (from DB query)

The plan mentions this in section 6 ("Recurring list endpoint performance"): "base list must exclude materialized children". The fix is noted. However, the plan's Phase 2.3 implementation text does NOT include this filter in the pseudocode — it says "Replace direct DB query with listAppointmentsWithRecurrence" without specifying the WHERE clause change.

**Fix must be explicit in Phase 2.3:** `listAppointmentsWithRecurrence` internal base query must add `AND recurringParentId IS NULL` (or `WHERE recurringParentId IS NULL OR isRecurring = false`).

---

### AS-P2-003 — `checkAppointmentBufferConflict` uses TSRANGE + EXCLUDE, but multi-staff loop also checks buffer via software — double-check is redundant but harmless
**Severity: LOW (informational)**

The DB EXCLUSION constraint (`appointments_trainer_no_overlap`) catches overlapping bookings for the same `trainerId` at the DB level. The software buffer-time check in `createAppointment` is an additional pre-flight check that gives a better error message. For multi-staff Phase 1.1, the loop adds buffer checks for each staff member.

However: the EXCLUSION constraint only covers `appointments.trainerId`, not `appointment_staff.staffId` slots. If trainer B is assigned as slot 1 (not slot 0 / trainerId), their overlap is NOT caught by the DB constraint — only by the buffer-time software check. This is the gap AS-003 from Pass 1, now confirmed by reading the constraint definition.

**Implication for Phase 1.1:** The buffer-time loop for staff members other than slot 0 is the ONLY overlap prevention mechanism for those staff. It cannot be skipped or deferred.

---

### AS-P2-004 — `package_management` resource: DB lookup for unknown resource silently denies
**Severity: CRITICAL (confirmed from Pass 1 AS-007)**

`requirePermission` does a DB lookup for the resource+action in the `permissions` table. If `"package_management"` is not seeded as a permission resource in the tenant DB, the lookup returns no matching `rolePermissions` rows, and the function throws "Access denied" for ALL members including admins.

Two things needed:
1. Add `"package_management"` to `Resource` union type in `permission.service.ts` (TypeScript)
2. Ensure `"package_management"` is seeded in the `permissions` table for existing tenants (a DB migration or seed script)

The plan mentions only item 1. Item 2 is a deployment risk: new code calls `requirePermission(..., "package_management", ...)` but existing tenant DBs don't have this permission seeded → all `packageInstanceStaff` calls fail for all users.

**Fix in Phase 1.2:** Check how other permissions are seeded (look at `permissions` table population) and add `package_management` to the seed/migration.

---

## Pass 1 Findings Confirmed Still Open

- AS-001: staffId UUID convention — plan annotated, source `useAppointmentFormData.ts` not yet fixed
- AS-004: updateAppointment no staffAssignments — expected gap, Phase 1.1 work
- AS-005: packageInstanceStaff entirely absent — expected gap, Phase 1.2 work
- AS-006: Recurrence procedures absent — expected gap, Phase 2 work
- AS-007: package_management resource missing — partially annotated in plan; see AS-P2-004 for DB seed gap
