# Appointments (Calendar View)

**Route:** `/dashboard/appointment/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-20 (Pipeline Audit B/C/D)

---

## 1. What It Does

**Purpose (user perspective):** Displays a visual calendar of appointments, filtered by trainer, allowing admins to browse all trainers or trainers to see only their own schedule.

**Produces:** A full-page calendar (monthly or weekly view) with an optional trainer-filter sidebar for admins.

**On success:** Appointments are rendered as calendar events; admins can select a specific trainer from the sidebar; clicking a date or "Add Appointment" opens the add-appointment modal managed internally by `AppointmentCalendar`.

**On failure / error states:**
- No `organizationId`: renders empty prompt "No organization selected."
- API error: renders error message from the exception.
- Loading: spinner centered in a `py-24` container while appointments fetch.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId, memberRole, memberId
  → getAppointmentQueryRange() → startFrom / startTo window
  → useQuery(["appointments", orgId, trainerId, startFrom, startTo])
      → client.appointments.list({ organizationId, trainerId, startFrom, startTo, limit:200 })
  → mapApiAppointmentToCalendar() (lib/appointment-mapper.ts)
  → <TrainerSidebar> (admins only) → client.members.list({ role:"trainer" })
  → <AppointmentCalendar appointments={...} />
      → internally: <AddAppointmentModal> → client.appointments.create
      → internally: updateMutation → client.appointments.update (status change)
```

**Inputs:**
- `?view=weekly` query param — sets initial calendar view (`monthly` default)
- `userContext.organizations[].hierarchy.member.role` — `"trainer"` locks filter to self
- Trainer sidebar selection (admin only)

Create fields include: `type`, `startTime`, `duration`, `branchId`, `serviceId`, `status`, `sessionTotal`, `pricePerClient`, `userId` (client), `trainerId`, `packageInstanceId`, `creditsUsed`, `location`, `classSlotId`, `bookingNumber`, `notes`, `description`, `imageUrl`.

**State management:**
- `sidebarSelectedId` — locally selected trainer UUID (admin mode); `null` means "all"
- Query cached at `staleTime: 60_000 ms`

**Outputs:** Calendar UI; toast on date-select and appointment-click (informational only — no navigation).

