# Appointment View (Calendar)

**Route:** `/_authenticated/appointment/view`
**File:** `apps/web/src/routes/_authenticated/appointment/view.tsx:1`
**Platform:** web
**Auth required:** rbac(appointment_management:read)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Displays a calendar view of all appointments in the member's accessible branches for a ~3-month window (previous month through next month).

**Produces:** An `AppointmentCalendar` component rendered with appointments fetched from the API, supporting both monthly and weekly views.

**On success:** Calendar renders with appointment blocks color-coded by status (confirmed, pending, cancelled).
**On failure / error states:**
- No organization selected → "No organization selected. Please select an organization first."
- API error → displays `error.message` in destructive text.
- Loading → centered "Loading appointments..." text (no skeleton).
- Empty result → calendar renders empty (no special empty-state message).

---

## 2. How It Works

**Execution flow:**
```
AppointmentViewComponent
  → useUserContext() — get organizationId
  → getAppointmentQueryRange() — compute startFrom / startTo (prev month to next month+1)
  → useQuery(["appointments", organizationId, startFrom, startTo])
      → client.appointments.list({ organizationId, startFrom, startTo, limit: 200 })
          → POST /rpc/appointments/list
          → requirePermission(tenantDb, member, "appointment_management", "read")
          → listAppointments(tenantDb, { accessibleNodeIds, startFrom, startTo, limit })
              → SELECT FROM appointments WHERE branchId IN accessibleNodeIds
  → useMemo: apiAppointments.map(mapApiAppointmentToCalendar)
  → <AppointmentCalendar appointments={appointments} />
```

**Inputs:**
- No URL params or query params.
- `organizationId` from `useUserContext()`.
- Date range auto-computed: 1 month before today through 2 months after today.

**State management:** TanStack Query cache (`staleTime: 60s`). Component has no local state.

**Outputs:** `<AppointmentCalendar>` with mapped appointments.

**Side effects:** None (read-only page; mutations are inside `AppointmentCalendar` component).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `appointments.list` — `POST /rpc/appointments/list` — fetches appointments scoped to accessible nodes, filtered by date range

**Uses these components:**
- `AppointmentCalendar` — `@/components/calendar/appointment.tsx` — full calendar UI with add/edit appointment modals

**Uses these hooks:**
- `useUserContext` — `@/hooks/useUserContext` — provides `organizationId`
- `useQuery` — TanStack Query — fetches appointments
- `useMemo` — maps API shape to calendar shape

**Navigation: who navigates here:**
- `apps/web/src/components/appointments-widget.tsx:41` — "View all" link in dashboard appointments widget
- `apps/web/src/routes/_authenticated/customers.tsx` — "Schedule" button per customer navigates to `/dashboard/appointment/view` (note: uses dashboard-prefixed route, which is a separate route at `/_authenticated/dashboard/_layout/appointment/view`)

**Navigation: where it goes:** No outbound navigation from this component.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `appointments` | SELECT | `branch_id`, `start_time`, `end_time`, `status`, `user_id`, `trainer_id`, `service_id` |

**Key types:**
```typescript
// appointments.list input
{
  organizationId: string; // UUID
  startFrom?: string;     // ISO datetime
  startTo?: string;       // ISO datetime
  limit?: number;         // max 500; default 200 used here
}

// CalendarAppointment (after mapping)
{
  id: string;
  title: string;         // appointment description or "Appointment"
  start: Date;
  end: Date;
  status: "confirmed" | "pending" | "cancelled";
  clientName: string;    // partial userId (8 chars) — no name lookup
  service: string;       // partial serviceId (8 chars) — no name lookup
  assignedTo?: { id: string; name: string };
}
```

---

## 5. Tests

**Test files:** None found for this route.
**Scenarios covered:** N/A
**Not tested (risk areas):**
- `mapApiAppointmentToCalendar` mapping — `clientName` and `service` use truncated IDs not resolved names (no lookup).
- Permission redirect in `beforeLoad` — `requirePermission` is a real guard that reads from query cache.
- Empty appointments state in the calendar UI.
- Appointments spanning month boundaries.

---

## 6. Notes

- This route (`/_authenticated/appointment/view`) is distinct from the dashboard-nested route (`/_authenticated/dashboard/_layout/appointment/view`). Both exist; the sidebar links to the dashboard-nested version.
- `clientName` and `service` in the calendar display truncated UUIDs, not resolved names, because the list endpoint does not join member/service tables. This is a known limitation.
- `getAppointmentQueryRange()` fetches a ~3-month window to support smooth prev/next month navigation without additional fetches.
- `beforeLoad` calls `requirePermission` which fetches the user context and checks `appointment_management:read` permission. Unauthorized users are redirected to `/dashboard?unauthorized=true`.
