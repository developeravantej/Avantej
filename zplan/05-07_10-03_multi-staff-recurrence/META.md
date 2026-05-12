# META — Multi-Staff Appointments & Recurrence

**Plan file:** `plan/plan.md`  
**Created:** 2026-05-07  
**Feature area:** Area D  
**Status:** PLAN — not yet implemented

---

## Scope

Three tenant schema tables: `appointment_staff`, `package_instance_staff`, `recurrence_rules`.

Two independently deliverable phases:
- **Phase 1 (multi-staff):** ~4.5 days — expose existing backend, fix staffId convention, add update path, build package_instance_staff service, UI pickers
- **Phase 2 (recurrence):** ~7 days — lazy expansion engine, materialize/split/cancel semantics, recurrence picker UI, GCal events per occurrence

## Key Decisions Locked

1. **staffId = members.userId** (not members.id). Commission calculator requires this. All write paths must use userId.
2. **appointments.trainerId kept** as members.id UUID FK. Slot 0 of appointment_staff is authoritative for commissions; trainerId is denormalized cache for joins.
3. **Lazy expansion**: no occurrence rows materialized at create time. Virtual occurrences generated in-memory on list. Materialize on first individual edit or cancel.
4. **Two recurrence systems coexist**: legacy columns (isRecurring, recurringParentId, recurringEndDate) remain and are used; recurringFrequency is deprecated (new code never writes it). recurrence_rules table is authoritative for pattern.
5. **No RRULE for GCal**: each materialized occurrence gets its own GCal event. Parent gets one event for occurrence 1.
6. **Edit-all does NOT retroactively change materialized children** — document in UI.

## Pre-Implementation Checks

- [x] Confirm `appointment_staff`, `package_instance_staff`, `recurrence_rules` are in `tenant-migrations.generated.ts` — VERIFIED: all three present (0026/0018/initial migrations)
- [x] Confirm `client.members.list` returns `userId` field — VERIFIED: members router line 131 returns `userId: m.userId`
- [ ] Confirm no existing recurring appointments in any tenant DB (safe to deploy lazy strategy)
- [x] Check `(recurringParentId, startTime)` unique constraint status on appointments table — VERIFIED ABSENT: must be added in Phase 0 task 6. Only a plain index `appointments_recurring_idx` exists; no unique constraint.

## Files Touched (Phase 1)

- `packages/db/src/schema/tenant/appointments.ts` — deprecation comment on recurringFrequency
- `packages/services/src/appointment.service.ts` — resolveMemberIdFromUserId helper, updateAppointment staff, buffer-time loop
- `packages/services/src/package-instance-staff.service.ts` — NEW
- `packages/services/src/index.ts` — add package-instance-staff exports
- `packages/api/src/routers/appointments.ts` — staffAssignments on update input
- `packages/api/src/routers/package-instance-staff.ts` — NEW
- `packages/api/src/routers/index.ts` — register packageInstanceStaff router
- `apps/web/src/components/calendar/add-appointment-modal.tsx` — StaffSlotList
- `apps/web/src/components/calendar/appointment.tsx` — edit modal with staff slots (or new edit-appointment-modal.tsx)
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx` — package staff section

## Files Touched (Phase 2)

- `packages/services/src/recurrence.service.ts` — NEW
- `packages/services/src/index.ts` — recurrence exports
- `packages/services/src/appointment.service.ts` — createAppointment recurrence param, materializeOccurrence, splitSeries
- `packages/api/src/routers/appointments.ts` — create recurrence input, list virtual occurrences, materializeOccurrence + splitSeries procedures
- `apps/web/src/components/calendar/add-appointment-modal.tsx` — recurrence picker
- `apps/web/src/components/calendar/appointment.tsx` — render virtual occurrences, edit/cancel menus

## Source Research Completed

| File | Finding |
|------|---------|
| `packages/db/src/schema/tenant/appointment-staff.ts` | staffId is text (no FK); slotIndex present; UNIQUE(appointmentId, staffId) |
| `packages/db/src/schema/tenant/package-instance-staff.ts` | slot 0 = primary; role field; UNIQUE on (instanceId, staffId) AND (instanceId, slotIndex) |
| `packages/db/src/schema/tenant/recurrence-rules.ts` | 1:1 on parent; repeatOn is jsonb number[]; all end condition fields present |
| `packages/db/src/schema/tenant/appointments.ts` | trainerId → members.id UUID FK; legacy recurrence columns coexist |
| `packages/api/src/routers/appointments.ts` | create already accepts staffAssignments; list already reads appointment_staff; update does NOT accept staffAssignments |
| `packages/services/src/appointment.service.ts` | createAppointment already inserts appointment_staff; updateAppointment has no staff handling; buffer-time check is single-trainer |
| `packages/services/src/commission-calculator.service.ts` | fully multi-staff; uses members.userId (line 399); slot redistribution implemented |
| `packages/services/src/commission-splits.service.ts` | createCommissionSplit is per-staff single call; applyCommissionCaps used by calculator |
| grep: packageInstanceStaff in services | ZERO matches — entirely unbuilt |
