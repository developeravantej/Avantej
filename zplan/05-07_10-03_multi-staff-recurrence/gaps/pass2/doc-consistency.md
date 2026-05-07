# Pass 2 — Documentation Consistency Audit

## Summary

Pass 1 applied most doc fixes correctly. New finding: Phase 2.6 overloads `appointments.update` instead of using dedicated procedures, which contradicts the single-responsibility pattern used elsewhere in the plan. Phase 2 time estimate does not include Phase 2.0 pre-work.

---

## New Findings

### DC-P2-001 — Phase 2.6 procedure design contradicts plan's own separation-of-concerns principle
**Severity: MEDIUM**

Plan Phase 2.4 creates `appointments.materializeOccurrence` (dedicated procedure).
Plan Phase 2.5 creates `appointments.splitSeries` (dedicated procedure).
Plan Phase 2.6 adds `cancelFutureFrom` and `cancelAll` to `appointments.update` (overloading existing procedure).

This is inconsistent. The rationale for dedicated procedures in 2.4 and 2.5 is that they have complex multi-step logic. `cancelAll` and `cancelFutureFrom` have equally complex logic (bulk UPDATE of all children, series split with cancel status).

Recommended refactor: Create `appointments.cancelSeries` and `appointments.cancelFuture` as dedicated procedures. Reference in Phase 2.9 (`cancel_all` → `cancelSeries`, `cancel_future` → `cancelFuture`).

---

### DC-P2-002 — Phase 9 estimates do not include Phase 2.0 pre-work
**Severity: LOW**

Section 9 (Implementation Order & Estimates) table does not include Phase 2.0 (schema pre-work). The table should include:
```
| 2.0 | Schema: isRecurring index, unique constraint verify, timezone decision | 0.5 day |
```
Grand total should increase from ~11.5 to ~12 days.

---

### DC-P2-003 — META.md pre-implementation checks need updating
**Severity: LOW**

META.md "Pre-Implementation Checks" list:
- [ ] Confirm `appointment_staff`, `package_instance_staff`, `recurrence_rules` are in `tenant-migrations.generated.ts` ← VERIFIED: all three present
- [ ] Confirm `client.members.list` returns `userId` field ← VERIFIED: yes
- [ ] Confirm no existing recurring appointments in any tenant DB (safe to deploy lazy strategy)
- [ ] Check `(recurringParentId, startTime)` unique constraint status on appointments table ← VERIFIED: absent, must be added

META.md should be updated with verification results for first two checks and resolution for fourth check.

---

### DC-P2-004 — Plan uses `virtual:` prefix in one place after Pass 1 fix to `virtual__`
**Severity: LOW**

Check plan after Pass 1 edits — search for any remaining `virtual:` references not updated to `virtual__`.

---

## Pass 1 DC Findings Status

| DC | Status |
|----|--------|
| DC-001: add-appointment-modal.tsx is thin shell | Fixed in plan Phase 1.3 |
| DC-003: EditAppointmentModal is definite | Fixed in plan Phase 1.4 |
| DC-006: listAppointmentsWithRecurrence integration | Notes added to Phase 2.3 |
| DC-007: Timezone unresolved | Added as Phase 0 task 7 + Phase 7 note |
| DC-010: package-instances slot-0 conflict | Added comment to Phase 1.2 |
