## Agent: B (Phase 2 — Sidebar)
**Completed:** 2026-04-17T00:00:00Z

### What I Did
- apps/web/src/components/app-sidebar.tsx: Added `DoorOpen` to the lucide-react import block (alphabetically between `DollarSign` and `Eye`). Inserted a "Rooms" nav item `{ title: "Rooms", url: "/dashboard/rooms/view", icon: DoorOpen, permission: "appointment_management:read" }` into the Appointments collapsible group, after "Class Slots" and before "Package Instances".

### Decisions Made
- Used `DoorOpen` icon as specified in the plan — appropriate semantic choice for a rooms/physical space feature.
- Placed the item exactly as specified: after Class Slots, before Package Instances.
- Assigned `permission: "appointment_management:read"` consistent with sibling items.

### Issues Encountered
- First Edit tool attempt failed due to tab vs. space indentation mismatch in the old_string. Resolved by using a Node.js script to match the exact tab-indented string and perform the replacement.

---
## Agent: D (Phase 4 — Seed Rooms)
**Completed:** 2026-04-17T10:46:00Z

### What I Did
- apps/server/scripts/seed-business-data.ts: Added `hierarchyNodes` and `rooms` to the named import from `@avantej-core/db/schema/tenant/index`. Added `eq` import from `drizzle-orm`. Inserted Step 7 block after the package instance step (Step 6) and before the SUMMARY section — queries all branch nodes, skips any branch that already has at least one room, and inserts `Main Room - {branch.name}` with type `training`, capacity 20, `isActive: true`.

### Decisions Made
- Imported `hierarchyNodes` from `@avantej-core/db/schema/tenant/index` (not the fallback individual file) because the index exports it via `export * from "./hierarchy"` (line 8 of index.ts).
- Used `eq` from `drizzle-orm` for the `.where()` clauses in the new select queries; the existing script uses inline `{ eq: eqFn }` via the query builder API which is not available in the select builder syntax.
- Matched the existing `tenantDb` variable name exactly as used throughout the script.

### Issues Encountered
- None

---
## Agent: A (Phase 1 — Rooms Page)
**Completed:** 2026-04-17T10:55:00Z

### What I Did
- `apps/web/src/components/tables/rooms/view/columns.tsx`: Created `RoomRow` type, `TYPE_LABELS` map, and `createColumns(meta)` factory. Columns: Name (sortable), Type (badge), Branch (muted text), Capacity (right-aligned), Status (Active/Inactive badge), Actions (Edit + Deactivate/Reactivate conditional on `isActive`).
- `apps/web/src/components/tables/rooms/view/data-table.tsx`: Created DataTable component using `@tanstack/react-table`. Includes name filter input, pagination, and two confirmation Dialogs (deactivate + reactivate). Actions are passed via props; confirmations are handled internally with toast feedback.
- `apps/web/src/routes/_authenticated/dashboard/_layout/rooms/view.tsx`: Created the main rooms page. Includes: yellow `Alert` banner for `returnTo` query param with TanStack `Link`; header with `DoorOpen` icon, badge count, "Create Room" button (permission-gated); Active/All/Inactive status tabs; DataTable; inline Sheet with BranchCombobox (copied from stock-requests pattern), Select for type (5 options), number input for capacity, checkbox Active toggle (edit only). Four mutations: create, update, deactivate, reactivate — all use `orpc.rooms.list.key()` for invalidation and `toast.success`/`toast.error`.

### Decisions Made
- Used inline Sheet form (not a separate form component file) — matches stock-requests/view.tsx pattern which is the cleanest example for a multi-field form with branch combobox.
- `BranchCombobox` defined as a module-level component inside view.tsx (same file, not extracted) — avoids prop-drilling `branches` and keeps the form self-contained, same approach as stock-requests.
- Used `useState` from React for form state (no react-hook-form) — consistent with existing CRUD pages in this project.
- `Link to={returnTo}` with dynamic string — confirmed this pattern works in the codebase (app-sidebar.tsx uses `Link to={item.url}` where url is a string). No type error produced.
- Deactivate/reactivate confirmation dialogs are in the DataTable component, not the page — consistent with the suppliers pattern where deactivate dialog lives in data-table.tsx.

