# Rooms Management

**Date:** 2026-04-17
**Branch:** Customer-app
**Source plan:** `zplan/17-04_10-46_rooms-management/plan.md`

---

## Outcome

Admins now have a dedicated UI to create, edit, deactivate, and reactivate rooms at `/dashboard/rooms/view`. The appointment form is recoverable when no rooms exist — the previously-permanent "Create Appointment disabled forever" state is gone. Employee dropdown placeholder is now contextual instead of always reading "There are no employees available". New test tenants can be seeded with one default room per branch.

**No backend changes.** All existing API contracts (`client.rooms.list/create/update/delete`) were sufficient; this phase is frontend + seed-script only.

## Phases Delivered

| Phase | Status | Summary |
|---|---|---|
| 1 — Rooms Page | Done | New route + DataTable + create/edit sheet + deactivate/reactivate mutations + banner when `?returnTo=` set |
| 2 — Sidebar | Done | "Rooms" entry under Business → Appointments, gated by `appointment_management:read`, `DoorOpen` icon |
| 3 — Appointment Modal Fixes | Done | Inline "Create one →" link when `rooms.length === 0`; contextual Employee placeholder via `useMemo` + disabled state |
| 4 — Seed Script | Done | Step 7 block in `seed-business-data.ts` inserts one "Main Room - {branch}" per branch (idempotent) |
| 5 — Hub Docs | Done | New page doc + `zhub/index.md` entry + `appointment-view` recent-changes section |

---

## Files Created (4)

- `apps/web/src/components/tables/rooms/view/columns.tsx`
- `apps/web/src/components/tables/rooms/view/data-table.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/rooms/view.tsx`
- `zhub/pages/web-dashboard-rooms-view.md`

## Files Modified (5)

- `apps/web/src/components/app-sidebar.tsx` — `DoorOpen` import added alphabetically; new Rooms item inserted between Class Slots and Package Instances
- `apps/web/src/components/calendar/add-appointment-modal.tsx` — Area dropdown wrapped in empty-state ternary (single-appointment mode only); Employee select gained `disabled={!newAppointment.roomId}` and `placeholder={employeePlaceholder}`; added `useMemo` for placeholder and `Link` import from `@tanstack/react-router`
- `apps/server/scripts/seed-business-data.ts` — extended named imports to include `rooms` and `hierarchyNodes`; added `import { eq } from "drizzle-orm"`; new Step 7 block after package instances
- `zhub/index.md` — Rooms row added under Appointments section; dashboard page count 42 → 43; Last updated 2026-04-17
- `zhub/pages/web-dashboard-appointment-view.md` — new `## 7. Recent Changes (2026-04-17 — Rooms Management)` section

## Files Auto-Regenerated (1)

- `apps/web/src/routeTree.gen.ts` — picked up the new `/dashboard/rooms/view` route (13 references)

---

## Rooms Page Features

**Route:** `/dashboard/rooms/view` — accepts `?returnTo=<path>` query param

- **Header:** `DoorOpen` icon, "Rooms" title, active row count badge, permission-gated "Create Room" button
- **Banner:** Yellow `Alert` when `returnTo` is set — "Creating a room to complete an appointment? [Back to appointment →]" with TanStack `Link`
- **Status tabs:** Active (default) / All / Inactive — drives the `isActive` query param
- **DataTable columns:** Name (sortable), Type (badge with human labels), Branch, Capacity (right-aligned), Status, Actions
- **Type options:** consultation, group_session, private, training, individual
- **Create/edit sheet:** Name, Type (Select), Capacity (number), Branch (searchable combobox over hierarchy nodes where `type === "branch"`), Active checkbox (edit only)
- **Deactivate/Reactivate:** both via `client.rooms.update({ isActive })` (symmetric). No hard delete exposed anywhere
- **Branch name join:** client-side via `client.hierarchy.listNodes` → `Map<branchId, name>` memoized

## Appointment Modal Changes

- **Area dropdown** (lines 2256–2281, single-appointment mode only):
  ```tsx
  {rooms.length === 0 ? <DashedHintWithLink /> : <Select>...</Select>}
  ```
  Clicking the link calls `onClose()` and navigates to `/dashboard/rooms/view?returnTo=/dashboard/appointment/view`.
- **Employee select** (lines 2298–2313): `disabled={!newAppointment.roomId}` + `placeholder={employeePlaceholder}`
- **`employeePlaceholder` useMemo** (lines 382–386, co-located with other derived state):
  - no room selected → `"Select an area first"`
  - room selected, 0 employees → `"There are no employees available"`
  - otherwise → `"Select an employee"`
- **Multi-appointment mode (line ~1828) intentionally NOT touched** — deferred follow-up

## Seed Script Changes

