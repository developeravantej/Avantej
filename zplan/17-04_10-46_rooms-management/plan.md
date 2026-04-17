# Rooms Management — Implementation Plan

## 1. Overview

### Problem Statement
Admin users cannot create appointments in a fresh tenant environment. The appointment form has a required "Area" field (backed by the `rooms` table) that loads via `client.rooms.list()`. When the table is empty, the dropdown has no options and the **Create Appointment** button stays disabled. No UI exists to create rooms — the only workaround is a direct API call.

### Goals
- Give admins a UI to create, view, edit, and deactivate rooms
- Make the appointment form recoverable when no rooms exist (inline create)
- Clarify the Employee dropdown's empty state so users understand why it's blank
- Remove the "works only with hand-rolled API calls" dependency for new tenants
- Use permission-gated sidebar so only authorized roles see the Rooms link

### Success Criteria
- A new tenant with zero rooms can reach `/dashboard/appointment/view`, click "Create a room", create a room, and book an appointment — without leaving the appointment context except for one redirect
- Admin + franchise owner can CRUD rooms from a dedicated page
- Sidebar hides the Rooms link for users without `appointment_management:read`
- Seed script creates one default room per branch for test tenants

### Scope
**In:**
- New dashboard route `/dashboard/rooms/view` with list + create/edit sheet + deactivate
- Sidebar nav entry under the Business → Appointments group
- Empty-state improvements in the existing appointment form (`add-appointment-modal.tsx`)
- Employee dropdown messaging fix (distinguish "no area selected" vs "area has no staff")
- Seed script amendment to create default rooms per branch
- **No terminology changes** — keep "Area" label in the appointment form (see Open Questions)

**Out:**
- Room-to-trainer assignment UI (separate feature; Employee dropdown currently filters by branch scope, not by room)
- Room booking calendar / availability view
- Native app rooms management
- Renaming the `rooms` DB table

---

## 2. Result (What Changes for the User)

**Before:** Admin clicks "Add Appointment" in a fresh tenant → Area dropdown is empty → Create button is greyed out forever. The only fix is a direct API call from devtools.

**After:** Admin has a **Rooms** page in the sidebar to manage rooms. If the Area dropdown is empty when creating an appointment, an inline message appears: "No rooms yet. Create a room →" linking to the Rooms page. Empty Employee dropdown message changes based on context so users aren't confused.

**Key differences:**
- New **Business → Appointments → Rooms** sidebar link (admin-only via `appointment_management:read`)
- New page at `/dashboard/rooms/view` with:
  - Status tabs (Active / All / Inactive)
  - Branch filter dropdown
  - Columns: Name, Type (badge), Branch, Capacity, Status, Actions
  - Create/Edit sheet: Name, Type (5-option select), Capacity, Branch (combobox), Active toggle
  - Deactivate action (no hard delete)
- Inline empty-state in the appointment form's Area dropdown: "No rooms available. Create one →" opens the Rooms page in a new tab (or navigates directly with a return URL)
- Employee dropdown placeholder changes:
  - Before any Area selected: "Select an area first"
  - After Area selected but no staff: "No employees available for this area"
- Seeded test orgs automatically get one "Main Room" per branch

**Role impact:**
- **Admin / Franchise Owner:** sees Rooms sidebar link + full CRUD
- **Staff / Trainer / Client:** do not see Rooms link (permission-gated) — they can still select rooms when creating an appointment if they have `appointment_management:read`

---

## 3. Technical Architecture

### Data Model (No Changes)
Existing schema at `packages/db/src/schema/tenant/rooms.ts` is sufficient:

