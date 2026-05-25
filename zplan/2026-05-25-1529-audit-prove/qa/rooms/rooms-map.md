# Rooms Tab — White-Box Functional Map

Generated: 2026-05-25  
Route: `/_authenticated/dashboard/_layout/service/view?tab=rooms`

---

## 1. Entry / Route Guard

| Check | Where | Behaviour |
|---|---|---|
| Route-level permission guard | `view.tsx:14` | `requirePermission("service_management:read")` via `beforeLoad`. On failure → redirect to `/dashboard?unauthorized=true` |
| No organisation selected | `rooms-page.tsx:259–265` | Renders "Select an organisation to view rooms." message. No query fires. |

---

## 2. Interactive Elements

### 2.1 Tab Pills (top-level, in `view.tsx`)

Six pill buttons: Services / Categories / **Rooms** / Promotions / Pricing / Installment Plans.  
Clicking any pill calls `navigate({ search: { tab: t.id } })` — URL search param update, no network call, purely conditional render.

### 2.2 Active-Filter Pills (inside `RoomsPage`)

Three pill buttons: **Active** (default) / **All** / **Inactive**.

| Label | Sets `activeFilter` state to |
|---|---|
| Active | `true` |
| All | `undefined` |
| Inactive | `false` |

Each selection triggers a new `useQuery` call because `activeFilter` is part of the query key. The component re-renders with the new data on resolution.

### 2.3 "Create Room" Button (action bar)

- **Visible only when** `canCreate` is `true` (`hasPermission("appointment_management:create")`)
- Calls `openCreate()` → resets form to `EMPTY_FORM`, sets `isSheetOpen = true`
- Also present in `EmptyState` component's `action` prop when `canCreate` is true

### 2.4 Table Search Input

- `globalFilter` state feeds TanStack Table's `globalFilterFn: "includesString"`
- Client-side only — filters rows across all visible columns simultaneously
- No server round-trip
- Debounce: none — every keystroke triggers re-filter

### 2.5 Name Column Sort Button

- Clicking the "Name" header button calls `column.toggleSorting(...)` — client-side sort only, no server call

### 2.6 Row "Edit" Button

- Visible for every row regardless of `canUpdate` (the check wraps the handler: `onEdit={canUpdate ? openEdit : () => {}}`)
- When `canUpdate` is false, clicking Edit is a no-op (empty arrow function) — button remains visible and clickable, just does nothing
- When `canUpdate` is true → `openEdit(room)` → populates form with room data, sets `isSheetOpen = true`

### 2.7 Row "Deactivate" Button (active rooms only)

- Shown when `room.isActive === true`
- Clicking opens the Deactivate confirmation dialog (`setDeactivateTarget(room)`)
- No permission check at click time; server checks `appointment_management:update`

### 2.8 Row "Reactivate" Button (inactive rooms only)

- Shown when `room.isActive === false`
- Clicking opens the Reactivate confirmation dialog (`setReactivateTarget(room)`)
- No permission check at click time; server checks `appointment_management:update`

### 2.9 Deactivate Confirmation Dialog

Buttons:
- **Cancel** — dismisses dialog, `disabled={isDeactivating}`
- **Deactivate** (destructive) — calls `handleDeactivateConfirm()`:  
  - `await onDeactivate(deactivateTarget.id)` → `client.rooms.update({ isActive: false })`
  - On success: `toast.success(\`Room "${name}" deactivated\`)`, then `setDeactivateTarget(null)`
  - On error: `toast.error(err.message || "Failed to deactivate room")`, then `setDeactivateTarget(null)`

### 2.10 Reactivate Confirmation Dialog

Buttons:
- **Cancel** — dismisses dialog, `disabled={isReactivating}`
- **Reactivate** — calls `handleReactivateConfirm()`:
  - `await onReactivate(reactivateTarget.id)` → `client.rooms.update({ isActive: true })`
  - On success: `toast.success(\`Room "${name}" reactivated\`)`, then `setReactivateTarget(null)`
  - On error: `toast.error(...)`, then `setReactivateTarget(null)`

