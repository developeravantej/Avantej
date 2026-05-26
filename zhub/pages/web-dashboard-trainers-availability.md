# Trainer Availability

**Route:** `/dashboard/trainers/availability`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/availability.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-26

---

## 1. What It Does

**Purpose (user perspective):** View and edit trainer availability schedules. Two sub-tabs rendered by `TrainerAvailabilityTab` (used as a tab panel in the parent page):
- **Recurring Availability** — weekly recurring slots per trainer shown in a day-of-week grid; click a trainer to open `TrainerAvailabilitySheet` for read/edit.
- **Intake Availability** — list of all trainers with a "Set Intake Schedule" button per row; opens `CoachIntakeEditor` for that trainer.

Trainers see only their own row; non-trainer roles see all trainers in accessible branches.

**Produces:** Sub-tab bar with `role="tablist"` / `role="tab"` ARIA attributes. Recurring tab: `WeeklyGrid` with coloured slot pills per day (Available/Blocked/Time Off), utilisation bar, and booked vs available hours. Intake tab: flat card list per trainer with "Set Intake Schedule" button. Clicking a trainer in the Recurring grid opens `TrainerAvailabilitySheet`; clicking "Set Intake Schedule" opens `CoachIntakeEditor`.

**On success:** `refetch()` is called from the sheet's `onSaved` prop after `TrainerAvailabilitySheet` saves; similarly passed to `AddExceptionDialog` and triggered after `CoachIntakeEditor` saves. Toast is handled inside each child component via `useApiMutation`.

**On failure / error states:**
- Loading: `<PageLoader/>` on the General tab.
- Error: `<StatusCallout variant="error" onRetry={refetch}/>`.
- Empty: `<StatusCallout variant="info"/>` with role-specific message.
- No organization: top-level `<StatusCallout/>` guard before any query runs.

---

## 2. How It Works

**Execution flow:**
```
TrainerAvailabilityTab
  → useUserContext() → organizationId, currentOrg
  → memberRole = hierarchy.member.role  (lowercased)
  → isTrainerRole = memberRole === "trainer"
  → callerMemberId = hierarchy.member.id  (MemberWithId helper type — id not on UserContextResponse)
  → useQuery(["trainerAvailabilityByBranch", orgId])
      → client.trainerAvailability.listByBranch({ organizationId })
  → useQuery(["trainerUtilisation", orgId, weekStart])
      → client.trainerAvailability.getUtilisation({ organizationId, weekStart })
  → allRows = useMemo: filter to callerMemberId when isTrainerRole
  → render sub-tab bar (role="tablist"):
      "Recurring Availability" | "Intake Availability"
  → subTab === "intake":
      flat card list of allRows; each row: avatar + name/spec + "Set Intake Schedule" button
      button → setCoachIntakeTrainer(row) + setCoachIntakeOpen(true) → <CoachIntakeEditor/>
  → subTab === "recurring":
      action bar (Block Time / Add Exception) — hidden for isTrainerRole
      <WeeklyGrid rows={allRows} utilisation={utilisationData}/>
        each row: trainer identity + utilisation bar + booked/available hours + day-of-week slot pills
        click trainer name or any day cell → setSelectedTrainer(row) + setSheetOpen(true)
  → <TrainerAvailabilitySheet
        trainer={selectedTrainer}
        open={sheetOpen}
        organizationId={organizationId}
        onSaved={() => refetch()}
    />
  → <AddExceptionDialog
        open={exceptionDialogOpen}
        defaultKind={exceptionDialogKind}
        onSuccess={() => refetch()}
    />
  → <CoachIntakeEditor open={coachIntakeOpen} trainer={coachIntakeTrainer} onSaved={() => {}}/>
```

**Inputs:** No route params or URL search. All state is derived from `useUserContext()` + local `useState`.