```typescript
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),   // enum: consultation | group_session | private | training | individual
  capacity: integer("capacity").notNull(),
  branchId: uuid("branch_id").notNull().references(() => hierarchyNodes.id, { onDelete: "restrict" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### API Contracts (No Changes)
Existing procedures at `packages/api/src/routers/rooms.ts` + service at `packages/services/src/rooms.service.ts`:

- `rooms.list({ organizationId, branchId?, isActive? })` → `Room[]` — defaults to `isActive=true` when not specified
- `rooms.getById({ organizationId, id })` → `Room`
- `rooms.create({ organizationId, name, type, capacity, branchId, isActive? })` → `Room`
- `rooms.update({ organizationId, id, name?, type?, capacity?, branchId?, isActive? })` → `Room`
- `rooms.delete({ organizationId, id })` → `Room` — **NOT a hard delete**, sets `isActive: false` (same effect as `update({ isActive: false })`)

**Permissions enforced by existing API (verified in source):**
- list/getById → `appointments:read`
- create → `appointments:create`
- update/delete → `appointments:update`

**IMPORTANT discrepancy:** Neighboring pages in the sidebar (Appointments, Class Slots) use the permission string `appointment_management:read`, backed by the `appointments.list` router which enforces `appointment_management` (verified in `packages/api/src/routers/appointments.ts`). But the `rooms` router enforces the separate resource `appointments`. Both `appointment_management` and `appointments` are declared in the `Resource` union at `packages/services/src/permission.service.ts` (lines 33–34).

**Decision:** The sidebar item will use `permission: "appointment_management:read"` to match the pattern of adjacent items (Appointments, Class Slots). Admin roles have priority >= 100 and receive ALL permissions, so this works. Non-admin custom roles that are granted `appointment_management:*` but not `appointments:*` would see the sidebar link and fail at the API — this is a pre-existing inconsistency, not introduced by this plan. Document in Open Questions and recommend a follow-up cleanup (collapse the two resources).

**No new permission resource** — avoids a migration to `permissions` / `role_permissions` tables.

### Frontend Pattern
Model after `suppliers/view.tsx` and `promotions/view.tsx`:
- `createFileRoute` with no `beforeLoad` guard (relies on sidebar visibility + API-level checks)
- `useQuery` with `orpc.rooms.list.queryOptions(...)` pattern
- `useMutation` for create/update/deactivate with toast feedback
- Sheet-based create/edit form (not dialog) — matches project convention for multi-field forms
- `DataTable` from `@/components/tables/sales/view/data-table` (generic table pattern used by other pages)

### Key Technical Decisions
1. **No new permission resource.** Reuse `appointment_management:*` since the backend already gates on `appointments:*`. Reduces migration surface and matches the mental model (rooms exist to serve appointments).
2. **Sheet-based create/edit, not dialog.** 5-field form is too tall for a dialog — matches `promotions/view.tsx` and `suppliers/view.tsx` pattern.
3. **Deactivate instead of hard delete.** The schema uses `onDelete: "restrict"` for `branchId`, and appointments reference rooms indirectly. Soft-deactivation is safer.
4. **Inline empty-state link, not modal-in-modal.** Clicking "Create a room →" in the appointment form closes the appointment modal and navigates to `/dashboard/rooms/view?returnTo=/dashboard/appointment/view`. Rooms page shows a banner "Creating a room to complete an appointment? [Back to appointment →]". Reason: avoiding modal-over-modal keeps focus management simple.
5. **Seed script, not migration.** A migration that inserts data is tricky for multi-tenant (needs to run against each tenant DB). Better: amend `seed-business-data.ts` which developers run explicitly for new test envs.

---

## 4. User Journeys

### Journey A: Admin creates first room in a new tenant (primary flow)

```
Trigger: Admin lands on /dashboard/appointment/view, clicks "Add Appointment"
Steps:
  1. User sees "Add New Appointment" dialog → Area dropdown is empty
  2. User opens Area dropdown → dialog shows empty list WITH an inline "No rooms available. Create one →" link
  3. User clicks the link → appointment dialog closes, navigates to /dashboard/rooms/view?returnTo=/dashboard/appointment/view
  4. User sees Rooms page with a yellow banner: "Creating a room to complete an appointment? [Back to appointment →]"
  5. User clicks "Create Room" → sheet opens from right
  6. User fills: Name="Studio A", Type="training", Capacity=10, Branch="Tenant Test Fitness Franchise Branch" (combobox)
  7. User clicks "Create" → toast "Room created successfully", sheet closes, row appears in table
  8. User clicks "Back to appointment" in the banner → returns to /dashboard/appointment/view
  9. User clicks "Add Appointment" → Area dropdown now shows "Studio A" → can complete the flow
