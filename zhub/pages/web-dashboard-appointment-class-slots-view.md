# Appointment — Class Slots View

**Route:** `/dashboard/appointment/class-slots/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/class-slots/view.tsx:1`
**Platform:** web
**Auth required:** rbac(appointment_management:read)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Schedule, view, edit, and cancel group class slots linked to services. Supports filtering by service, date range, and availability.

**Produces:** A filter bar, a `DataTable` of class slots with date, service name, time range, instructor, location, capacity, booked/available counts, status badge, and row-level Edit/Cancel actions. Two slide-out Sheets (Create, Edit) and a Cancel confirmation Dialog.

**On success:**
- Create → toast "Class slot created successfully."; Sheet closes; table refreshes.
- Update → toast "Class slot updated successfully."; Sheet closes; table refreshes.
- Cancel → toast "Class slot cancelled."; Dialog closes; table refreshes.

**On failure / error states:**
- No `organizationId` → "No organization selected." heading with message.
- API error → destructive error message.
- Loading → centered spinner.
- Mutation error → destructive toast with error message.

---

## 2. How It Works

**Execution flow:**
```
ClassSlotsPage
  → useUserContext() → organizationId
  → useQuery(client.classSlots.list, { serviceId?, from?, to?, isAvailable? }) → classSlots[]
  → useQuery(client.services.list) → services[] (for filter + create form)
  → useQuery(client.members.list) → membersData[] (for instructor picker)
  → DataTable (sales/view/data-table) with inline columns

  Create Sheet → createMutation: client.classSlots.create()
  Edit Sheet → updateMutation: client.classSlots.update()
  Cancel Dialog → cancelMutation: client.classSlots.cancel()

  "Apply" button → queryClient.invalidateQueries(["classSlots", ...])
```

**Inputs:**
- Service filter (Select from `services.list`)
- Date From / Date To (date inputs)
- Available Only (checkbox)
- Filters are applied when "Apply" is clicked (manual invalidation)

**State management:**
- Filter state: `filterServiceId`, `filterFrom`, `filterTo`, `filterAvailableOnly` — local.
- Sheet state: `createSheetOpen`, `editSheetOpen`, `editingSlot`, `createForm`, `editForm`.
- Dialog state: `cancelDialogOpen`, `cancellingSlot`, `cancellationReason`.
- TanStack Query (`queryKey: ["classSlots", organizationId]`).

**Side effects:** All mutations invalidate `["classSlots", organizationId]`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `classSlots.list` — list class slots (filters: serviceId, branchId, from, to, isAvailable, accessibleNodeIds)
- `classSlots.create` — create a new class slot
- `classSlots.update` — update startTime, endTime, capacity, instructorId, location
- `classSlots.cancel` — cancel a slot (soft: sets `isCancelled = true`)
- `services.list` — populate service filter + create form dropdown
- `members.list` — populate instructor picker in create/edit forms

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table wrapper (columns defined inline)

**Uses these hooks:**
- `useUserContext` — resolves `organizationId`
- `useQuery`, `useMutation`, `useQueryClient` — data fetching and mutations

**Navigation: who navigates here:**
- App sidebar: "Class Slots" under the Appointment section

**Navigation: where it goes:** Stays on page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `class_slots` (tenant) | SELECT | `id`, `serviceId`, `branchId`, `date`, `startTime`, `endTime`, `capacity`, `instructorId`, `location`, `isCancelled`, `spotsBooked`, `spotsAvailable`, `createdAt` |
| `class_slots` (tenant) | INSERT | `serviceId`, `branchId`, `date`, `startTime`, `endTime`, `capacity`, `instructorId?`, `location?` |
| `class_slots` (tenant) | UPDATE | `startTime?`, `endTime?`, `capacity?`, `instructorId?`, `location?`, `isCancelled` |
| `services` (tenant) | SELECT | `id`, `name` |
| `members` (tenant) | SELECT | `id`, `name` |

**Form fields (Create):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| Service | Select | Required | `serviceId` (uuid) |
| Branch ID | Text input (UUID) | Required | `branchId` |
| Date | Date input | Required | `date` (ISO datetime) |
| Start Time | Time input | Required | `startTime` |
| End Time | Time input | Required | `endTime` |
| Capacity | Number (min 1) | Required | `capacity` (integer) |
| Instructor | Select from members | Optional | `instructorId` |
| Location | Text input | Optional | `location` |

**Form fields (Edit — partial update):**
| Field | Type | Maps to |
|-------|------|---------|
| Start Time | Time input | `startTime` |
| End Time | Time input | `endTime` |
| Capacity | Number | `capacity` |
| Instructor | Select | `instructorId` |
| Location | Text | `location` |

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Filter application (manual "Apply" trigger vs live filter)
- Cancel with optional reason field
- Service/member name lookup when ID not found in fetched lists
- Cancelled slot disabling Edit/Cancel buttons

---

## 6. Notes

- Filters are NOT applied reactively — the user must click "Apply" to trigger `queryClient.invalidateQueries`. This means changing filter values without clicking Apply has no effect.
- `branchId` in the create form is a raw UUID text input — there is no branch picker; users must know the branch UUID.
- Service and member names are resolved client-side by looking up IDs in fetched lists; if a service or member is not in the org's accessible scope, the raw UUID is shown.
- The `date` field is sent as `${form.date}T00:00:00.000Z` (midnight UTC); the `from`/`to` filters similarly use `T00:00:00.000Z` and `T23:59:59.999Z`.
- `requirePermission` in `beforeLoad` uses the `"appointment_management:read"` string form (not object form) — this is passed to the stub `requirePermission` in `route-guards.ts` which currently does nothing.
- Cancelled slots cannot be edited or further cancelled (action buttons are disabled when `isCancelled === true`).