**State management:**
- TanStack Query: `trainerAvailabilityByBranch`, `trainerUtilisation`.
- Local `useState`:
  - `subTab: "recurring" | "intake"` — which sub-tab is active (default `"recurring"`).
  - `selectedTrainer` (`TrainerAvailabilityRow | null`), `sheetOpen` — for `TrainerAvailabilitySheet`.
  - `coachIntakeTrainer` (`TrainerAvailabilityRow | null`), `coachIntakeOpen` — for `CoachIntakeEditor`.
  - `exceptionDialogOpen`, `exceptionDialogKind: "timeoff" | "blocked"` — for `AddExceptionDialog`.
- Sub-tab is **not** URL-persisted (local state only); no TanStack Router search param.

**Outputs:** Sub-tab bar + conditional content per tab. Recurring: `WeeklyGrid` with slot pills, utilisation bars. Intake: flat trainer card list. Three child portals own their mutations: `TrainerAvailabilitySheet`, `CoachIntakeEditor`, `AddExceptionDialog`.

**Side effects:** `refetch()` (trainerAvailabilityByBranch) called after `TrainerAvailabilitySheet.onSaved` and after `AddExceptionDialog.onSuccess`. `CoachIntakeEditor` is passed `onSaved={() => {}}` (no-op currently).

---

## 3. What Depends On It

**Calls these API endpoints (typed `client`):**
- `client.trainerAvailability.listByBranch({ organizationId })` — returns `TrainerAvailabilityRow[]` (one per trainer in accessible branches, with embedded weekly `slots` including `kind`). Defined in `packages/api/src/routers/trainer-availability.ts`.
- `client.trainerAvailability.getUtilisation({ organizationId, weekStart })` — returns `UtilisationMap` keyed by trainerId with `availableHours`, `bookedHours`, `utilisationPct`. Drives the utilisation bar in each grid row.
- Child components also call (not directly from this file):
  - `TrainerAvailabilitySheet`: `trainerAvailability.upsert` — saves recurring slots with `kind` field; invalidates `["trainerAvailabilityByBranch", orgId]`.
  - `CoachIntakeEditor`: `coachIntake.listSlots`, `coachIntake.upsertSlots`, `coachIntake.getOpenSlots`, etc.
  - `AddExceptionDialog`: creates exceptions (blocked/time-off) for specific dates.

**Uses these components:**
- `TrainerAvailabilitySheet` — `apps/web/src/components/trainers/trainer-availability-sheet.tsx` — rebuilt with read/edit modes; receives `organizationId` and `onSaved` props; exports `type TrainerAvailabilityRow`.
- `CoachIntakeEditor` — `apps/web/src/components/trainers/coach-intake-editor.tsx`.
- `AddExceptionDialog` — `apps/web/src/components/calendar/add-exception-dialog.tsx`; fixed to sync `kind` state on programmatic open via `useEffect`.
- `StatusCallout` — error / empty / no-org states.
- `PageLoader` — loading state for both sub-tabs.
- lucide: `CalendarClock` (Intake button), `Plus` (Block Time / Add Exception buttons).
- **Inline sub-components:** `WeeklyGridRow`, `WeeklyGrid` — recurring availability grid with slot pills and utilisation bars; defined in the same file. No separate `IntakeTab` sub-component — intake content is rendered inline in the main return.

**Uses these hooks:**
- `useUserContext` — org id, current org hierarchy, member id, role.
- `useQuery` — `trainerAvailabilityByBranch`, `trainerUtilisation`.
- `useMemo` — `allRows` (role-filtered), `weekStart`.
- `useState` — sub-tab, sheet/editor/dialog open flags and selections.

**Navigation: who navigates here:**
- Sidebar (Scheduling section) — Trainer Availability link.

**Navigation: where it goes:** None outbound.

---

## 4. Data Shapes

**DB tables touched (server-side, via routers):**
| Table | Operation | Notes |
|-------|-----------|-------|
| `trainer_availability` | SELECT (and the sheet UPSERTs) | Recurring weekly slots: `{ trainerId, dayOfWeek, startTime, endTime, kind }`. `kind` ∈ `"available" | "blocked" | "timeoff"`. Schema in `packages/db/src/schema/tenant/trainer-availability.ts`. |
| `coach_intake_availability` | SELECT (editor UPSERTs) | Per-trainer per-day intake schedules. Schema in `packages/db/src/schema/tenant/coach-intake-availability.ts`. |
| `coach_intake_exceptions` | SELECT / INSERT / DELETE (via claim/unclaim) | Tracks claim/unclaim entries; `coach-intake-exceptions.ts`. |