Where it lives: New page at /dashboard/rooms/view. Appointment modal unchanged except empty-state message.
```

### Journey B: Admin manages existing rooms

```
Trigger: Admin clicks sidebar "Business → Appointments → Rooms"
Steps:
  1. User lands on /dashboard/rooms/view → sees page header "Rooms" + "Create Room" button
  2. User sees status tabs (Active default / All / Inactive), optional Branch filter dropdown, search input
  3. User sees DataTable: Name | Type badge | Branch | Capacity | Status | Actions
  4. User clicks Edit on a row → sheet opens prefilled → user changes capacity 10 → 15 → Save → toast + table updates
  5. User clicks Deactivate on a row → confirmation dialog "Deactivate Studio A?" → confirms → toast + row moves to Inactive tab
Where it lives: New page, sheet for forms, confirmation Dialog for deactivate.
```

### Journey C: Admin understands why Employee dropdown is empty

```
Trigger: User is filling "Add New Appointment" dialog
Steps (before fix):
  1. User selects customer + service → Employee dropdown says "There are no employees available" even before Area is chosen → user is confused
Steps (after fix):
  1. User selects customer + service → Employee placeholder says "Select an area first" (greyed / disabled-looking)
  2. User selects Area="Studio A" → Employee dropdown refreshes → if staff found: list renders; if none: placeholder says "No employees available for this area"
Where it lives: Existing add-appointment-modal.tsx line 2279 SelectValue placeholder + conditional logic.
```

### Journey D: DevOps seeds a fresh test tenant

```
Trigger: Developer runs `bun run apps/server/scripts/seed-business-data.ts <orgId>`
Steps:
  1. Script reads all branches in the tenant DB
  2. For each branch without any rooms, inserts one "Main Room" (type=training, capacity=20)
  3. Script logs "Created N default rooms"
Where it lives: Existing seed-business-data.ts script — amend, don't create new script.
```

---

## 5. Phased Implementation

---

### Phase 1: Rooms Management Page (foundation)
**Goal:** Admin can CRUD rooms at `/dashboard/rooms/view`.
**Delivers:** Journey B end-to-end.
**Dependencies:** None — existing API is complete.

#### Task 1.1: Create rooms DataTable columns
**File:** `apps/web/src/components/tables/rooms/view/columns.tsx` (NEW)

Pattern: model after `apps/web/src/components/tables/suppliers/view/columns.tsx`.

Columns:
- `name` — text, sortable
- `type` — badge (map enum to human labels: "Consultation" / "Group Session" / "Private" / "Training" / "Individual")
- `branchName` — text, from joined hierarchy node
- `capacity` — number, right-aligned
- `isActive` — Status badge (Active / Inactive)
- `actions` — dropdown menu: Edit, Deactivate (hidden when already inactive)

Export type:
```typescript
export type RoomRow = {
  id: string;
  name: string;
  type: "consultation" | "group_session" | "private" | "training" | "individual";
  branchId: string;
  branchName: string;
  capacity: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};