### 2.11 Create/Edit Dialog Form

#### Fields

| Field | Element | Required | Client Guard | Server Guard |
|---|---|---|---|---|
| Name | `<Input type="text" id="room-name">` | Yes | `form.name.trim()` empty → `toast.error("Name is required")` | `z.string().min(1)` |
| Type | `<Select>` | Yes | `!form.type` → `toast.error("Type is required")` | `z.enum([...5 values...])` |
| Capacity | `<Input type="number" min={1}>` | Yes | `parseInt` NaN or `< 1` → `toast.error(...)` | `z.number().int().min(1)` |
| Branch | `BranchCombobox` | Yes | `!form.branchId` → `toast.error("Branch is required")` | `z.string().uuid()` |
| Active (checkbox) | `<input type="checkbox">` | Only in Edit | Not validated (just boolean state) | `z.boolean().optional()` |

#### Buttons
- **Cancel** — calls `closeSheet()`, `disabled={isBusy}`
- **Create Room / Save Changes** — calls `handleSubmit()`, `disabled={isBusy}`

---

## 3. User Journeys

### 3.1 Golden Path — View Rooms (Active)

1. Navigate to `/dashboard/service/view?tab=rooms`
2. Route guard checks `service_management:read` → pass
3. `useQuery` fires `client.rooms.list({ organizationId, isActive: true })`
4. Server: `assertOrgContextMatch` → `guardBranchAccessible` (skipped, no branchId) → `requirePermission appointment_management:read` → `listRooms(tenantDb, { isActive: true, accessibleNodeIds })`
5. Service filters rows, then post-filters by `accessibleNodeIds` if non-empty
6. Table renders with Active/All/Inactive pills, search bar, and rows

### 3.2 Golden Path — Create Room

1. Click "Create Room" button (requires `appointment_management:create`)
2. Dialog opens; form is blank
3. Enter Name, select Type, enter Capacity (≥1), pick Branch via combobox
4. Click "Create Room" → `handleSubmit()` → `createMutation.mutate(...)`
5. Server: `assertOrgContextMatch` → `guardBranchAccessible(branchId, accessibleNodeIds)` → `requirePermission ...create` → `createRoom(tenantDb, params)`
6. On success: `toast.success("Room created successfully")`, `invalidateRooms()`, `closeSheet()`
7. Table re-fetches and shows new room

### 3.3 Golden Path — Edit Room

1. Click "Edit" on a row (requires `appointment_management:update`)
2. Dialog opens pre-populated with room data; Active checkbox visible
3. Modify one or more fields
4. Click "Save Changes" → `updateMutation.mutate({ id, data })`
5. Server: `assertOrgContextMatch` → optional `guardBranchAccessible` → `requirePermission ...update` → `updateRoom(tenantDb, id, params)`
6. On success: `toast.success("Room updated successfully")`, `invalidateRooms()`, `closeSheet()`

### 3.4 Golden Path — Deactivate Room

1. Click "Deactivate" on an active room row
2. Confirmation dialog appears with room name
3. Click "Deactivate" → `client.rooms.update({ id, isActive: false })`
4. Server checks `appointment_management:update`
5. On success: `toast.success(\`Room "X" deactivated\`)`, query invalidated

### 3.5 Golden Path — Reactivate Room

1. Switch filter to "All" or "Inactive" to see inactive rooms
2. Click "Reactivate" on an inactive room
3. Confirmation dialog appears
4. Click "Reactivate" → `client.rooms.update({ id, isActive: true })`
5. On success: `toast.success(\`Room "X" reactivated\`)`, query invalidated

### 3.6 Alternate — Filter by All / Inactive

Clicking "All" or "Inactive" pills updates `activeFilter` state → new query key → re-fetch with `isActive: undefined` or `isActive: false`.

### 3.7 Alternate — No Branches Available

If `nodesData?.nodes` contains no nodes with `type === "branch"`, the branch field in the dialog shows the static message "No branches found. Create a branch first." — form cannot be submitted because `!form.branchId` will toast an error.

### 3.8 Alternate — Empty Room List

