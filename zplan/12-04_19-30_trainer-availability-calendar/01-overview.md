# Trainer Availability & Calendar Dashboard

## 1. Overview

### Problem Statement

The web dashboard's appointment view currently shows all appointments in a flat calendar with no trainer-specific filtering. Trainers cannot see their own schedule at a glance, and admins have no way to view a specific trainer's bookings. Additionally, there is no concept of trainer working hours in the database — the mobile app offers hardcoded 8AM–7PM slots regardless of actual trainer availability.

### Goals

1. **Trainer availability in DB** — Store each trainer's recurring weekly schedule (working hours, multiple shifts per day) in a new `trainer_availability` tenant table.
2. **Trainers CRUD: availability management** — Extend the existing Trainers page (`/dashboard/trainers/view`) to let admins set/edit each trainer's weekly hours.
3. **Appointment view: trainer-focused calendar** — Redesign the appointment page layout to show a trainer list sidebar (left) + calendar (right). Admins pick a trainer to see their bookings; trainers see only their own schedule automatically.
4. **Backend: trainerId filtering** — Add `trainerId` as a filter to the appointments `list` procedure and service so the calendar can query per-trainer.

### Success Criteria

- Admin can set a trainer's weekly availability (e.g., Mon 9–12 + 14–18, Wed 9–17) from the Trainers page.
- Admin opens appointment view, sees trainer list on left (scoped by hierarchy/role), clicks a trainer, and the calendar shows only that trainer's appointments.
- Trainer logs into the web dashboard appointment view and sees their own schedule — no trainer picker visible.
- `trainer_availability` table is created via migration and `db:push` succeeds.
- All existing appointment functionality continues to work (no regressions).

### Scope

**In scope:**
- `trainer_availability` schema + migration
- Trainer availability CRUD (service, router, UI in trainers page)
- Appointment view layout redesign (sidebar + calendar)
- `trainerId` filter on `appointments.list` API
- Role-based auto-filtering (trainer sees own, admin sees all)

**Out of scope:**
- Mobile app changes (booking flow stays as-is)
- Trainer time-off / vacation management
- Availability displayed as background layer on calendar
- Conflict detection during appointment creation
- Branch-scoped availability (one availability per trainer, not per branch)