```

The row type includes `branchName` because users expect to see the branch in the table. The `rooms.list` API does not currently return branch name — see Task 1.2.

#### Task 1.2: Verify `rooms.list` returns branch name (or join client-side)
**Files to check:**
- `packages/api/src/routers/rooms.ts`
- `packages/services/src/rooms.service.ts` (verify it exists; grep showed it's imported)

**Investigation:** Open `listRooms` in the service layer. Does it join `hierarchyNodes` to return the branch name? If not:

**Option A (preferred):** Update the service to join and return `{ ...room, branchName }`.
**Option B (quick):** Client-side lookup — fetch hierarchy nodes separately and map `branchId → name` in the component.

Decision: **Option B** to keep this phase frontend-only. The rooms page will:
```typescript
const { data: nodesData } = useQuery({
  queryKey: ["hierarchyNodes", organizationId],
  queryFn: () => client.hierarchy.listNodes({ organizationId }),
  enabled: !!organizationId,
});
const branches = (nodesData?.nodes ?? []).filter((n) => n.type === "branch");
const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
```

Then `rooms.map(r => ({ ...r, branchName: branchById.get(r.branchId) ?? r.branchId }))`.

#### Task 1.3: Create rooms page route
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/rooms/view.tsx` (NEW)

Pattern: model after `apps/web/src/routes/_authenticated/dashboard/_layout/suppliers/view.tsx`. Key additions:
- Status filter tabs (Active / All / Inactive) using `isActive` query param
- Branch combobox filter (optional — can be added in Phase 1.5 if it blows up task size)
- Search by name (client-side filter)
- "Create Room" button opens create sheet
- `validateSearch` captures `returnTo` query param for Journey A

```typescript
export const Route = createFileRoute("/_authenticated/dashboard/_layout/rooms/view")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: search.returnTo as string | undefined,
  }),
  component: RoomsViewPage,
});
```

If `returnTo` is set, render a yellow banner:
```tsx
{returnTo && (
  <Alert className="bg-yellow-50 border-yellow-300">
    <AlertDescription>
      Creating a room to complete an appointment?{" "}
      <Link to={returnTo} className="underline font-medium">Back to appointment →</Link>
    </AlertDescription>
  </Alert>
)}
```

Use `useUserContext` and `hasPermission("appointment_management:create")` to conditionally show the Create button. Use `useUserContext` and `hasPermission("appointment_management:update")` to show Edit/Deactivate actions.

#### Task 1.4: Create Room create/edit sheet component
**File:** `apps/web/src/components/forms/room-form-sheet.tsx` (NEW — or inline in view.tsx)

Matches the sheet pattern in `stock-requests/view.tsx` (already has branch combobox inline).

Fields:
- Name (required, text)
- Type (required, Select with 5 options)
- Capacity (required, number, min 1)
- Branch (required, searchable combobox of hierarchy nodes where type === "branch")
- Active toggle (only shown when editing, default true on create)

Validation (client-side, toast errors):
- Name trimmed non-empty
- Capacity >= 1
- Branch selected

Use:
```typescript
const TYPE_OPTIONS = [
  { value: "consultation", label: "Consultation" },
  { value: "group_session", label: "Group Session" },
  { value: "private", label: "Private" },
  { value: "training", label: "Training" },
  { value: "individual", label: "Individual" },
] as const;
```

#### Task 1.5: Wire mutations
In `rooms/view.tsx`:

```typescript
const createMutation = useMutation({
  mutationFn: (data: RoomFormData) =>
    client.rooms.create({ organizationId: organizationId!, ...data }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["rooms", organizationId] });
    toast.success("Room created successfully");
    closeSheet();
  },
  onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create room"),
});

const updateMutation = useMutation({
  mutationFn: ({ id, data }: { id: string; data: RoomFormData }) =>
    client.rooms.update({ organizationId: organizationId!, id, ...data }),
  onSuccess: () => { /* same */ },
});

const deactivateMutation = useMutation({
  mutationFn: (id: string) =>
    client.rooms.update({ organizationId: organizationId!, id, isActive: false }),
  onSuccess: () => { /* same */ toast.success("Room deactivated"); },
});

const reactivateMutation = useMutation({
  mutationFn: (id: string) =>
    client.rooms.update({ organizationId: organizationId!, id, isActive: true }),
  onSuccess: () => { /* same */ toast.success("Room reactivated"); },
});
```

The actions column conditionally renders "Deactivate" when the row is active and "Reactivate" when inactive (only visible in the Inactive / All tabs). This pairs with the soft-delete semantics and lets admins recover rooms disabled by mistake.