When API returns empty array for the current filter, `tableData.length === 0` renders `<EmptyState>` with optional "Create Room" action.

### 3.9 Alternate — Loading State

While `isLoading` is true, renders `<PageLoader />` (full-page spinner). Applies only to the rooms query, not the hierarchy/nodes query.

### 3.10 Alternate — Error State

When `isError` is true, renders error message with `error.message` and a "Try Again" button that calls `refetch()`.

---

## 4. Data States

| State | Trigger | UI Response | Handled? |
|---|---|---|---|
| `organizationId` is null | No org selected | Static message | Yes |
| Loading (rooms query) | Initial fetch | `<PageLoader />` | Yes |
| Load error (rooms query) | Network/server error | Error panel + "Try Again" | Yes |
| Empty list for filter | API returns `[]` | `<EmptyState>` | Yes |
| Loading (hierarchy/nodes) | Initial fetch | No distinct state — `branches` defaults to `[]` | Partial (no spinner) |
| Hierarchy load error | API errors | Silent — `nodesData` stays `undefined`, branches = `[]` | **No** — error not surfaced |
| Search yields no results | All rows filtered out | Empty state inside table body | Yes |
| Deactivate in-flight | `isDeactivating = true` | Dialog buttons disabled, label "Deactivating..." | Yes |
| Reactivate in-flight | `isReactivating = true` | Dialog buttons disabled, label "Reactivating..." | Yes |
| Create/Update in-flight | `isBusy = true` | Dialog buttons disabled, label "Creating..." / "Saving..." | Yes |

---

## 5. Per-Field Validation Detail

### Name
- **Client**: `.trim()` empty → `toast.error("Name is required")`. Leading/trailing whitespace stripped before submission. No max-length check client-side.
- **Server**: `z.string().min(1)` — enforces non-empty after Zod's own trim (if any). No max-length at server level either.
- **Mismatch**: A string of only spaces (e.g. `"   "`) will fail client-side but a single non-space character passes both. No max-length cap at either layer.

### Type
- **Client**: Checks `!form.type` → error. Only the 5 enum values can appear in the select; no free-text.
- **Server**: `z.enum([...])` — hard rejection of any value outside the 5.
- **Mismatch**: None. Client type options exactly match server enum.

### Capacity
- **Client**: `parseInt(value, 10)`; rejects NaN or `< 1`. Input has `type="number" min={1}` but HTML min is advisory only — user can type `0` or `-5` and still submit the form (client JS catches it).
- **Server**: `z.number().int().min(1)`.
- **Mismatch**: `parseInt("1.9", 10)` → `1`, which passes. Server receives integer `1`. No upper bound enforced anywhere — capacity of `999999` is accepted.

### Branch
- **Client**: `!form.branchId` → error. The `BranchCombobox` only sets `branchId` from the server-fetched list, so invalid UUIDs are impossible through normal UI.
- **Server**: `z.string().uuid()`. `guardBranchAccessible(branchId, accessibleNodeIds)` checks RBAC.
- **Mismatch**: None for normal flow. If `accessibleNodeIds` is empty on the server context, the guard in `guardBranchAccessible` calls `assertBranchAccessible(branchId, [])` — all branches would be inaccessible to the user despite showing in the combobox (hierarchy fetch uses different access check than the create guard).

### Active (Edit only)
- **Client**: Simple boolean checkbox; always valid.
- **Server**: `z.boolean().optional()`. No constraint.

---

## 6. State Transitions & Side Effects

### Mutations → Query Invalidations

| Mutation | Invalidation key | Toast |
|---|---|---|
| `createMutation` (useApiMutation) | `[...orpc.rooms.list.key(), { organizationId }]` | "Room created successfully" |
| `updateMutation` (useApiMutation) | `[...orpc.rooms.list.key(), { organizationId }]` | "Room updated successfully" |
| `deactivateMutation` (useMutation) | `[...orpc.rooms.list.key(), { organizationId }]` | `Room "${name}" deactivated` (in DataTable) |
| `reactivateMutation` (useMutation) | `[...orpc.rooms.list.key(), { organizationId }]` | `Room "${name}" reactivated` (in DataTable) |