### Issues Encountered
- None — `bun check-types` passes with no web-related errors after all three files were created.

---
## Agent: C (Phase 3 — Modal Empty-State & Employee Placeholder)
**Completed:** 2026-04-17T11:10:00Z

### What I Did
- `apps/web/src/components/calendar/add-appointment-modal.tsx`:
  - **Line 1**: Added `useMemo` to the React import (`import React, { useMemo } from "react"`)
  - **Line 15**: Added `import { Link } from "@tanstack/react-router"` after the Tooltip import
  - **Lines 382–386**: Added `employeePlaceholder` useMemo after the second `useEffect` block (line 380), before `handleInputChange`. Depends on `newAppointment.roomId` and `employees.length`.
  - **Lines 2256–2281** (Task 3.1): Replaced the rooms `<Select>` with a ternary — when `rooms.length === 0`, renders a dashed-border hint div with a `Link` to `/dashboard/rooms/view?returnTo=/dashboard/appointment/view` that calls `onClose()` on click; otherwise renders the original `<Select>`.
  - **Lines 2298–2313** (Task 3.2): Updated the Employee `<Select>` — added `disabled={!newAppointment.roomId}` and changed placeholder to `{employeePlaceholder}`.

### Decisions Made
- Placed `employeePlaceholder` useMemo after the two `useEffect` blocks (line 380) rather than near `employees` derivation (line 188), because `newAppointment` state (which `useMemo` depends on) is only defined at line 337. Placing it earlier would be a hoisting violation.
- Both `useMemo` and `Link` were not previously imported; added them without removing anything existing.
- Did NOT touch the multi-appointment mode Area/Employee dropdowns (around line 1828) — deliberate per plan §8.

### Issues Encountered
- None. TypeScript check (`npx tsc --noEmit`) produced no errors.

---
## Agent: E (Phase 5 — Hub Docs)
**Completed:** 2026-04-17T11:25:00Z

### What I Did
- `zhub/pages/web-dashboard-rooms-view.md`: **Created.** Full page doc following the suppliers-view template: Purpose, execution flow, API calls, components, hooks, DB table touch points, `RoomRow` / `RoomFormState` type shapes, and a dedicated "Notes & Gotchas" section documenting the `appointments` vs `appointment_management` resource split (plan §8 Q5), soft-delete semantics, client-side branch-name join, empty-branches state, inline `BranchCombobox`, and the seed script entry point.
- `zhub/index.md`: **Modified.** Added a new row under the "Appointments" table pointing to `pages/web-dashboard-rooms-view.md` with route `/dashboard/rooms/view`. Bumped the "Web — Dashboard Pages" count from 42 → 43 and updated "Last updated" to 2026-04-17.
- `zhub/pages/web-dashboard-appointment-view.md`: **Modified.** Added a new "## 7. Recent Changes (2026-04-17 — Rooms Management)" section documenting (a) the new Area dropdown empty-state link with `onClose()` + `returnTo` behavior, (b) the contextual `employeePlaceholder` useMemo logic and disabled state, (c) the deferred multi-appointment mode follow-up near line 1828. Bumped the page's "Last updated" to 2026-04-17.

### Decisions Made
- Used the suppliers-view template heading hierarchy (1. What It Does, 2. How It Works, 3. What Depends On It, 4. Data Shapes, 5. Tests, 6. Notes & Gotchas) rather than walk-in-customers' slightly different structure — suppliers is the closest match for the "Active/All/Inactive tabs + soft-delete + sheet form" pattern.
- Put the "Recent Changes" block as a new top-level section (§7) on the appointment-view doc rather than folding into the existing "Notes" bullet list — the changes were substantive enough to warrant their own section and this mirrors the existing hub convention of timestamped, scoped change sections.
- Did not add the Rooms page to index.md's "Known Issues Surfaced During Documentation" table — the permission-resource split is a pre-existing codebase hazard, not a bug introduced by this feature, and it's already documented in the plan + page doc.

### Issues Encountered
- None.

---
