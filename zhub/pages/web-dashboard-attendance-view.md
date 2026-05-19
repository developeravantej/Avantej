# Attendance / Check-ins
**Route:** `/dashboard/attendance/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/attendance/view.tsx`
**Platform:** web
**Auth required:** authenticated + `attendance_management:read` (checked in-component via `hasPermission`)
**Last updated:** 2026-05-12

---

## Recent refactor (2026-05-12 — web debt cleanup)

The page was rebuilt onto the shared UI primitives — `<PageCard>`, `<EmptyState>`, `<LoadingSpinner>`, `<StatusCallout>` — and gained a 4-card KPI strip computed client-side from the check-in rows. Layout is now a single fixed-height card with a sticky filter band and a scrollable body. Toast/duplicate-warning + credit-consumption behaviour is unchanged.

---

## 1. What It Does

**Purpose:** Front-desk console — check in members/walk-ins for today's bookings, record drop-ins, and review/delete today's check-in log.

**Produces:**
- Sticky header + filter band (branch select, date input)
- **KPI strip** (Total check-ins / Attended / Drop-ins / No-shows) computed from `checkInRows`
- **Today's Bookings** — `<TodayBookingsSection>` grouped by time-bucket, with Check-in / No-show buttons per booking
- **Drop-in Check-in** — `<DropInForm>` (member combobox or walk-in display-name input)
- **Today's Check-ins** log — `<CheckInsLog>` (delete reverts attendance) wrapped in `<PageCard padding="none">`

**On success:** Toast on check-in. Duplicate-guard returns "Already checked in N minutes ago" for drop-ins within 30 min (members only).

**On failure / error states:** `<StatusCallout variant="error" onRetry={...}>` for failed queries; `<EmptyState>` when no check-ins for the day; permission-denied + no-org guards render header-only placeholders.

---

## 2. How It Works

**Execution flow:**
```
Mount:
  useUserContext → organizationId, hasPermission
  canRead     = hasPermission("attendance_management:read")
  canDelete   = hasPermission("attendance_management:delete")
  branchOptions ← hierarchy nodes where type==="branch" ∩ accessibleNodeIds
                   (fallback: all accessible nodes)
  Defaults: branchId = branchOptions[0], date = toLocalDateString(new Date())

Two queries fire when (orgId && branchId && canRead):
  ["attendance","bookings",orgId,branchId,date]
    → client.checkIns.listTodaysBookings({ organizationId, branchId, date })
  ["attendance","checkIns",orgId,branchId,date]
    → client.checkIns.list({ organizationId, branchId, from:`${date}T00:00:00`, to:`${date}T23:59:59` })

KPI derivation (client-side over checkInRows):
  kpiTotal     = rows.length
  kpiAttended  = rows.filter(r => r.outcome === "attended").length
  kpiDropIns   = rows.filter(r => r.source === "drop_in").length
  kpiNoShows   = rows.filter(r => r.outcome === "no_show").length

Drop-in check-in:
  client.checkIns.recordCheckIn({ clientType, clientId?, clientDisplayName?, branchId, source: "drop_in", ... })
    → walk-ins: server-synthesised crypto.randomUUID() per check-in
    → consumes package credits if packageInstanceId + creditsConsumed > 0
    → writeAudit("checkin.create")
  Query invalidated via the queryKey passed to <DropInForm>.

Delete check-in:
  client.checkIns.deleteCheckIn({ id })
    → reverts appointment_clients.attended + package credit
    → writeAudit("checkin.delete")
```

**State:**
- TanStack Query keys above; `enabled: !!orgId && !!branchId && canRead`
- Local state: `branchId`, `date` (YYYY-MM-DD string)

**Side effects:**
- Query refetch on branch/date change.
- `<DropInForm>` triggers invalidation via passed `queryKey`.
- `<CheckInsLog>` handles its own delete-and-invalidate.

---

## 3. What Depends On It

