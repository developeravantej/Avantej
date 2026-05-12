# Pass 2 — Schema Drift Audit

## Summary

Pass 1 findings SD-001 through SD-007 remain open (not yet fixed in source). Two new findings added.

---

## New Findings

### SD-P2-001 — CRITICAL: EXCLUSION constraint `appointments_trainer_no_overlap` interacts with multi-staff `trainerId` update
**Severity: HIGH**

Migration `0026_pipeline_audit` and `0030_add_appointment_exclude_constraints` add:
```sql
EXCLUDE USING GIST (
  trainer_id WITH =,
  tsrange(start_time, end_time, '[)') WITH &&
)
WHERE (status NOT IN ('cancelled', 'no-show') AND trainer_id IS NOT NULL)
```

This constraint fires on INSERT and UPDATE of `appointments.trainerId`. 

Impact on Phase 1.1 `updateAppointment` staff replace:
- If `staffAssignments` includes a new slot 0 trainer, the service must update `appointments.trainerId` to the new slot 0 member.id
- If the new trainer is already booked at that time (via ANOTHER appointment's `trainerId`), the UPDATE will throw `23P01` exclusion_violation
- Plan section 3.5 mentions buffer-time check loop — but the EXCLUSION constraint fires on ANY overlap, independent of buffer time. The constraint is stricter and fires BEFORE buffer time matters.

Critical gap: The plan's Phase 1.1 updateAppointment staff replace code does NOT update `appointments.trainerId` when slot 0 changes. Plan section 6 says "On update: if staffAssignments includes slot 0, derive trainerId from it." But the implementation pseudocode in Phase 1.1 does NOT include this step:
```typescript
if (params.staffAssignments !== undefined) {
  await tx.delete(appointmentStaff)...
  await tx.insert(appointmentStaff)...
  // ← NO trainerId update here
}
```

**Fix required in Phase 1.1:** When `staffAssignments` is provided and includes `slotIndex: 0`, resolve that staff's `members.id` and update `appointments.trainerId` in the same transaction.

---

### SD-P2-002 — "year" timeUnit in RepeatRuleSection UI but NOT in backend schema
**Severity: MEDIUM**

`RepeatRuleSection.tsx` SelectItem: `<SelectItem value="year">year</SelectItem>`

Backend `recurrence_rules.timeUnit` documented in plan as `'day' | 'week' | 'month'` only. "year" is not in the planned Zod schema enum.

Fix: Either add "year" to the timeUnit enum in the router and expansion engine, OR remove "year" from the UI dropdown before Phase 2.7. Plan should resolve this explicitly.

---

## Pass 1 Findings Still Open

- SD-001: `appointment_staff.slotIndex` nullable — plan now annotated, source not yet fixed
- SD-002: `recurrence_rules` timestamps lack withTimezone — still open
- SD-004: `(recurringParentId, startTime)` unique constraint — plan updated to include in Phase 0, source not yet changed