Note: the `rooms.delete` API is itself a soft-delete (sets `isActive: false`), verified in `rooms.service.ts` line 95–109. We use `rooms.update({ isActive: false })` for the "Deactivate" action to be explicit and for reactivation symmetry — clicking "Reactivate" on an inactive row calls `update({ isActive: true })`. Same API, clearer intent. **There is no true hard delete exposed anywhere.**

#### Acceptance Criteria (Phase 1)
- User can navigate to `/dashboard/rooms/view` directly by URL
- Create Room button opens sheet, submits, and new row appears in table
- Edit action prefills sheet and saves changes
- Deactivate action moves row to Inactive tab
- Status tabs filter correctly
- `bun check-types` passes
- `returnTo` query param shows banner

---

### Phase 2: Sidebar Integration
**Goal:** Admin discovers the Rooms page via sidebar.
**Delivers:** Completes Journey B discoverability.
**Dependencies:** Phase 1.

#### Task 2.1: Add Rooms entry to sidebar
**File:** `apps/web/src/components/app-sidebar.tsx` (MODIFY)

Under the existing "Appointments" collapsible group (line 128–138), add a new item:

```typescript
{
  title: "Appointments",
  url: "/dashboard/appointment/view",
  icon: Calendar,
  items: [
    { title: "Appointments", url: "/dashboard/appointment/view", icon: Calendar, permission: "appointment_management:read" },
    { title: "Class Slots", url: "/dashboard/appointment/class-slots/view", icon: Calendar, permission: "appointment_management:read" },
    { title: "Rooms", url: "/dashboard/rooms/view", icon: DoorOpen, permission: "appointment_management:read" }, // NEW
    { title: "Package Instances", url: "/dashboard/packages/instances/view", icon: Package, permission: "service_management:read" },
    { title: "Installments", url: "/dashboard/packages/installments/view", icon: CreditCard, permission: "service_management:read" },
  ],
},
```

Add `DoorOpen` to the lucide-react imports at the top of the file.

#### Acceptance Criteria (Phase 2)
- Admin sees "Rooms" link under Business → Appointments
- Staff/trainer without `appointment_management:read` doesn't see the link
- Clicking link navigates to the page

---

### Phase 3: Appointment Form Empty-State + Employee Messaging
**Goal:** When no rooms exist, user is nudged to create one. Employee placeholder explains why it's empty.
**Delivers:** Journey A (end-to-end), Journey C.
**Dependencies:** Phase 1 (Rooms page must exist to link to).

#### Task 3.1: Add "Create a room" link to empty Area dropdown
**File:** `apps/web/src/components/calendar/add-appointment-modal.tsx` (MODIFY, around line 2249)