**API endpoints:**
- `client.checkIns.listTodaysBookings` — bookings + check-in annotations for branch+date
- `client.checkIns.list` — paginated check-ins; `{ rows, total }`
- `client.checkIns.recordCheckIn` — write (invoked inside `<DropInForm>`)
- `client.checkIns.deleteCheckIn` — write (invoked inside `<CheckInsLog>`)
- `client.checkIns.getActivePackageForMember` — invoked inside `<DropInForm>` when a valid member UUID is typed

**Components (route-level):**
- `<TodayBookingsSection>` — `@/components/attendance/today-bookings`
- `<DropInForm>` — `@/components/attendance/drop-in-form`
- `<CheckInsLog>` — `@/components/attendance/check-ins-log`
- `<KpiCard>` (private to this file)
- `<PageCard>`, `<EmptyState>`, `<LoadingSpinner>`, `<StatusCallout>`, `<Select>`, `<Separator>`, `<Label>`

**Hooks:**
- `useUserContext`, `useQuery`, `useState`
- `useApiMutation` (used inside child components for record/delete)

**Navigation in:** Sidebar → OPERATIONS → Attendance.
**Navigation out:** None.

---

## 4. Data Shapes

**DB tables touched:**
- `check_ins` — read/insert/delete
- `appointment_clients` — read (via `listTodaysBookings`); updated on check-in/delete
- `appointments` — read
- `package_instances` — credit consumption / reversal
- `audit_log` — `checkin.create`, `checkin.delete`

**Key types (exported from components):**
```typescript
// from today-bookings.tsx
type TodaysBookingRow = {
  appointmentClientId: string;
  appointmentId: string;
  startTime: Date | string;
  endTime: Date | string;
  serviceName: string;
  classSlotId: string | null;
  clientType: "member" | "walk_in";
  clientId: string;
  clientName: string;
  attendanceStatus: "pending" | "checked_in" | "no_show";
  checkInId: string | null;
  capacity: number | null;
  creditsRemaining: number | null;
  activePackageInstanceId: string | null;
};

// from check-ins-log.tsx
type CheckInRow = {
  id: string;
  clientType: "member" | "walk_in";
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string | null;
  source: "booking" | "drop_in";
  outcome: "attended" | "no_show" | "late_cancel";
  checkedInBy: string;
  checkedInByName: string | null;
  checkedInAt: Date | string;
  notes: string | null;
};
```

**Client name resolution (check-in row):**
1. `user.name` (control-panel) for members → 2. `user.email` → 3. `clientDisplayName` for walk-ins → 4. legacy `walk_in_customers.name` → 5. `"Walk-in"` final fallback.

---

## 5. Tests

None. Chrome-verified in P7 chrome-run (Bryan Voo drop-in → toast → audit row `checkin.create`).

**Gaps:**
- KPI counts are client-side (no fallback when API paginates beyond visible window).
- Date range uses naive `T00:00:00` / `T23:59:59` — see notes.
- No tests for permission gating paths.

---

## 6. Notes

- **Date filter validator gotcha (fixed in P7):** `z.string().datetime()` rejected the frontend's naive `"YYYY-MM-DDTHH:mm:ss"` format. Relaxed to a regex accepting both naive and strict-ISO (with/without Z/offset). See `packages/api/src/routers/check-ins.ts:161-166`.
- **30-min anti-duplicate window** applies ONLY to drop-ins without `appointmentClientId`. Walk-ins each get a unique server-synthesized UUID, so the guard is effectively a no-op for them.
- **KPI strip is derived, not queried** — counts come from `checkInRows` for the current date filter; if `listCheckIns` ever paginates server-side, KPIs will under-count until rendered rows match `total`.
- **Manual date format** (`toLocalDateString`) avoids a `date-fns` dependency.
- **Layout:** single fixed-height card (`h-[calc(100vh-48px)]`) with sticky header, filter band, and scrollable body. Two-column body via `lg:grid-cols-[1fr_360px]`.
- **`<PageCard>`** wraps the `<CheckInsLog>` table; padding="none" to let the DataTable own padding.
- **Branch/date guard:** if no `branchId` selected, body shows a dashed-border hint instead of empty queries.
- Shipped originally in tracking-pages plan phase 7 (2026-04-18); UI primitive migration + KPI strip landed 2026-05-12.