```typescript
// Step 7: Seed default rooms (one per branch, idempotent)
const branches = await tenantDb.select().from(hierarchyNodes)
  .where(eq(hierarchyNodes.type, "branch"));
for (const branch of branches) {
  const existing = await tenantDb.select().from(rooms)
    .where(eq(rooms.branchId, branch.id)).limit(1);
  if (existing.length > 0) { /* skip */ continue; }
  await tenantDb.insert(rooms).values({
    name: `Main Room - ${branch.name}`,
    type: "training", capacity: 20, branchId: branch.id, isActive: true,
  });
}
```

---

## Permission Model

- Sidebar link gated by `appointment_management:read` — matches Appointments + Class Slots siblings
- Backend `rooms.ts` router enforces `appointments:read/create/update` on a **different** resource (pre-existing inconsistency documented in plan §8 Q5)
- Admin roles (priority >= 100) have BOTH resources, so the flow works. Non-admin custom roles granted only `appointment_management:*` would see the sidebar link and fail at the API — documented hazard, deferred cleanup

## Critical Decisions

- **No new permission resource** — `rooms_management` considered and rejected; reusing `appointment_management` avoids a permission-seed migration
- **Sheet-based, not dialog** — 5-field form matches `suppliers/view.tsx` + `promotions/view.tsx` pattern
- **Soft-deactivate, not hard-delete** — schema uses `onDelete: "restrict"` on `branchId`; `rooms.delete` API already sets `isActive: false` internally
- **Reactivate via `update({ isActive: true })`** — symmetric with deactivate, same API, explicit intent
- **Client-side branch name lookup** (plan §1.2 Option B) — kept backend untouched; avoids a service-layer join
- **Empty-state link, not modal-in-modal** — clicking "Create one →" closes the appointment modal rather than stacking
- **"Area" label kept** — rename to "Room" is out of scope (plan §8 Q4); would require coordinated changes across multi-appointment mode, tooltips, docs

---

## Verification Results

- **Type check** (`bun check-types`): 0 new errors introduced by any Phase 1–5 file. All reported errors are pre-existing (missing `bun:test` types in test files, pre-existing `undefined` inference issues in `context.ts` / `invitation.service.ts` / `member.service.ts`)
- **Lint** (`bun check` / Biome): 66 pre-existing warnings, 0 errors. None in the 5 files we modified
- **Route registration:** `apps/web/src/routeTree.gen.ts` regenerated with 13 references to `dashboard/rooms/view` — TanStack plugin picked up the new file
- **Build:** Not run — dev-mode expected. No code shared between web and server beyond existing packages

## Testing Handoff

Primary flow to verify in browser (`/chrome localhost:3001`):

1. Sign in as admin → **Business → Appointments → Rooms** → page loads
2. Create a room via the sheet → row appears, toast fires
3. Open Add Appointment in the calendar → Area dropdown is populated
4. Deactivate a room → moves to Inactive tab; reactivate → returns
5. With all rooms deactivated, open Add Appointment → dashed-border "Create one →" hint appears → click → lands on Rooms page with yellow banner

Edge cases:
- `returnTo` query param: banner renders, "Back to appointment →" link works
- Employee select: disabled until area chosen, placeholder cycles through three states correctly
- Multi-appointment mode: unchanged — deferred

Regression:
- Existing tenants with rooms: Add Appointment behaves identically
- Sidebar: all other nav items under Appointments still work

---

## Follow-ups (deferred)

1. **Multi-appointment mode empty-state** (line ~1828) — same inline "Create one →" pattern, scoped out of this phase
2. **Permission resource consolidation** — collapse `appointments` and `appointment_management` into one resource. Backend change: update `rooms.ts` 4 `requirePermission` calls to use `appointment_management`. Safe because admin already has both
3. **"Area" → "Room" terminology rename** — coordinated across `add-appointment-modal.tsx` (several labels/tooltips), multi-appointment area dropdown, E2E tests
4. **Native app rooms management** — currently admin-only web flow
5. **Room-to-trainer assignment** — Employee dropdown doesn't actually filter by room today; would need a `roomMembers` join table (plan §8 Q1 Option B)
6. **Run seed script on existing test tenants** — `cd apps/server && bun run scripts/seed-business-data.ts <orgId>` to backfill default rooms

---

## Rollback

Frontend-only change; fully reversible per phase:
- Phase 1: delete `rooms/` directories under `routes/` and `components/tables/`
- Phase 2: revert the single nav-item + import in `app-sidebar.tsx`
- Phase 3: revert the two edits in `add-appointment-modal.tsx` (ternary + placeholder)
- Phase 4: revert `seed-business-data.ts` diff
- Phase 5: docs-only

No DB migration, no API contract change, no data at risk.
 