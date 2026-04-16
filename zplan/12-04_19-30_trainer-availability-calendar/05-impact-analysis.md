# 5. Impact & Breakage Analysis

## Files Changed or Created

### New Files (6)

| File | Purpose |
|------|---------|
| `packages/db/src/schema/tenant/trainer-availability.ts` | Schema definition |
| `packages/services/src/trainer-availability.service.ts` | Service layer (CRUD) |
| `packages/api/src/routers/trainer-availability.ts` | oRPC router |
| `apps/web/src/components/trainers/trainer-availability-editor.tsx` | Availability editor UI |
| `apps/web/src/components/calendar/trainer-sidebar.tsx` | Trainer list sidebar |
| `packages/db/src/migrations/tenant/XXXX_trainer_availability.sql` | SQL migration |

### Modified Files (10)

| File | Change | Risk |
|------|--------|------|
| `packages/db/src/schema/tenant/index.ts` | Add `export * from "./trainer-availability"` | None — additive |
| `packages/services/src/index.ts` | Add 3 named exports from trainer-availability service | None — additive |
| `packages/api/src/routers/index.ts` | Add import + register in `baseRouter` + add `id` to `userContext` member type stub | Low — additive field to type |
| `apps/server/src/routers/auth.ts` | Add `id: member.id` to `userContext` response's `hierarchy.member` | Low — additive field, no callers break |
| `packages/services/src/appointment.service.ts` | Add `trainerId` to `ListAppointmentsParams` + filter condition | Low — additive, no existing callers pass this field |
| `packages/api/src/routers/appointments.ts` | Add `trainerId` to `list` input schema | Low — additive optional field |
| `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx` | Add availability collapsible section to edit sheet | Low — additive UI section |
| `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx` | Refactor layout: sidebar + calendar + role detection | **Medium** — structural change to existing page |
| `apps/web/src/components/calendar/appointment.tsx` | Add `defaultTrainerId` prop | Low — additive optional prop |
| `apps/web/src/components/calendar/add-appointment-modal.tsx` | Accept `defaultTrainerId` prop for pre-fill | Low — additive optional prop |

---

## Caller / Importer Analysis

### `userContext` (router) — Adding `id` to `hierarchy.member`

**Callers that consume `hierarchy.member`:**

| File | How it's used | Impact |
|------|---------------|--------|
| `apps/web/src/hooks/useUserContext.ts` | Returns the full userContext response. Consumers destructure `hierarchy.member.role`, `hierarchyScopeId`, etc. | None — adding a field doesn't break existing destructuring. |
| `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx` | **Will use** `hierarchy.member.id` in Phase 3 for trainer auto-filter | Requires this change |
| `apps/web/src/routes/` (various route files) | Access `hierarchy.member.role` for permission checks | None — additive field |
| `apps/native/` (mobile app) | May access `hierarchy.member` but doesn't use `id` | None — additive |

**Risk:** Zero. Adding a new field to a response object is fully backward-compatible.

---

### `appointments.list` (router) — Adding `trainerId` input

**Callers that send requests to this endpoint:**

| File | How it's called | Impact |
|------|-----------------|--------|
| `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx` | `client.appointments.list({ organizationId, startFrom, startTo, limit })` | **Will be modified** in Phase 3 to pass `trainerId` |
| `apps/web/src/components/calendar/appointment.tsx` | Does NOT call the API directly — receives `appointments` as prop | None |
| `apps/native/` (mobile app) | Uses `orpc.appointments.listForUser` (client view), NOT `appointments.list` | None |

**Risk:** Zero. Adding an optional field to an input schema is fully backward-compatible. Callers that don't pass `trainerId` get the same behavior as before (no filter applied).

### `listAppointments` (service function) — Adding `trainerId` param

**Direct callers:**

| File | Line | Impact |
|------|------|--------|
| `packages/api/src/routers/appointments.ts` | ~83 | The only caller. Will be updated to pass `trainerId`. |

**Risk:** Zero. The param is optional (`trainerId?: string`). Existing call without the field works identically.

### `ListAppointmentsParams` type — Adding field

**Files that reference this type:**

