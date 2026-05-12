# Rooms

**Route:** `/dashboard/rooms/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/rooms/view.tsx:1`
**Platform:** web
**Auth required:** authenticated; sidebar visibility gated by `appointment_management:read`; Create button gated by `appointment_management:create`; Edit / Deactivate / Reactivate gated by `appointment_management:update`
**Last updated:** 2026-04-17

---

## 1. What It Does

**Purpose (user perspective):** Lets admins and franchise owners manage rooms — the physical areas attached to branches that are required when booking an appointment. Supports view, create, edit, deactivate, and reactivate (soft-delete only; no hard delete).

**Produces:** A full-page layout with a header (`DoorOpen` icon, total room count badge, "Create Room" button), Active/All/Inactive status tabs, a searchable/paginated DataTable (Name, Type, Branch, Capacity, Status, Actions), and a right-side Sheet for create/edit. A yellow `Alert` banner renders at the top whenever the page is entered with a `?returnTo=...` query param — typically used when a user was sent here from the Add Appointment modal's empty-rooms state.

**On success:**
- Create: toast "Room created successfully"; sheet closes; table refreshes.
- Update: toast "Room updated successfully"; sheet closes.
- Deactivate: toast `Room "<name>" deactivated`; row disappears from Active tab, still visible on All/Inactive.
- Reactivate: toast `Room "<name>" reactivated`.

**On failure / error states:**
- No `organizationId`: message "Select an organization to view rooms."
- Loading: centered spinner.
- List fetch error: "Failed to load data" with error message and "Try Again" button calling `refetch()`.
- Mutation errors: toast with error message (falls back to "Failed to create/update/deactivate/reactivate room").
- No branches created yet: inside the create/edit sheet, the Branch field renders a dashed-border hint "No branches found. Create a branch first." instead of the combobox.
- Client-side validation (enforced before mutation): Name trimmed non-empty, Type selected, Capacity >= 1, Branch selected — each triggers a specific `toast.error`.

---

## 2. How It Works

**Execution flow:**
```
RoomsViewPage
  → useUserContext() → organizationId, hasPermission()
  → useSearch() → returnTo (optional query param)
  → useState(activeFilter) — Active | All | Inactive (default Active)
  → useState(form, editingRoom, isSheetOpen)
  → useQuery(["hierarchyNodes", orgId])
      → client.hierarchy.listNodes({ organizationId })
      → filter nodes where type === "branch" → branches[], branchById Map
  → useQuery([...orpc.rooms.list.key(), { orgId, isActive: activeFilter }])
      → client.rooms.list({ organizationId, isActive })
  → apiData.map() → RoomRow[] with branchName resolved via branchById
  → DataTable (rooms/view/data-table)
      → onEdit(row) → openEdit(row) → opens Sheet prefilled
      → onDeactivate(id) → deactivateMutation → client.rooms.update({ isActive: false })
      → onReactivate(id) → reactivateMutation → client.rooms.update({ isActive: true })
  → Sheet (create/edit)
      → BranchCombobox (local component) — debounced-style search over branches
      → Select — 5 type options (consultation / group_session / private / training / individual)
      → number input — capacity
      → checkbox — isActive (edit mode only)
      → Submit → createMutation or updateMutation → client.rooms.{create|update}
```

**Inputs:**
- `?returnTo=<path>` query param (captured by `validateSearch`) — shows the yellow banner.
- Active/All/Inactive tabs toggle the `isActive` query parameter (`true` / `undefined` / `false`).
- Name filter input inside the DataTable (TanStack Table column filter).
- Form fields: Name, Type, Capacity, Branch, Active (edit only).

**State management:**
- `useState` for `activeFilter`, `isSheetOpen`, `editingRoom`, `form`.
- TanStack Query for the rooms list and hierarchy nodes; mutations invalidate `[...orpc.rooms.list.key(), { organizationId }]`.
- Form state is a plain `RoomFormState` object (no react-hook-form).

**Outputs:** Table render; sheet; toast notifications on create/update/deactivate/reactivate success and failure; confirmation dialogs (deactivate + reactivate) rendered inside the DataTable component.

**Side effects:**
- All four mutations invalidate the rooms list query key.
- Banner's `Link` uses the dynamic `returnTo` string.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.rooms.list` — filtered by `isActive` (default `undefined` in the query; page defaults `activeFilter` to `true`).
- `client.rooms.create` — new room (Name, Type, Capacity, BranchId).
- `client.rooms.update` — used for both regular edits and deactivate/reactivate (toggles `isActive`).
- `client.hierarchy.listNodes` — for the branch combobox and branch-name column resolution.

