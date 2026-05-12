# Attendance / Check-ins

**Route:** `/dashboard/attendance/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/attendance/view.tsx:1`
**Platform:** web
**Auth required:** authenticated + `attendance_management:read`
**Last updated:** 2026-04-21

---

## 1. What It Does

**Purpose:** Front-desk checks in members and walk-ins; view today's bookings + drop-in check-in + today's log.

**Produces:** Two-column layout.
- **Left:** "Today's Bookings" — grouped by class slot / 1:1 appointment with Check-in / No-show buttons per booking.
- **Right:** "Drop-in Check-in" form — Combobox: existing member | walk-in. Walk-in mode shows an optional "Display Name" text field (no UUID picker). Submit → no-appointment check_in row.
- **Bottom:** "Today's Check-ins" log (filterable by branch). Delete button reverts attendance.

**On success:** Toast on check-in; duplicate-guard shows "Already checked in N minutes ago" if drop-in within 30 min window.

---

## 2. How It Works

**Execution flow:**
```
Today's bookings:
  → client.checkIns.listTodaysBookings({ organizationId, branchId, date })
    → listTodaysBookings()          # rbac: attendance_management:read + branch scope
      → appointment_clients + appointments + check_ins annotations

Drop-in check-in:
  → client.checkIns.recordCheckIn({ clientType, clientId?, clientDisplayName?, branchId, source: 'drop_in', ... })
    → recordCheckIn()               # rbac: attendance_management:create + branch scope
      → walk-in: clientId omitted; server synthesizes crypto.randomUUID() per check-in
      → clientDisplayName (optional, max 120 chars) persisted if provided (trimmed, null if blank)
      → Anti-duplicate 30-min window effectively a no-op for walk-ins (each gets a unique UUID)
      → INSERT check_ins
      → UPDATE appointment_clients.attended (if bookingId)
      → Consume package credits (if packageInstanceId + creditsConsumed > 0)
      → writeAudit('checkin.create')

Today's log:
  → client.checkIns.list({ organizationId, branchId?, from, to })
    → listCheckIns() with cross-DB actor + client name enrichment

Delete:
  → client.checkIns.deleteCheckIn({ id })
    → deleteCheckIn() reverts appointment_clients.attended + package credit; writeAudit('checkin.delete')
```

---

## 3. What Depends On It

**API endpoints:** `checkIns.recordCheckIn`, `checkIns.listTodaysBookings`, `checkIns.list`, `checkIns.deleteCheckIn`.

**Components:**
- `TodayBookings`, `DropInForm`, `CheckInsLog` — `apps/web/src/components/attendance/`

**Navigation: incoming:** Sidebar under OPERATIONS > Attendance.

---

## 4. Data Shapes

**Key table:** `check_ins` (migration 0022; `clientDisplayName` added in migration 0028)
- `clientType`: `"member"` | `"walk_in"` (polymorphic)
- `clientId`: text — for members: `member.userId`; for walk-ins: server-synthesized `crypto.randomUUID()` (NOT a `walk_in_customers.id`)
- `clientDisplayName`: text (nullable) — optional display name stored for walk-in check-ins
- `source`: `"booking"` | `"drop_in"`
- `outcome`: `"attended"` | `"no_show"` | `"late_cancel"`
- `appointmentClientId` (nullable, if from booking)
- `packageInstanceId` (nullable, if credits consumed)
- `creditsConsumed` (default 0)
- `branchId` for RBAC
- `checkedInBy` (members.userId) + `checkedInAt`

**Client name resolution chain:**
1. `user.name` (control panel) via cross-DB — for members
2. `user.email` if no name — for members
3. `clientDisplayName` stored on the check-in row — for walk-ins (preferred)
4. Legacy `walk_in_customers.name` lookup — for walk-ins (fallback if no `clientDisplayName`)
5. `"Walk-in"` final fallback (not `"Unknown client"`)

---

## 5. Tests

None yet. Chrome-verified in P7 chrome-run (Bryan Voo drop-in → toast → audit row `checkin.create`).

---

## 6. Notes

- **Date filter validator gotcha (fixed in P7):** `z.string().datetime()` rejected frontend's naive `"YYYY-MM-DDTHH:mm:ss"` format. Relaxed to regex accepting both naive and strict-ISO (with/without Z/offset). See `packages/api/src/routers/check-ins.ts:161-166`.
- Anti-duplicate window (30 min) applies ONLY to drop-ins without `appointmentClientId` — booking-linked check-ins can re-fire intentionally.
- Shipped in tracking-pages plan phase 7 (2026-04-18).