**Key types:**
```typescript
// Imported from trainer-availability-sheet.tsx:
type TrainerAvailabilityRow = {
  trainerId: string; trainerName: string; trainerEmail: string | null;
  specialization?: string | null;
  slots: Array<{ id: string; dayOfWeek: string; startTime: string; endTime: string; kind?: string }>;
};

// Local to trainer-availability-tab.tsx:
type UtilisationMap = Record<
  string,
  { availableHours: number; bookedHours: number; utilisationPct: number }
>;

// Slot kind values (SlotKind in sheet component):
type SlotKind = "available" | "blocked" | "timeoff";

// Pill colour mapping: available → green, blocked → red, timeoff → amber

const DAY_COLUMNS = [
  { key: "monday",    label: "Mon" }, { key: "tuesday", label: "Tue" }, { key: "wednesday", label: "Wed" },
  { key: "thursday",  label: "Thu" }, { key: "friday",  label: "Fri" }, { key: "saturday",  label: "Sat" },
  { key: "sunday",    label: "Sun" },
];
```

---

## 5. Tests

**Test files:** None found for this route.

**Not tested (risk areas):**
- Role-based row filtering (trainer sees only own row via `callerMemberId` match).
- `WeeklyGridRow` `slotsByDay` memoization correctness when `slots` reference changes.
- Empty / error / loading states on both sub-tabs.
- Sub-tab switching does not reset `sheetOpen` — if the sheet is open on Recurring and user switches to Intake, the sheet stays mounted (but `trainer` would be stale if refetched).
- `CoachIntakeEditor` is passed `onSaved={() => {}}` — intake data does not refetch after a save.
- `TrainerAvailabilitySheet` `kind` field: the sheet always sends `kind` in the upsert payload; if the API does not yet store it, data would be silently ignored.
- `AddExceptionDialog` programmatic-open `kind` sync: the `useEffect` fix ensures `kind` matches `defaultKind` on open, but has not been tested in all close/reopen sequences.

---

## 6. Notes

- **`TrainerAvailabilityTab` is a component, not a route** — it renders as a tab panel inside the parent page; the actual route file simply includes it.
- **Sub-tabs are not URL-persisted** — `subTab` is local `useState("recurring")`; switching tabs does not update the URL. If deep-linking to "intake" matters, hoist `subTab` to the route's `validateSearch`.
- **Role narrowing:** `hierarchy.member.id` is not in the generated `UserContextResponse` type; the file uses a local `MemberWithId` helper type (`NonNullable<typeof currentOrg>["hierarchy"]["member"] & { id?: string }`) to avoid an `any` cast.
- **`TrainerAvailabilitySheet` rebuilt (2026-05-26):** now has read/edit mode toggle within the sheet. Read mode shows existing slots per day. Edit mode shows per-slot HH:MM time inputs, `kind` select (Available/Blocked/Time Off), delete button, and "+ Add window" per day. Saves via `trainerAvailability.upsert` which always includes the `kind` field. Accepts new `organizationId: string | null` and `onSaved?: () => void` props. `handleOpenChange` resets edit state on close.
- **`AddExceptionDialog` fix (2026-05-26):** added `useEffect(() => { if (open) setKind(defaultKind); }, [open, defaultKind])` so programmatic opens correctly sync `kind` state from `exceptionDialogKind`.
- **`CoachIntakeEditor` `onSaved` is a no-op** — the intake sub-tab does not currently refetch after the editor saves. This means the Intake list will not reflect changes until a page reload or manual refetch.
- The `trainerAvailabilityByBranch` query response is cast (`as TrainerAvailabilityRow[]`) because the typed client return shape does not yet fully match the consumer type.
- Intake content is rendered inline in the main `TrainerAvailabilityTab` return (no separate `IntakeTab` sub-component). `WeeklyGridRow` and `WeeklyGrid` are also inline sub-components in the same file.