Current:
```tsx
<Select value={newAppointment.roomId} onValueChange={(value) => handleInputChange('roomId', value)}>
  <SelectTrigger>...</SelectTrigger>
  <SelectContent>
    {rooms.map((room) => (
      <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

Add empty-state detection:
```tsx
{rooms.length === 0 ? (
  <div className="border border-dashed rounded-md p-3 text-sm text-muted-foreground">
    No rooms available.{" "}
    <Link
      to="/dashboard/rooms/view"
      search={{ returnTo: "/dashboard/appointment/view" }}
      className="text-primary underline"
      onClick={() => onClose()} // close the modal before navigating
    >
      Create one →
    </Link>
  </div>
) : (
  <Select>...</Select>
)}
```

`onClose` is the modal's close handler — verify its name by reading the modal's props.

#### Task 3.2: Improve Employee dropdown placeholder
**File:** `apps/web/src/components/calendar/add-appointment-modal.tsx` (MODIFY, around line 2279)

Current: `<SelectValue placeholder="There are no employees available" />` — always the same message.

Compute contextually:
```typescript
const employeePlaceholder = useMemo(() => {
  if (!newAppointment.roomId) return "Select an area first";
  if (employees.length === 0) return "No employees available for this area";
  return "Select an employee";
}, [newAppointment.roomId, employees.length]);
```

Then:
```tsx
<Select value={newAppointment.employeeId} onValueChange={...} disabled={!newAppointment.roomId}>
  <SelectTrigger>
    <SelectValue placeholder={employeePlaceholder} />
  </SelectTrigger>
  <SelectContent>
    {employees.map((employee) => (
      <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

**IMPORTANT:** The current implementation populates `employees` from `client.members.list({ organizationId })` without filtering by room/branch. The current behavior may always show all members regardless of room selection. Verify whether filtering by room is expected — if not, the placeholder "No employees available for this area" is inaccurate. See Open Questions.

#### Acceptance Criteria (Phase 3)
- Opening "Add Appointment" in a tenant with zero rooms shows the inline "Create one →" message instead of an empty dropdown
- Clicking the link closes the modal and navigates to `/dashboard/rooms/view?returnTo=/dashboard/appointment/view`
- Employee dropdown shows "Select an area first" when no room is selected
- Employee dropdown is disabled until a room is selected
- After selecting a room, Employee dropdown enables and shows "Select an employee" (or "No employees available for this area" if list is empty)

---

### Phase 4: Seed Default Rooms
**Goal:** New test tenants automatically get one room per branch.
**Delivers:** Journey D.
**Dependencies:** None (independent).

#### Task 4.1: Add rooms to seed-business-data.ts
**File:** `apps/server/scripts/seed-business-data.ts` (MODIFY)

Verified structure: current file imports schema via `import * as tenantSchema from "@avantej-core/db/schema/tenant-schema"` and named imports from `@avantej-core/db/schema/tenant/index` (e.g., `packageInstances, serviceCategories, services`). Match this pattern.

Add `rooms` and `hierarchyNodes` to the existing named-import block at the top:

```typescript
import {
  packageInstances,
  serviceCategories,
  services,
  rooms,         // NEW
  hierarchyNodes, // NEW
} from "@avantej-core/db/schema/tenant/index";
import { eq } from "drizzle-orm";
```

Then after existing seed logic (near the end), add:

```typescript
// ─── Seed default rooms (one per branch, idempotent) ────────────────────
const branches = await tenantDb
  .select()
  .from(hierarchyNodes)
  .where(eq(hierarchyNodes.type, "branch"));

for (const branch of branches) {
  const existing = await tenantDb
    .select()
    .from(rooms)
    .where(eq(rooms.branchId, branch.id))
    .limit(1);
  if (existing.length > 0) {
    console.log(`[skip] Branch "${branch.name}" already has rooms`);
    continue;
  }

  await tenantDb.insert(rooms).values({
    name: `Main Room - ${branch.name}`,
    type: "training",
    capacity: 20,
    branchId: branch.id,
    isActive: true,
  });
  console.log(`[ok] Created default room for branch "${branch.name}"`);
}
```

**Verify `tenant/index` exports `rooms` and `hierarchyNodes`** before writing — if it doesn't, import them directly from the individual schema files as the plan originally specified.

#### Task 4.2: Document in CLAUDE.md or dev onboarding
Optional: Add a note to CLAUDE.md that for new tenants, `seed-business-data.ts` must be run to avoid the empty-rooms blocker. This is a docs-only change.

#### Acceptance Criteria (Phase 4)
- Running `bun run apps/server/scripts/seed-business-data.ts` on a tenant with branches and zero rooms creates one room per branch
- Running it again is idempotent (no duplicate rooms)
- Test tenant "Test Fitness Franchise" has "Studio A" already, so seed script should skip or not conflict

---

### Phase 5: Hub Documentation Update
**Goal:** Keep `zhub/` current.
**Delivers:** Maintenance.
**Dependencies:** Phase 1–3.

#### Task 5.1: Create new page doc
**File:** `zhub/pages/web-dashboard-rooms-view.md` (NEW)

Follow existing page doc template (e.g., `zhub/pages/web-dashboard-suppliers-view.md`).

#### Task 5.2: Update index
**File:** `zhub/index.md` (MODIFY)

Add row under "Appointments" section:
```
| [Rooms](pages/web-dashboard-rooms-view.md) | `/dashboard/rooms/view` | Room CRUD with branch filter; gated by appointment_management permissions |
```

#### Task 5.3: Update appointment-view page doc
**File:** `zhub/pages/web-dashboard-appointment-view.md` (MODIFY)

Note the new empty-state link and the improved Employee placeholder logic.

---

## 6. Impact & Breakage Analysis

### Files Modified / Created

| Phase | File | Action | Risk |
|-------|------|--------|------|
| 1.1 | `apps/web/src/components/tables/rooms/view/columns.tsx` | Create | Low |
| 1.3 | `apps/web/src/routes/_authenticated/dashboard/_layout/rooms/view.tsx` | Create | Low |
| 1.4 | `apps/web/src/components/forms/room-form-sheet.tsx` | Create (optional; may inline) | Low |
| 1.5 | `apps/web/src/routeTree.gen.ts` | Auto-regenerated by Vite plugin | Low |
| 2.1 | `apps/web/src/components/app-sidebar.tsx` | Modify (add 1 nav item + 1 import) | Low |
| 3.1 | `apps/web/src/components/calendar/add-appointment-modal.tsx` | Modify (empty-state JSX) | **Medium** — this file is 2400+ lines and critical |
| 3.2 | `apps/web/src/components/calendar/add-appointment-modal.tsx` | Modify (placeholder logic) | Medium |
| 4.1 | `apps/server/scripts/seed-business-data.ts` | Modify (add rooms section) | Low |
| 5.1 | `zhub/pages/web-dashboard-rooms-view.md` | Create | Low |
| 5.2 | `zhub/index.md` | Modify | Low |
| 5.3 | `zhub/pages/web-dashboard-appointment-view.md` | Modify | Low |

### Callers / Importers of `add-appointment-modal.tsx`

```
grep -r "add-appointment-modal\|AddAppointmentModal" apps/web/src
```

Must be run before starting Phase 3 to know which consumers will re-render after the JSX changes. Expected: only `appointment/view.tsx`.

### API Callers of `client.rooms.list`

Currently only `add-appointment-modal.tsx` (line 166). After Phase 1, the new `rooms/view.tsx` will also call it. No return type change — safe.

### Deployment Coupling

All phases are frontend-only. Can deploy together or in any order. No DB migration, no API contract change.

### Schema Nullable Fields

`rooms` schema has no nullable fields that the form needs to set — all required columns have defaults or are always provided.

### Return Type Changes

**None.** All existing API shapes preserved.

### Blocking Prerequisites

- Decision on the "Employee dropdown filters by room?" question (see Open Questions) — blocks Phase 3.2 language choice but not implementation timing.

---

## 7. Cross-Cutting Concerns

### Error Handling
- All mutations use `toast.error` on failure with `err.message`
- API errors from `rooms.list` show the existing `isError` state with retry (match suppliers page pattern)
- Empty branches list (no branches created yet) — show a distinct inline message in the room create sheet: "No branches found. [Create a branch first]"

### Testing Approach
- **Unit:** None required — page is glue code over existing tested APIs
- **Integration:** Add a backend test that `rooms.create` → `rooms.list` returns the new row (may already exist in `apps/server/src/tests/unit/services/`)
- **E2E manual:**
  1. Log in as admin with zero rooms → click Add Appointment → Area dropdown shows "Create one" link
  2. Click the link → lands on rooms page with banner → create a room → return to appointment
  3. Open Add Appointment again → Area dropdown populated → full flow works
  4. Edit room → capacity changes persist
  5. Deactivate room → disappears from Active tab, still in All / Inactive tabs

### Migration Plan
No DB migration. Existing tenants with no rooms will see empty tables — they can create rooms via the new UI. Seed script is for dev convenience only.

### Rollback Strategy
Remove the sidebar entry (`app-sidebar.tsx`) and the empty-state link (`add-appointment-modal.tsx`). The new route and page continue to exist but are undiscoverable. No DB damage possible.

### Performance
- `rooms.list` is a small table (typically <100 rows per tenant). No pagination needed for V1.
- Hierarchy nodes query is already cached by the user context path.
- Room form sheet reuses existing searchable combobox pattern.

---

## 8. Open Questions / Risks

### Q1: Does Employee dropdown actually filter by room?
**Status:** Unclear from reading `add-appointment-modal.tsx` lines 177–188. The query is `client.members.list({ organizationId })` — no room filter. The placeholder text says "There are no employees available" which implies filtering, but the code does not filter.

**Options:**
- **A:** Keep Phase 3.2 placeholder as "Select an area first" / "Select an employee" (drop the "for this area" language) — matches actual behavior.
- **B:** Actually implement room-based filtering by joining `serviceMembers` or a future `roomMembers` table — out of scope, defer to a separate plan.

**Recommendation:** Option A for this phase. Update the placeholder to avoid misleading users until/unless B ships.

### Q2: Should the sidebar entry live under "Appointments" or get its own "Facilities" group?
**Considered:** Creating a new "Facilities" sidebar group to host Rooms (and future things like Equipment, Vehicles).

**Decision:** Under Appointments. A dedicated Facilities group is premature for a single item. Can be refactored later.

### Q3: Permission — reuse `appointment_management` or introduce `rooms_management`?
**Considered:** New resource `rooms_management` with its own CRUD actions.

**Decision:** Reuse `appointment_management`. Introducing a new resource requires:
- Migration to `permissions` table
- Update `role_permissions` seed data
- Update the frontend permission matrix page
Not worth it for a single page.

### Q5: Pre-existing `appointments` vs `appointment_management` resource split
**Discovery during plan review:** The codebase declares BOTH resources (`packages/services/src/permission.service.ts` lines 33–34):
- `appointments` — used by `rooms.ts` router for all CRUD operations
- `appointment_management` — used by `appointments.ts` router AND the entire sidebar

This is a pre-existing inconsistency unrelated to this plan, but it bites us:
- Sidebar link in Phase 2.1 uses `appointment_management:read` (to match siblings)
- API in `rooms` router enforces `appointments:read`
- Admin (priority >= 100) has both, so works
- A non-admin custom role with only `appointment_management:*` granted would see the sidebar link and get API errors

**Mitigation (this plan):** Use `appointment_management:read` for sidebar visibility — matches convention. Admin users work fine. Document the hazard.

**Follow-up (out of scope):** Consolidate `appointments` and `appointment_management` into a single resource. Backend change: update `rooms.ts` (4 `requirePermission` calls) to use `appointment_management`. Safe because admins already have both.

### Q4: Should we rename "Area" to "Room" in the appointment form?
**Considered:** Better UX consistency since the backing table is `rooms`.

**Decision:** Out of scope for this plan. Document in the Todo and revisit with product input. Two inconsistent names is bad, but renaming requires coordinated updates in:
- `add-appointment-modal.tsx` (several "Area" labels and tooltips)
- Potentially other appointment-related UI (multi-appointment mode uses "Area" too, line 1828)
- E2E tests and docs

### Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `add-appointment-modal.tsx` is huge and fragile — edits could regress other flows | Medium | Keep Phase 3 changes minimal; run the full appointment flow manually before merging |
| Seed script collides with existing rooms | Low | Idempotency check in Task 4.1 (`existing.length > 0` skip) |
| Users confused by "No rooms" inline message if they lack create permission | Low | Conditional: only show the create link if `hasPermission("appointment_management:create")` |
| Multi-appointment mode (line 1828) has its own Area dropdown — Phase 3.1 doesn't cover it | Medium | Add a follow-up task in Phase 3 or scope note: same empty-state link applies to multi-appointment slot Area dropdown |
