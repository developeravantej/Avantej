# Rooms Management Page

> **STATUS: SHIPPED on branch `Customer-app` (2026-04-17).** See `zdone/17-04_rooms-management.md` for the delivery log. This file is kept as the design reference; the checklist below is retained only to verify doc patches #12–#14 in `01-documentation-patches.md` pick up the shipped reality.
>
> Workstream shape: **feature build with user journey**.
> Output: one new route + sidebar entry + doc section.
> Only item in this plan with a genuine user journey.

## Shipped vs. Planned — Deltas

Code verified 2026-04-17. Deltas the documentation patches must reflect:

1. **No `components/forms/room-form.tsx`.** The form lives inline in `routes/_authenticated/dashboard/_layout/rooms/view.tsx` (stock-requests pattern), not in a separate form file.
2. **Permission split is still present.** Sidebar uses `appointment_management:read` (see `app-sidebar.tsx:136`); `rooms.ts` router enforces `appointments:{read,create,update}` (lines 31, 66, 107, 149, 186). Admin works because it holds both; non-admin custom roles granted only `appointment_management:*` will see the sidebar and fail at the API. Flag in doc as a known hazard; cleanup is a deferred follow-up.
3. **Soft-deactivate, not hard-delete.** `rooms.delete` internally sets `isActive: false`; the UI exposes Deactivate / Reactivate (symmetric `update({ isActive })`), not Delete.
4. **Extra UX beyond the plan** — Appointment modal gained (a) an inline "Create one →" link when `rooms.length === 0` with a `?returnTo=` banner on the rooms page, and (b) a contextual `employeePlaceholder` + disabled state on the Employee select. Multi-appointment mode (line ~1828) intentionally untouched — deferred follow-up.
5. **Seed script extended** — `apps/server/scripts/seed-business-data.ts` Step 7 inserts one "Main Room - {branch}" per branch, idempotent.

---

## Why

`rooms` router exists (`packages/api/src/routers/rooms.ts` — procedures: `list`, `create`, `update`, `delete`) and is wired into `baseRouter`. Today it is used **only** inside `components/calendar/add-appointment-modal.tsx` as a dropdown data source. There is no way for admins to add, edit, or deactivate rooms — they must exist in the DB for the appointment modal to offer them, and admins have no path to create them.

Making rooms a first-class dashboard entity unblocks the appointment creation flow for new tenants.

---

## User Journey

### Journey: Admin manages rooms at a branch

**Trigger:** Admin opens the sidebar and clicks "Rooms" under the Appointments group.

**Steps:**

1. User lands on `/dashboard/rooms/view` → sees a DataTable of rooms at branches within their `accessibleNodeIds`.
2. User clicks "New Room" → **inline sheet** (drawer) opens on the right with form fields:
   - Branch* (searchable combobox, filtered to accessible nodes)
   - Name* (text)
   - Type* (dropdown — `consultation` / `group_session` / `private` / `training` / `individual`)
   - Capacity* (integer, min 1 — NOT NULL in schema)
   - Status: Active (default) / Inactive
3. User saves → `client.rooms.create` → sheet closes, toast "Room created", table refreshes.
4. User clicks Edit on a row → same sheet, prefilled → `client.rooms.update` on save.
5. User clicks Delete on a row → confirmation Dialog with copy "Delete room? Existing appointments keep the room name as a label but the room can no longer be selected." → confirm → `client.rooms.delete` → row disappears.
6. Flow ends: user navigates back to appointments and sees the new room in the Create Appointment modal's Room dropdown.

**Where it lives:** new dashboard page `/dashboard/rooms/view`. Matches the doc's existing template (see Class Slots view for the closest pattern).

### Journey (secondary): Appointment modal shows only rooms within branch scope

No new build — verify existing behavior. The Create Appointment modal's Room dropdown must filter rooms by the selected service's branch. If it currently shows all rooms in the org, that's a bug out of scope for this ticket but should be flagged.

---

## Technical Details