**Side effects:** `AddAppointmentModal` (inside `AppointmentCalendar`) invalidates the appointments query on successful creation.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.appointments.list` — fetch appointments in a date range, optionally by trainerId; uses SQL `inArray(branchId, accessibleNodeIds)` filter (not JS post-filter)
- `client.appointments.listForUser` — list appointments for the current session user (client view); no staff permission required; used by native app.
- `client.appointments.getById` — get a single appointment; accessible by either the owning client (userId match) or staff with `appointment_management:read`.
- `client.members.list` (via `TrainerSidebar`) — list active trainers for sidebar
- `client.appointments.create` (via `AddAppointmentModal`) — create new appointment
- `client.appointments.update` (via `AppointmentCalendar`) — update status; enforces status machine transitions; restores package credits on cancellation; creates commission splits on completion

**Uses these components:**
- `AppointmentCalendar` — `apps/web/src/components/calendar/appointment.tsx` — full calendar with month/week views, group-select, add-modal
- `TrainerSidebar` — `apps/web/src/components/calendar/trainer-sidebar.tsx` — searchable trainer list with debounced filter; displays `member.displayName ?? member.name ?? member.email ?? "Unknown Trainer"` and filters on `member.name ?? member.email`
- `AddAppointmentModal` — `apps/web/src/components/calendar/add-appointment-modal.tsx` — modal rendered inside `AppointmentCalendar`

**Uses these hooks:**
- `useUserContext` — current org, member role/id
- `useQuery` (TanStack Query) — appointment fetch
- `useMemo` — maps raw API response to calendar shape

**Navigation: who navigates here:** `app-sidebar.tsx` (sidebar link "Appointments" under Appointments section)

**Navigation: where it goes:** Stays on page; no outbound navigation triggered.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `appointments` | SELECT / INSERT / UPDATE | `id`, `type`, `startTime`, `endTime`, `duration`, `serviceId`, `branchId`, `status`, `sessionTotal`, `pricePerClient`, `userId`, `trainerId`, `packageInstanceId`, `creditsUsed`, `location`, `bookingNumber`, `classSlotId`, `cancelledAt`, `cancellationReason`, `description`, `imageUrl`, `roomId`, `googleCalendarEventId`, `isRecurring`, `recurringParentId`, `paymentStatus`, `notes`, `createdBy` |
| `services` (tenant) | SELECT (batch join) | `id`, `name`, `commissionPercentage` — resolved for `serviceName`; commission config used to trigger split creation on completion |
| `member_profiles` (tenant) | SELECT (batch join) | `memberId`, `displayName` — resolved for `trainerName` on each appointment |
| `user` (control panel) | SELECT (batch join) | `id`, `name` — resolved for `clientName` on each appointment |
| `members` | SELECT (TrainerSidebar) | `userId`, `role`, `status`, `displayName`, `name`, `email` |
| `appointment_clients` | INSERT / SELECT | `appointmentId`, `clientId`, `packageInstanceId`, `pricePaid`, `attended`, `clientType` ("member"\|"walk_in"), `walkInCustomerId` (nullable) |
| `commission_splits` | INSERT (non-fatal) | Created when status→'completed' and `services.commissionPercentage > 0`; one split per assigned staff member |

**Key types / Zod schemas:**
- `ApiAppointment` / `CalendarAppointment` — defined in `apps/web/src/lib/appointment-mapper.ts`
- `ApiAppointment` includes optional enriched fields: `serviceName?`, `trainerName?`, `clientName?`
- Status mapping: `pending→pending`, `confirmed/completed→confirmed`, `cancelled/no-show→cancelled`
- Enrichment: `appointments.list` does 3 parallel batch queries (services, member_profiles, control-panel users) and merges names; falls back to truncated UUID if not found (e.g. deleted user)

**Permission required:** `appointment_management:read` (enforced in `beforeLoad` via `requirePermission`)

---

## 5. Tests

**Test files:** None found (no test files reference `appointment/view`)

**Not tested:** Role-based trainer lock, date-range query, sidebar trainer filtering, add/update appointment mutations

---

## 6. Notes

- `requirePermission` in `beforeLoad` is documented as a stub in route-guards.ts — it does not actually block access in the current implementation.
- Trainers see the page titled "My Schedule"; admins see "Appointments".
- `handleDateSelect` and `handleAppointmentClick` only fire `toast.info` — no navigation or modal logic in the route itself; the calendar component manages its own modal state.
- `getAppointmentQueryRange()` determines the fetch window (implementation in `lib/appointment-mapper.ts`).
- `defaultTrainerId` is passed to `AppointmentCalendar` so the internal team-filter pre-selects the trainer.
- Trainer sidebar name display fixed (2026-04-16): fallback chain is now `member.displayName ?? member.name ?? member.email ?? "Unknown Trainer"` (previously used `member.userId` as fallback, which showed raw UUIDs). Filter search also uses `member.name ?? member.email` instead of `member.userId`.

---

## 7. Recent Changes (2026-04-20 — Pipeline Audit B/C/D)

**Status machine enforcement (`appointment-status-machine.ts`):**
- `updateAppointment` calls `assertValidTransition(existing.status, params.status)` before allowing any status change.
- Valid transitions: `pending→confirmed|cancelled|no-show`, `confirmed→completed|cancelled|no-show`, terminal states (`completed|cancelled|no-show`) have no allowed transitions.
- Throws `ORPCError("PRECONDITION_FAILED")` on invalid transition.

**Cancellation credit restoration:**
- When status transitions to `"cancelled"` (and was not already cancelled), `creditsUsed` is restored to the parent `package_instances` row.
- Restoration runs inside the update transaction; the package row is locked `FOR UPDATE` before modification to prevent races.
- If the package was `exhausted`, it is restored to `active` after credit return.
- Non-fatal: if the package is not found or already in a terminal state, a warning is logged and restoration is skipped.

**Commission split creation on completion:**
- When status transitions to `"completed"`, `appointment.service.ts` fetches `services.commissionPercentage` for the appointment's service.
- If `commissionPercentage > 0`, looks up `appointment_staff` for the appointment and creates one `commission_split` per staff member.
- Split percentage = `(commissionBasisPoints / 100) / staffCount`.
- Non-fatal: appointment update succeeds even if commission creation fails.

**`appointment_clients` schema additions (migration 0027):**
- `client_type TEXT NOT NULL DEFAULT 'member'` — `"member"` or `"walk_in"`.
- `walk_in_customer_id UUID` — nullable FK to `walk_in_customers`; used when `client_type = "walk_in"`.

---

## 8. Recent Changes (2026-04-17 — Rooms Management)

The `AddAppointmentModal` (single-appointment mode) received three related changes as part of the Rooms Management feature — see `zhub/pages/web-dashboard-rooms-view.md` for the new Rooms page.

- **Area dropdown empty-state link.** When `rooms.length === 0`, the Area field no longer renders an empty `<Select>`. It renders a dashed-border inline hint: "No rooms available. Create one →" where the link is a TanStack `Link` to `/dashboard/rooms/view?returnTo=/dashboard/appointment/view`. Clicking the link calls the modal's `onClose()` first so the appointment modal closes before navigation. This resolves the prior dead-end where fresh tenants could not create an appointment at all.
- **Employee dropdown is now context-aware.** The Employee `<Select>` is `disabled` until a room is selected, and its placeholder is computed by a new `employeePlaceholder = useMemo(...)` (file `add-appointment-modal.tsx`, ~line 382):
  - No room selected → "Select an area first"
  - Room selected, employees list empty → "There are no employees available"
  - Room selected, employees present → "Select an employee"
  Note: the underlying query (`client.members.list({ organizationId })`) does not actually filter by room today — the placeholder language was chosen to reflect the state machine, not a room-based filter. See plan §8 Q1.
- **Multi-appointment mode deferred.** The multi-appointment mode area/employee dropdowns near line 1828 were intentionally not touched. They still show the old always-empty dropdown when no rooms exist. Follow-up: apply the same empty-state link + contextual placeholder treatment there.
