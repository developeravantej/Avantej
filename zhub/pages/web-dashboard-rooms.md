# Rooms

**Route:** `/dashboard/rooms/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/rooms/view.tsx`
**Platform:** web
**Auth required:** authenticated + rbac(appointment_management:create, :update)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Create, update, and manage appointment rooms (consultation, group session, training, etc.) across branches.

**Produces:** Full-height table of rooms with filters (Active/All/Inactive), name, type, capacity, branch; create/edit sheet; optional "returnTo" banner for appointment context.

**On success:**
- Room created (toast "Room created successfully")
- Room updated (toast "Room updated successfully")
- Room deactivated/reactivated (silent cache invalidation)

**On failure / error states:**
- Loading spinner during fetch
- Error card with "Failed to load data" and retry button
- Empty state: "No rooms found" with create button (if canCreate)
- Toast errors on mutation failure
- Permission guard: org select required, no render if no org

---

## 2. How It Works

**Execution flow:**
1. Route loads with optional `returnTo` search param (used when creating room from appointment form)
2. Fetches hierarchy nodes to extract branches via `client.hierarchy.listNodes()`
3. Fetches rooms list filtered by `activeFilter` (true/undefined/false) via `client.rooms.list()`
4. Maps to `RoomRow[]` with branch name lookup from nodes
5. Header shows room count; "Create Room" button (if canCreate)
6. Filter tabs: Active, All, Inactive — updates activeFilter on click
7. Create/Edit sheet:
   - Form fields: name (text), type (select: consultation/group_session/private/training/individual), capacity (number), branch (combobox), active (checkbox, edit only)
   - On submit (create): `client.rooms.create()` with org context
   - On submit (update): `client.rooms.update()` with id and data
   - Sheet closes, cache invalidated, toast shown
8. Table actions (if canUpdate):
   - Edit button → opens sheet with form pre-filled
   - Deactivate/Reactivate buttons → trigger mutations
9. Optional banner: if `returnTo` is set, shows alert with link back to appointment form

**Inputs:**
- Filter: activeFilter (true/undefined/false)
- Form: name, type, capacity (number string), branchId, isActive (checkbox)
- Search: returnTo (optional)

**State management:**
- TanStack Query: `[...orpc.rooms.list.key(), { organizationId, isActive: activeFilter }]`
- Local state: activeFilter, isSheetOpen, editingRoom (null when creating), form data
- Cache invalidation on create/update/deactivate/reactivate

**Outputs:**
- Table renders rooms with actions
- Buttons enabled/disabled based on mutation pending state and permissions
- Toast notifications on create/update
- Banner with returnTo link if applicable

**Side effects:**
- Creates, updates, deactivates, reactivates rooms
- Invalidates room list cache
- Toast feedback
- No navigation (stays on page or returns via returnTo)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.hierarchy.listNodes()` — fetch all hierarchy nodes (org, branches, members)
- `client.rooms.list()` — fetch rooms, filtered by isActive
- `client.rooms.create()` — create room with org context
- `client.rooms.update()` — update room or change isActive
- `orpc.rooms.list.key()` — TanStack Query key generation

**Uses these components:**
- `DataTable` from `@/components/tables/rooms/view/data-table` — renders room table
- `BranchCombobox` (inline) — searchable branch selector
- `Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter` — create/edit form
- `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` — type selector
- `Input, Label, Alert, AlertDescription, Button, EmptyState` — form/UI elements
- `Link` — navigation back via returnTo

**Uses these hooks:**
- `useUserContext()` — org ID, permission checks (appointment_management:create, :update)
- `useSearch()` — retrieve returnTo param
- `useQuery` (React Query) — fetch hierarchy nodes and rooms
- `useMutation` (React Query) — create/update/deactivate/reactivate
- `useQueryClient()` — cache invalidation
- `useState, useMemo, useRef` — local state and optimization

**Navigation: who navigates here:**
- Sidebar link
- Direct URL
- From appointment creation form (with returnTo param)

**Navigation: where it goes:**
- returnTo link (back to appointment form if set)
- No other navigation

---

## 4. Data Shapes

**DB tables touched:**
- `rooms` (select, insert, update)
- `hierarchyNodes` (select, where type = 'branch')

**Key types / Zod schemas:**
```typescript
interface RoomFormState {
  name: string;
  type: "consultation" | "group_session" | "private" | "training" | "individual" | "";
  capacity: string; // parsed to number on submit
  branchId: string;
  isActive: boolean;
}

type RoomRow = {
  id: string;
  name: string;
  type: "consultation" | "group_session" | "private" | "training" | "individual";
  branchId: string;
  branchName: string; // from lookup via branchById map
  capacity: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

interface BranchNode {
  id: string;
  name: string;
  type: string; // "branch" | others
}

// API create/update input
{
  organizationId: string;
  name: string;
  type: "consultation" | "group_session" | "private" | "training" | "individual";
  capacity: number;
  branchId: string;
  isActive?: boolean; // only in update
}
```

---

## 5. Tests

**Test files:** None found matching room pattern in `__tests__/`

**Scenarios covered:** (none currently)

**Not tested (risk areas):**
- Create/update mutations
- Deactivate/reactivate mutations
- Filter tab behavior
- Form validation (required fields, capacity >= 1)
- Branch combobox search and selection
- returnTo banner and link
- Permission checks (appointment_management:create, :update)
- Edge cases: no branches, invalid form data

---

## 6. Notes

- **Branch hierarchy:** Rooms are scoped to a single branch; filtered from `hierarchyNodes` with type = 'branch'. Used for room assignment in appointments.
- **Type options:** Fixed list (consultation, group_session, private, training, individual) — likely maps to appointment slot types.
- **Capacity validation:** Must be >= 1 (error toast if not).
- **Form state:** Separate from API response; capacity stored as string (HTML input), parsed to number on submit.
- **Active filter:** true = active only, undefined = all, false = inactive only. Frontend toggle, not two separate states.
- **Mutations:** Deactivate/reactivate use the same `update()` endpoint with isActive flag.
- **returnTo context:** When creating room from appointment form, includes link back to complete appointment. Useful UX pattern for context-driven creation.
- **BranchCombobox:** Custom combobox component for branch selection with search/filter capabilities (implemented inline in this file).