| File | How | Impact |
|------|-----|--------|
| `packages/services/src/appointment.service.ts` | Defines and uses | Modified |
| `packages/api/src/routers/appointments.ts` | Passes object matching this type | Implicitly compatible |

**Risk:** Zero. Adding an optional field to a type is backward-compatible.

### `AppointmentCalendar` component — Adding `defaultTrainerId` prop

**Files that render this component:**

| File | Impact |
|------|--------|
| `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx` | **Will pass** `defaultTrainerId` in Phase 3 |

**Risk:** Zero. The prop is optional. The existing render without it works unchanged.

### `AddAppointmentModal` component — Adding `defaultTrainerId` prop

**Files that render this component:**

| File | Impact |
|------|--------|
| `apps/web/src/components/calendar/appointment.tsx` | **Will pass** `defaultTrainerId` in Phase 3 |

**Risk:** Zero. Optional prop.

### Trainers view (`trainers/view.tsx`) — Adding availability section

**This is a leaf route component. No other files import from it.**

**Risk:** Low. Adding a collapsible section to the edit sheet. The form submit handler is unchanged — availability has its own save flow.

### Appointment view (`appointment/view.tsx`) — Layout restructure

**This is a leaf route component. No other files import from it.**

**Risk:** Medium. The layout is changing from single-column to two-column (sidebar + calendar). If the `AppointmentCalendar` component has any hardcoded width assumptions, they could break. Verified: the calendar uses `100%` width via CSS — it will fill whatever container it's in.

---

## Deployment Coupling

| Phase | Can Deploy Independently? | Notes |
|-------|---------------------------|-------|
| Phase 1 (DB + Backend) | **Yes** | New table + additive API changes. No frontend depends on the new fields yet. |
| Phase 2 (Trainers UI) | **No** — requires Phase 1 backend | Calls `trainerAvailability.list` and `.upsert` which must exist on the server. |
| Phase 3 (Appointment UI) | **No** — requires Phase 1 backend | Calls `appointments.list({ trainerId })` which must be deployed. |
| Phase 2 + Phase 3 | **Independent of each other** | Can deploy in any order after Phase 1. |

**Recommended deployment order:** Phase 1 → (Phase 2 and/or Phase 3 in any order)

---

## Nullable / Optional Field Assumptions

| Field | Nullable? | Assumption | Risk |
|-------|-----------|------------|------|
| `appointments.trainerId` | Yes (nullable UUID) | Appointments without a trainer will not appear when filtering by `trainerId`. This is correct — unassigned appointments should only show in "All Trainers" view. | None |
| `members.role` | Not null (text) | We check `role === "trainer"` for sidebar and auto-filter. If a member's role is changed from "trainer" to something else, their availability records remain in the DB but are orphaned. | Low — availability cascade-deletes on member deletion, but role changes don't clean up. Acceptable for now. |
| `userContext.hierarchy.member.role` | Could be undefined if member not found | The role check `isTrainer` must handle `undefined` gracefully. Code uses `memberRole === "trainer"` which is falsy when undefined → defaults to admin view. | None |
| `userContext.hierarchy.member.id` | Could be undefined | Used as `trainerId` for auto-filter. If undefined and `isTrainer` is true, the query would pass `undefined` as trainerId → no filter → shows all. This edge case shouldn't happen (if role exists, member exists). | Negligible |

---

## Return Type Changes

**None.** All modifications are additive:
- New optional input fields on existing procedures
- New optional props on existing components
- New procedures/components (no existing contracts changed)

---

## Blocking Prerequisites

| # | Prerequisite | Blocks | Resolution |
|---|-------------|--------|------------|
| 1 | `trainer_availability` migration must run before service/router can be tested | Phase 1 tasks 1.3–1.5 | Task 1.2 must complete first |
| 2 | Drizzle relations must be defined for `trainerAvailability` | `tenantDb.query.trainerAvailability.findMany()` | Task 1.6 |
| 3 | `member.id` must be exposed in `userContext` response | Phase 3 trainer auto-filter (`selectedTrainerId = memberId`) | Task 1.7 |
| 4 | `bun check-types` must pass after Phase 1 | Phase 2 and 3 development | Run after Phase 1 is complete |

No open questions remain — all decisions were confirmed during brainstorming.
