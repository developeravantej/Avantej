# Appointment Creation — Blocker Investigation

_Date: 2026-04-17 · Branch: `Customer-app`_

---

## Problem Summary

When admin tries to create a new appointment via `/dashboard/appointment/view` → "Add Appointment":

- Form loads correctly (customer dropdown, services dropdown work)
- **Area dropdown opens but shows ZERO options** → required field can't be filled
- **Employee dropdown shows "There are no employees available"** → required field can't be filled
- **Create Appointment button stays disabled**

---

## Root Cause

The **Area field is populated from `rooms.list` API**, which returns an empty array `[]` for the test org. No rooms in the DB = no areas selectable = Create button never enables.

### API Evidence

```
POST /rpc/rooms/list      → 200 OK, returns []             ← BLOCKER
POST /rpc/members/list    → 200 OK, returns 3 trainers      ← works (Alex Wong, Maya Krishnan, Daniel Tan)
POST /rpc/services/list   → 200 OK, returns 9 services      ← works
POST /rpc/appointments/list → 200 OK, returns 2 appointments ← works
```

### Cascading Effect

```
Area * (required) ← rooms.list() → []
    ↓ no options to select
Employee field depends on selected Area → "There are no employees available"
    ↓
Create Appointment button → disabled
```

---

## Why There Are No Rooms

The `rooms.create` API procedure exists at `packages/api/src/routers/rooms.ts` (line 82), but **there is no UI page to manage rooms**. No route under `apps/web/src/routes/_authenticated/dashboard/_layout/` handles rooms CRUD. The only way to create rooms is via direct API calls.

### Rooms Schema (required fields)

```typescript
{
  organizationId: uuid,
  name: string,
  type: "consultation" | "group_session" | "private" | "training" | "individual",
  capacity: number (>=1),
  branchId: uuid,
  isActive?: boolean
}
```

---

## Workaround Used During Testing

Created a room directly via API from browser console:

```javascript
await fetch("http://localhost:3000/rpc/rooms/create", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: {
    organizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
    name: "Studio A",
    type: "training",
    capacity: 10,
    branchId: "0ca11a66-261e-47f2-8fc7-236149b888c9",  // Tenant Test Fitness Franchise Branch
  }})
});
```

After running this, the Area dropdown populated with "Studio A" and the user confirmed appointment creation worked.

---

## TODO — Fix Properly

### Priority: High

- [ ] **Build a Rooms management page** at `/dashboard/rooms/view` (or similar)
  - List all rooms for the org (filter by branch optional)
  - Create: name, type, capacity, branch (dropdown of hierarchy branches), active toggle
  - Edit: same fields
  - Deactivate/delete
- [ ] **Add "Rooms" link to sidebar** — under the Branches section or a new "Facilities" group
- [ ] **Add permission**: `rooms_management:read`, `rooms_management:create`, etc. (or reuse `appointment_management`)
- [ ] **Seed rooms for test orgs** — add a seed script or migration that creates at least 1 default room per branch so new test environments don't hit this blocker

### Priority: Medium

- [ ] **Improve empty-state UX in the appointment form**
  - If `rooms.list` returns empty, show an inline message: "No rooms available. [Create one →]"
  - Link to the Rooms management page
- [ ] **Employee dropdown "There are no employees available"** message
  - Verify this message is only shown when no Area is selected OR when the selected Area has no assigned staff
  - Consider distinguishing these two states in the UI

### Priority: Low

- [ ] **Rename "Area" to "Room"** throughout the appointment form if that's what users expect
  - Currently labeled "Area" in UI but backed by the `rooms` table
  - Pick one term and use it consistently

---

## Related Files

- `packages/api/src/routers/rooms.ts` — API router (list, create, update, delete all exist)
- `packages/services/src/rooms.service.ts` — Service layer
- `packages/db/src/schema/tenant/rooms.ts` — Schema definition
- `apps/web/src/components/appointments/add-appointment-dialog.tsx` (or similar) — Form with Area field
- `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx` — Appointment calendar page

---

## Test Case Verified

After creating Studio A:
1. Reloaded `/dashboard/appointment/view`
2. Clicked "Add Appointment"
3. Selected customer Sarah Lim
4. Selected service Boxing Fitness (60 min)
5. Area dropdown now shows Studio A → selectable
6. Employee dropdown populates with trainers assigned to the area
7. Create Appointment button becomes enabled
8. Appointment created successfully ✅