**Bug note**: The query invalidation key in `invalidateRooms()` is `[...orpc.rooms.list.key(), { organizationId }]` (without `isActive`). The query was registered with key `[...orpc.rooms.list.key(), { organizationId, isActive: activeFilter }]`. These do not match precisely when `isActive` is `true` or `false` — the partial key `{ organizationId }` should still invalidate all rooms queries via TanStack Query's partial-key matching. This works at runtime but is fragile — if the `isActive` filter key is nested differently, invalidation could silently miss. The risk is low with TanStack Query's prefix semantics but worth noting.

### Dialog Open/Close
- Opening create: `editingRoom = null`, form reset to `EMPTY_FORM`
- Opening edit: `editingRoom = <row>`, form populated from row
- Closing (Cancel, successful submit, or backdrop click): `closeSheet()` resets both

---

## 7. RBAC / Permission Branches

### Route entry
- `requirePermission("service_management:read")` — blocks entire `/service/view` route. Rooms tab never renders without this.

### Inside RoomsPage
| Permission | Frontend Effect | Server Enforcement |
|---|---|---|
| `appointment_management:create` | "Create Room" button hidden; EmptyState action hidden | `requirePermissionOrpc(..., "create")` on `rooms.create` |
| `appointment_management:update` | Edit button is no-op (but still visible); no guard on Deactivate/Reactivate buttons | `requirePermissionOrpc(..., "update")` on `rooms.update` |
| `appointment_management:read` | Not checked client-side (rooms query will fire anyway) | `requirePermissionOrpc(..., "read")` on `rooms.list` |

### Staff vs Admin
- Admin: `accessibleNodeIds` includes all nodes → no row-level filtering
- Staff: `accessibleNodeIds` scoped to hierarchy subtree → `listRooms` post-filters rows to only those whose `branchId` is in `accessibleNodeIds`
- **The combobox shows ALL branch nodes from `client.hierarchy.listNodes`** regardless of the user's RBAC scope. A staff user could see a branch in the picker that they cannot actually create a room in — the server-side `guardBranchAccessible` will reject it with `FORBIDDEN`.

### delete procedure
- `rooms.delete` uses `appointment_management:update` (not `delete`). The "delete" is actually a soft-deactivation at the service layer. There is no hard-delete exposed from the frontend.

---

## 8. Known Gaps / Unhandled States

1. **Hierarchy/nodes query silent failure**: If `client.hierarchy.listNodes` fails, `nodesData` stays `undefined`, `branches` is `[]`, and the form silently shows "No branches found" with no indication it's a data-loading error.

2. **Edit button always visible to read-only users**: Users without `appointment_management:update` still see "Edit" in every row; clicking it silently does nothing. No tooltip or disabled state.

3. **No confirmation on form cancel with dirty state**: If a user has filled in fields and clicks Cancel or the backdrop, the form is discarded silently with no warning.

4. **Deactivate/Reactivate no permission check on the frontend**: The Deactivate and Reactivate buttons are visible and clickable to any user who can read rooms. The server will reject with FORBIDDEN for users lacking `appointment_management:update`, but the client will show a generic error toast rather than hiding the control.

5. **Query invalidation partial-key mismatch risk**: `invalidateRooms` uses `{ organizationId }` without `isActive`, while the query was registered with `{ organizationId, isActive }`. Works today via prefix semantics but is fragile.

6. **No pagination**: All rooms are fetched in a single query. Large data sets could cause performance issues.

7. **No max-length validation on Name**: Neither client nor server enforces a maximum character count.

8. **No capacity upper-bound validation**: Capacity `999999` is accepted by both layers.

9. **`rooms.service.ts:updateRoom` returns error on not-found but does not check pre-existence**: The service throws `"Room not found"` only after the update returns no rows — there is no explicit existence check before update.

10. **`rooms.delete` permission is `appointment_management:update`** rather than a dedicated `delete` action — any user who can update rooms can also soft-delete them.
