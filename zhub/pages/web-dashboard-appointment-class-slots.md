# Class Slots Management

**Route:** `/dashboard/appointment/class-slots/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/class-slots/view.tsx`
**Platform:** web
**Auth required:** rbac(class_slot_management:read)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Schedule and manage group class slots with capacity, instructors, locations, and cancellation handling. Track signups and availability in real-time.

**Produces:**
- Data table of class slots with date, service, time, instructor, location, capacity/booked/available, status, and actions
- Create sheet: service, branch, date, start/end time, capacity, instructor, location
- Edit sheet: start/end time, capacity, instructor, location (date/service immutable)
- Signups sheet: list of signups per slot with attendance status (pending|attended|no-show)
- Cancel dialog: confirmation with optional cancellation reason

**On success:** Slots are created, updated, or cancelled with success toast. Signups display name, email, phone, member/walk-in type, and appointment status.

**On failure / error states:** Permission denied, no org selected, error message, loading spinner, error toasts on mutation failure.

---

## 2. How It Works

**Execution flow:**
1. Route guards check class_slot_management:read permission
2. Page queries class slots, services, and members (instructors) in parallel
3. Filters applied client-side: serviceId, dateRange (from/to), availableOnly
4. Apply button triggers query invalidation; Clear resets all filters
5. Create flow: opens sheet → validates required fields → POST via mutation
6. Edit flow: opens sheet with current slot data → PATCH via mutation
7. Cancel flow: confirmation dialog → POST cancel with reason → invalidate

**Inputs:**
- Filters: filterServiceId, filterFrom, filterTo, filterAvailableOnly
- Create form: serviceId, branchId, date (YYYY-MM-DD), startTime, endTime, capacity (number), instructorId, location
- Edit form: startTime, endTime, capacity, instructorId, location (subset of create)
- Cancel reason: free-text textarea (optional)

**State management:**
- TanStack Query: `["classSlots", orgId, serviceId, from, to, isAvailable]`, `["services", orgId]`, `["members", orgId]`, `["classSlotSignups", slotId]`
- Local state: filterServiceId, filterFrom, filterTo, filterAvailableOnly, createSheetOpen, editSheetOpen, editingSlot, cancelDialogOpen, cancellingSlot, createForm, editForm, signupsSheetOpen, viewingSignupsSlot, cancellationReason

**Outputs:**
- Data table with columns: date, service, time, instructor, location, capacity, booked (clickable), available, status (available|full|cancelled)
- Sheets and dialogs for CRUD operations
- Toast notifications on success/error
- Signups list with member details and attendance status

**Side effects:**
- onSuccess: invalidates classSlots, services, members, and signups queries; closes sheet; resets form; shows toast
- Cancel reason submitted with slot ID for audit trail
- Signup clicks open signups sheet and trigger separate query

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.classSlots.list()` — fetch slots with optional filters (serviceId, from, to, isAvailable)
- `client.services.list()` — fetch available services for create form
- `client.members.list()` — fetch members as instructor candidates
- `client.classSlots.create()` — POST new slot with date as ISO string
- `client.classSlots.update()` — PATCH slot (subset of create fields)
- `client.classSlots.cancel()` — POST cancel with optional reason
- `client.classSlots.getSignups()` — fetch signups for a specific slot

**Uses these components:**
- `DataTable` @ `/components/tables/sales/view/data-table` — class slot list
- `EmptyState` — no slots message
- `BranchSelector` @ `/components/branch/branch-selector` — branch picker in create sheet
- Button, Badge, Input, Label, Checkbox, Select, Sheet, Dialog, Separator, Textarea

**Uses these hooks:**
- `useUserContext()` — fetch org ID
- `useQuery()` — fetch slots, services, members, signups
- `useMutation()` — create/update/cancel mutations
- `useQueryClient()` — invalidate queries

**Navigation: who navigates here:**
- Appointment menu → class-slots link

**Navigation: where it goes:**
- None explicit

---

## 4. Data Shapes

**DB tables touched:**
- class_slots — create, read, update (cancel via isCancelled flag)
- class_slot_signups — read
- services — read
- members — read (for instructors)
- branches — read (via BranchSelector)

**Key types / Zod schemas:**
- `ClassSlotRow` — {id, serviceId, branchId, date, startTime, endTime, capacity, instructorId?, location?, isCancelled, spotsBooked, spotsAvailable, createdAt}
- `CreateFormState` — {serviceId, branchId, date, startTime, endTime, capacity, instructorId, location}
- `EditFormState` — {startTime, endTime, capacity, instructorId, location}
- `Signup` — {appointmentId, name, email?, phone?, clientType, appointmentStatus, attended?}
- `CanonicalStatus` — "active" | "inactive" | "cancelled" | "pending" | "completed" | "no-show"

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Date format conversion edge cases (Z suffix handling, DST, timezones)
- Validation: startTime >= endTime, capacity > current bookings
- Concurrent slot updates (no optimistic UI)
- Signup attendance state transitions (pending → attended/no-show)
- Capacity reduction after bookings (backend constraint?)
- Instructor reassignment after slot creation
- BranchSelector availability constraints

---

## 6. Notes

- **Date string format** — dates sent as `YYYY-MM-DDTHH:MM:SS.000Z` for create (line 216), `YYYY-MM-DDTHH:MM:SS` for filter (line 129)
- **Instructor/Location optional** — can be empty strings; display as "—" if null
- **Capacity immutable after creation** — not shown in edit sheet (only create)
- **Cancel reason is optional** — shows cancellation dialog even if reason empty
- **Signup attendance states** — mapped from attended: true|false|null to completed|no-show|pending badges
- **BranchSelector required in create** — no fallback to user's branch
- **Query staleTime: 60s** for appointments (not slots); slots likely stale immediately
- **Signup list pagination** — not implemented; all signups loaded at once