Backend routers: `packages/api/src/routers/rooms.ts` (the backend enforces `appointments:*` — see Gotchas).

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/rooms/view/data-table.tsx` — TanStack Table wrapper with name filter, pagination, and two internal confirmation Dialogs (deactivate + reactivate).
- `createColumns(meta)` — `apps/web/src/components/tables/rooms/view/columns.tsx` — column defs; exports `RoomRow` type.
- `BranchCombobox` — defined inline at the bottom of `rooms/view.tsx` — search-as-you-type combobox over branch nodes.
- UI primitives: `Sheet`, `Select`, `Alert`, `Badge`, `Button`, `Input`, `DropdownMenu`, `Dialog`.
- Icons: `DoorOpen`, `Plus` from `lucide-react`.

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`, `hasPermission`.
- `useSearch` — reads the `returnTo` param.
- `useQuery`, `useMutation`, `useQueryClient`.
- `useState`, `useMemo`, `useRef`.

**Navigation: who navigates here:**
- App sidebar → Business → Appointments → "Rooms".
- Appointments page add-appointment modal — when `rooms.length === 0`, the Area dropdown renders a dashed-border inline hint with a TanStack `Link` to `/dashboard/rooms/view?returnTo=/dashboard/appointment/view`. Clicking the link closes the modal first.

**Navigation: where it goes:**
- When the banner is visible and the user clicks "Back to appointment →", TanStack `Link` navigates to the `returnTo` path (typically `/dashboard/appointment/view`).

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `rooms` | SELECT | `id`, `name`, `type`, `branchId`, `capacity`, `isActive`, `createdAt`, `updatedAt` |
| `rooms` | INSERT | `name`, `type`, `capacity`, `branchId` (isActive defaults true) |
| `rooms` | UPDATE | any of above + `isActive` (used for soft-delete) |
| `hierarchy_nodes` | SELECT (via `hierarchy.listNodes`) | `id`, `name`, `type` — filtered to `type === "branch"` client-side |

**Key types:**
```ts
type RoomRow = {
  id: string;
  name: string;
  type: "consultation" | "group_session" | "private" | "training" | "individual";
  branchId: string;
  branchName: string;  // resolved client-side via hierarchy.listNodes lookup
  capacity: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

interface RoomFormState {
  name: string;
  type: RoomType | "";
  capacity: string;    // string in form, parsed via parseInt at submit
  branchId: string;
  isActive: boolean;
}
```

Type enum labels (display): Consultation, Group Session, Private, Training, Individual.

---

## 5. Tests

**Test files:** None found.

**Not tested:** Any flow on this page (no dedicated test file exists at time of writing).

---

## 6. Notes & Gotchas

- **Permission split (pre-existing inconsistency, see plan §8 Q5):** The sidebar, Create/Edit/Deactivate/Reactivate buttons, and `useUserContext.hasPermission` checks all use the `appointment_management` resource to match sibling appointment pages. However, the backend `rooms` router enforces the separate `appointments` resource (list/getById → `appointments:read`, create → `appointments:create`, update/delete → `appointments:update`). Admins (priority >= 100) have both resources and work fine. A non-admin custom role granted only `appointment_management:*` would see the UI but fail at the API boundary. Follow-up: consolidate the two resources into one.
- **Soft-delete only.** There is no hard-delete UI. Both the "Deactivate" action and the `rooms.delete` API endpoint effectively set `isActive = false`. "Reactivate" is a symmetric `update({ isActive: true })`. Only appears in the dropdown when the row is already inactive (i.e., on the All / Inactive tabs).
- **Branch name is joined client-side.** The `rooms.list` API does not return `branchName`. The page separately calls `client.hierarchy.listNodes` and maps `branchId → name`. If the hierarchy query fails or the node is missing, the table falls back to showing the raw `branchId` UUID.
- **Empty-branches state.** If the tenant has no branches, the create sheet swaps the combobox for a dashed-border hint reading "No branches found. Create a branch first." The rest of the form still renders but the user cannot submit.
- **returnTo banner** is a simple yellow `Alert` with a `Link to={returnTo}`. The `returnTo` value is passed through untouched — only its use case is the appointment page, but any path will render as a link target.
- **`BranchCombobox` is defined inline** at the bottom of `view.tsx` (not extracted into a shared component) — follows the same pattern as `stock-requests/view.tsx`.
- **Active-filter default.** The page initializes `activeFilter = true` — the "Active" tab is selected by default, matching the Suppliers page pattern.
- **Dialog vs Sheet.** The create/edit form is a right-side `Sheet` (5-field form is too tall for a dialog), while the deactivate / reactivate confirmations are `Dialog`s — same split as other CRUD pages in the project.
- **Seed script.** `apps/server/scripts/seed-business-data.ts` Step 7 inserts one `Main Room - {branch.name}` per branch that has zero rooms (idempotent). Run this on fresh test tenants to avoid the empty-rooms blocker in the appointment form.
