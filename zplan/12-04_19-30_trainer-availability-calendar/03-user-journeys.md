# 3. User Journeys

## Journey 1: Admin sets a trainer's weekly availability

**Trigger:** Admin navigates to Trainers page and clicks "Edit" on a trainer row.

### Steps

1. Admin is on `/dashboard/trainers/view` — sees the existing trainers data table.
2. Admin clicks **"Edit"** action on a trainer row → the **edit Sheet** (right drawer) opens.
3. The Sheet now has **two collapsible sections**:
   - **Profile** (existing) — display name, specialization, phone, bio, certifications.
   - **Weekly Availability** (NEW) — below the Profile section.
4. Admin expands the **Weekly Availability** section → sees a day-by-day schedule editor:
   - 7 day rows (Monday–Sunday), each showing existing shifts or "No shifts set".
   - Each day has an **"+ Add Shift"** button.
5. Admin clicks **"+ Add Shift"** on Monday → an inline row appears with two time inputs: **Start Time** and **End Time** (HH:MM selectors).
6. Admin sets Start: `09:00`, End: `12:00` → the shift appears as a chip/row: "09:00 – 12:00" with an **X** button to remove.
7. Admin clicks **"+ Add Shift"** on Monday again → adds a second shift: `14:00 – 18:00`.
8. Admin repeats for other days as needed.
9. Admin clicks **"Save Changes"** → the Sheet calls `client.trainerAvailability.upsert({ trainerId, slots: [...] })`.
10. On success: toast "Availability updated", Sheet closes, trainer list refreshes.
11. On error: toast with error message, Sheet stays open.

### Where it lives

Inline in the existing edit Sheet at `/dashboard/trainers/view`. The Weekly Availability section is a new collapsible (`<Collapsible>`) added below the existing Profile collapsible.

### Validation Rules

- `endTime` must be after `startTime` (e.g., "09:00" < "12:00").
- Shifts on the same day must not overlap (e.g., cannot add 10:00–15:00 if 09:00–12:00 already exists).
- At least one shift is required to save (empty availability = remove all).
- Time inputs use 30-minute increments (00, 30) for simplicity.

---

## Journey 2: Admin views a trainer's appointment schedule

**Trigger:** Admin navigates to the Appointments page.

### Current Flow (BEFORE)

1. Admin goes to `/dashboard/appointment/view`.
2. Sees a full-width `AppointmentCalendar` showing ALL appointments across all trainers.
3. Can filter by status (confirmed/cancelled) and by team members (extracted from appointment data).
4. Team member filter only shows trainers who already have appointments — not all trainers.

### New Flow (AFTER)

1. Admin goes to `/dashboard/appointment/view`.
2. Sees a **two-panel layout**:
   - **Left sidebar** (~250px): Trainer list with search.
   - **Right panel** (remaining width): The existing `AppointmentCalendar`.
3. The **trainer sidebar** loads trainers via `client.members.list({ organizationId, role: "trainer", status: "active" })`.
   - Shows trainer name, specialization (if available), and an avatar placeholder.
   - Trainers are scoped by the admin's hierarchy (RBAC) — the members router handles this automatically.
   - An **"All Trainers"** option at the top is selected by default (shows all appointments, same as current behavior).
   - Search input at top filters the trainer list client-side.
4. Admin clicks a trainer name (e.g., "Coach Alex") in the sidebar.
   - The trainer is highlighted in the sidebar.
   - The calendar re-fetches with `client.appointments.list({ organizationId, trainerId: selectedTrainerId, startFrom, startTo })`.
   - Only Coach Alex's appointments appear on the calendar.
5. Admin clicks **"All Trainers"** → calendar goes back to showing all appointments (no `trainerId` filter).
6. All existing calendar features continue to work: monthly/weekly toggle, add appointment modal, status updates, date navigation.

### Where it lives

Same page: `/dashboard/appointment/view`. The route component is refactored to wrap the calendar in a flex layout with the sidebar. The `AppointmentCalendar` component itself is **not** modified — the filtering happens at the data layer (the query changes).

---

## Journey 3: Trainer views their own schedule

**Trigger:** A user with `role: "trainer"` navigates to the Appointments page.

### Steps

1. Trainer goes to `/dashboard/appointment/view`.
2. The page detects the user's member role is `"trainer"`.
3. The **trainer sidebar is hidden** — the trainer doesn't need to pick themselves.
4. The calendar loads with `client.appointments.list({ organizationId, trainerId: currentMemberId, startFrom, startTo })`.
5. The trainer sees only their own appointments.
6. A header shows: **"My Schedule"** instead of "Appointments".
7. All calendar features work: monthly/weekly toggle, date navigation, click to view appointment details.
8. The **"Add Appointment"** button is hidden (trainers shouldn't create appointments for themselves via the calendar — admins do this).

### Where it lives

Same page: `/dashboard/appointment/view`. The role check happens in the route component. No separate route needed.

### Role Detection Logic

```typescript
const currentOrg = userContext?.organizations.find(o => o.id === organizationId);
const memberRole = currentOrg?.hierarchy?.member?.role;
const memberId = currentOrg?.hierarchy?.member?.id; // member table ID

const isTrainer = memberRole === "trainer";
const selectedTrainerId = isTrainer ? memberId : selectedFromSidebar;
```

---

## Journey 4: Admin creates an appointment and views it on a trainer's calendar

**Trigger:** Admin has a trainer selected in the sidebar and wants to add an appointment.

### Steps

1. Admin has "Coach Alex" selected in the sidebar → calendar shows Coach Alex's appointments.
2. Admin clicks **"+ Add Appointment"** button on the calendar.
3. The `AddAppointmentModal` opens (existing component).
4. The **Team Member** field in the modal is **pre-filled** with "Coach Alex" (the currently selected trainer). Admin can change it if needed.
5. Admin fills in client, service, date/time, duration, etc.
6. Admin clicks "Create Appointment" → appointment is created with `trainerId = coachAlexId`.
7. Modal closes, calendar refreshes → the new appointment appears on Coach Alex's calendar.

### Where it lives

Existing `AddAppointmentModal` component. The only change is passing the `selectedTrainerId` as a default value for the team member field.

---

## Journey 5: Admin views a trainer's availability from the Trainers page

**Trigger:** Admin opens the edit sheet for a trainer to review or update their schedule.

### Steps

1. Admin is on `/dashboard/trainers/view`.
2. Admin clicks "Edit" on a trainer row → Sheet opens.
3. Admin scrolls to or expands the **Weekly Availability** section.
4. The section fetches `client.trainerAvailability.list({ organizationId, trainerId })`.
5. Existing shifts are displayed in a structured layout:
   - **Monday**: 09:00 – 12:00, 14:00 – 18:00
   - **Tuesday**: No shifts set
   - **Wednesday**: 09:00 – 17:00
   - ... etc.
6. Admin can add/remove shifts and save.

### Where it lives

Inside the edit Sheet on `/dashboard/trainers/view`, as the second collapsible section.