### Route

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/rooms/view.tsx` (new)

**Route definition:**
```tsx
export const Route = createFileRoute("/_authenticated/dashboard/_layout/rooms/view")({
  component: RoomsView,
});
```

### Page Composition

Pattern-match the Suppliers view (`suppliers/view.tsx`) — it's the closest analog: list + filter tabs + create sheet + row actions.

### Components to Create

| File | Purpose |
|------|---------|
| `routes/_authenticated/dashboard/_layout/rooms/view.tsx` | Route component |
| `components/tables/rooms/view/columns.tsx` | DataTable column defs (Name, Branch, Capacity, Status, actions) |
| `components/tables/rooms/view/data-table.tsx` | DataTable wrapper with onCreate/onEdit/onDelete callbacks |
| `components/forms/room-form.tsx` | Create/edit sheet form |

### API Calls

| Call | When |
|------|------|
| `client.rooms.list({ organizationId })` | Page load + after mutations |
| `client.hierarchy.listNodes({ organizationId })` | Branch combobox options |
| `client.rooms.create({ organizationId, name, type, capacity, branchId, isActive? })` | Create |
| `client.rooms.update({ organizationId, id, name?, type?, capacity?, branchId?, isActive? })` | Edit |
| `client.rooms.delete({ organizationId, id })` | Delete |

### Permission Gating

**Note:** the `rooms` router enforces `appointments` as the resource name (see `packages/api/src/routers/rooms.ts` lines 31, 66, 107, 149, 186) — NOT `appointment_management`. Both resource names exist in `permission.service.ts`; the client-side gate must match what the server checks.

- Page access: `appointments:read`
- Create button: `appointments:create`
- Edit button: `appointments:update`
- Delete button: `appointments:update` (note: the router's `delete` procedure checks `update`, not `delete` — a pre-existing quirk worth flagging but out of scope for this ticket)

Use `useCommonPermissions()` — follow the pattern in `components/app-sidebar.tsx` (gated sidebar entries) and `stock-requests/view.tsx` (gated create button).

### Sidebar Update

`components/app-sidebar.tsx` — add under the Appointments group:

```ts
{ title: "Rooms", url: "/dashboard/rooms/view", icon: DoorOpen, permission: "appointment_management:read" }
```

### Schema (Verified)

`packages/db/src/schema/tenant/rooms.ts`:

```ts
rooms {
  id: uuid (PK)
  name: text NOT NULL
  type: text NOT NULL      // enum-by-convention, see roomTypeEnum in router
  capacity: integer NOT NULL
  branchId: uuid NOT NULL  // FK → hierarchyNodes.id ON DELETE RESTRICT
  isActive: boolean NOT NULL DEFAULT true
  createdAt, updatedAt: timestamp NOT NULL
}
```

**Schema is ready. No migration required.** The UI form must treat `type` and `capacity` as required, and `isActive` defaults to true.

**Hard-delete consequence:** `branchId` FK is `ON DELETE RESTRICT`. Deleting a branch with rooms will fail. Rooms themselves have no incoming FKs (the `appointments.roomId` linkage — if it exists — is the other direction). Hard delete is safe; however, see the journey step 5 for the "referenced by appointments" question, which depends on how `appointments.roomId` is declared. Verify before shipping.

---

## Implementation Phases

### Phase 1 — Ship the Journey End-to-End

**Goal:** Admin can list, create, edit, delete rooms from a working page.

**Tasks:**

1. **Task 1.1** — Verify `rooms` schema supports all form fields. If not, stop and file a schema migration ticket.
2. **Task 1.2** — Create `components/forms/room-form.tsx` following `supplier-form.tsx` as the pattern.
3. **Task 1.3** — Create `components/tables/rooms/view/columns.tsx` + `data-table.tsx` following Suppliers.
4. **Task 1.4** — Create `routes/_authenticated/dashboard/_layout/rooms/view.tsx` wiring the table + sheet.
5. **Task 1.5** — Add sidebar entry in `components/app-sidebar.tsx`.
6. **Task 1.6** — Run `bun dev:web` and test the journey in a browser. Verify: create → edit → delete → refresh preserves state.
7. **Task 1.7** — Add doc section to `zdocs/dashboard-functionality.md` per patch #12 in `01-documentation-patches.md`.
8. **Task 1.8** — Manually verify the Create Appointment modal still shows the new room in its dropdown.

**Dependencies:** None.

**Acceptance:**

- [ ] Admin can complete the full journey in a browser
- [ ] Non-admin cannot see the "Rooms" sidebar link (permission filter working)
- [ ] Doc entry merged
- [ ] Appointment modal verified to still work

**Estimated effort:** 1–2 days.

---

## Impact / Breakage

| Area | Risk | Mitigation |
|------|------|------------|
| Appointment modal | Room dropdown pulls from same `rooms.list` — new UI might create/delete rooms concurrently | None needed — modal queries on open |
| Sidebar | Adding an entry shifts other entries' visual position | Verify collapsible groups render correctly |
| Tenant DB load | Room list is small — no perf risk | — |

No existing code deletes or changes. Pure addition.

---

## Out of Scope

- Bulk import of rooms
- Room booking conflict resolution
- Equipment tracking per room
- Room photos / media
- Filtering the appointment modal's room dropdown by selected service's branch (pre-existing behavior; flag separately if broken)

---

## Testing

### Manual

- Golden path: create → edit → delete → create again with same name
- Edge case: delete a room referenced by an appointment → verify appointment still displays room name
- RBAC: log in as non-admin → verify no sidebar link + direct URL navigation works but create/edit buttons absent

### Automated

- Add a Playwright smoke test or Vitest component test if the team has that pattern — otherwise defer
