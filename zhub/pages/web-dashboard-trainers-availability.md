# Trainer Availability

**Route:** `/dashboard/trainers/availability`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/availability.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** View and (for trainers, in some flows) edit weekly availability schedules. Two tabs:
- **General Schedule** — recurring weekly availability per trainer; click a trainer to open a slide-over editor.
- **Intake Availability** — coach-intake schedules with claim/unclaim of open slots and an editor for the schedule itself.

Trainers see only their own row; non-trainer roles see all trainers in branches they can access.

**Produces:** Tabbed page with two day-of-week × trainer tables. Slots are rendered as inline chips per day. Clicking a trainer name opens the relevant editor sheet. Intake rows additionally support claiming / unclaiming specific open slots via a confirmation dialog.

**On success:** Underlying queries refetch (`refetchIntake`); editor sheet closes; toast handled inside the editor/claim dialog components.

**On failure / error states:**
- Loading: `<PageLoader/>` on the General tab.
- Error: `<StatusCallout variant="error" onRetry={refetch}/>`.
- Empty: `<StatusCallout variant="info"/>` with role-specific message.
- No organization: top-level `<StatusCallout/>` guard before any query runs.

---

## 2. How It Works

**Execution flow:**
```
TrainerAvailabilityPage
  → useUserContext() → organizationId, currentOrg
  → memberRole = hierarchy.member.role  (lowercased)
  → isTrainerRole = memberRole === "trainer"
  → callerMemberId = hierarchy.member.id  (cast via MemberWithId helper type — id isn't on UserContextResponse)
  → useQuery(["trainerAvailabilityByBranch", orgId])
      → client.trainerAvailability.listByBranch({ organizationId })
  → useQuery(["coachIntakeByBranch", orgId])
      → client.coachIntake.listByBranch({ organizationId })
  → rows = useMemo: filter to caller's trainerId when isTrainerRole
  → slotsByTrainerByDay = useMemo: Map<trainerId, Map<dayOfWeek, slots[]>>; slots sorted by startTime
  → render Tabs:
      - "general": table of trainer × DAY_COLUMNS; click trainer → openSheetFor(row)
      - "intake": <IntakeTab/> (inline sub-component); click trainer → opens CoachIntakeEditor; claim/unclaim → CoachIntakeClaimDialog
  → <TrainerAvailabilitySheet/> portal for general schedule editor
  → <CoachIntakeEditor/> portal for intake editor
  → <CoachIntakeClaimDialog/> portal for claim/unclaim
```

**Inputs:** No route params or URL search. All state is derived from `useUserContext()` + local `useState`.

**State management:**
- TanStack Query: `trainerAvailabilityByBranch`, `coachIntakeByBranch`.
- Local `useState`:
  - `selectedTrainer` (`TrainerAvailabilityRow | null`), `sheetOpen` — for the general schedule editor.
  - `intakeEditorTrainer` (`{ trainerId, trainerName } | null`), `intakeEditorOpen` — for the intake editor.
  - `claimDialog` — `{ mode: "claim"|"unclaim", trainerId, trainerName, date, startTime, endTime, exceptionId?, existingReason? } | null`.
- Uses TanStack `Tabs` (`defaultValue="general"`).

**Outputs:** Two read-only tables + three child portals (sheet, editor, claim dialog) that own their mutations.

**Side effects:** `refetchIntake()` after editor save and after claim/unclaim succeed.

---

## 3. What Depends On It

**Calls these API endpoints (typed `client`):**
- `client.trainerAvailability.listByBranch({ organizationId })` — returns `TrainerAvailabilityRow[]` (one row per trainer in accessible branches, with embedded weekly `slots`). Defined in `packages/api/src/routers/trainer-availability.ts`.
- `client.coachIntake.listByBranch({ organizationId })` — returns intake schedule rows per trainer (`slots: [{ dayOfWeek, startTime, endTime }]`, plus `hasOpenSlots`). Defined in `packages/api/src/routers/coach-intake.ts`.
- Child components additionally call `coachIntake.listSlots`, `coachIntake.upsertSlots`, `coachIntake.getOpenSlots`, `coachIntake.claimSlot`, `coachIntake.unclaimSlot`, `coachIntake.listExceptions` (see `coach-intake.ts`).

**Uses these components:**
- `PageHeader` (`@/components/ui/page-header`) — title + icon + description.
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` — shadcn (TanStack-router-independent).
- `Table` / `TableHeader` / `TableRow` / `TableHead` / `TableBody` / `TableCell` — shadcn.
- `StatusCallout` — error / empty / no-org states.
- `PageLoader` — General tab loading.
- `TrainerAvailabilitySheet` — `apps/web/src/components/trainers/trainer-availability-sheet.tsx` (also exports `type TrainerAvailabilityRow`).
- `CoachIntakeEditor` — `apps/web/src/components/trainers/coach-intake-editor.tsx`.
- `CoachIntakeClaimDialog` — `apps/web/src/components/trainers/coach-intake-claim-dialog.tsx`.
- lucide: `CalendarRange`.
- **Inline sub-component:** `IntakeTab` — renders the intake schedule table with day-of-week chips; defined in the same file (lines 52–177).

**Uses these hooks:**
- `useUserContext` — org id, current org hierarchy, member id, role.
- `useQuery` — both list queries.
- `useMemo` — `rows` (role-filtered), `slotsByTrainerByDay`.
- `useState` — sheet/editor/dialog open flags and selections.

**Navigation: who navigates here:**
- Sidebar (Scheduling section) — Trainer Availability link.

**Navigation: where it goes:** None outbound.

---

## 4. Data Shapes

**DB tables touched (server-side, via routers):**
| Table | Operation | Notes |
|-------|-----------|-------|
| `trainer_availability` | SELECT (and the editor sheet UPDATEs/INSERTs) | Recurring weekly slots: `{ trainerId, dayOfWeek, startTime, endTime, ... }`. Schema in `packages/db/src/schema/tenant/trainer-availability.ts`. |
| `coach_intake_availability` | SELECT (editor UPSERTs) | Per-trainer per-day intake schedules. Schema in `packages/db/src/schema/tenant/coach-intake-availability.ts`. |
| `coach_intake_exceptions` | SELECT / INSERT / DELETE (via claim/unclaim) | Tracks claim/unclaim entries; `coach-intake-exceptions.ts`. |

**Key types:**
```typescript
// Imported from the sheet component, re-used here:
type TrainerAvailabilityRow = {
  trainerId: string; trainerName: string; trainerEmail: string | null;
  slots: Array<{ id: string; dayOfWeek: string; startTime: string; endTime: string; ... }>;
};

// Local to the route:
type IntakeRow = {
  trainerId: string; trainerName: string; trainerEmail: string;
  slots: Array<{ dayOfWeek: string; startTime: string; endTime: string }>;
  hasOpenSlots: boolean;
};

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
- Role-based row filtering (trainer sees only own row).
- `slotsByTrainerByDay` memoization correctness on data changes.
- Empty / error / loading states.
- Tab switching state isolation (e.g., closing the editor on tab change).
- Claim/unclaim happy-path + permission failures.

---

## 6. Notes

- **New route (May 2026):** Replaces or augments older per-page trainer schedule UIs by colocating the two related concepts (general schedule + intake) under one tabbed page.
- **Role narrowing:** `hierarchy.member.id` is not in the generated `UserContextResponse` type, so the file uses a local `MemberWithId` helper type (`NonNullable<typeof currentOrg>["hierarchy"]["member"] & { id?: string }`) to avoid an `any` cast.
- **`IntakeTab` is inline** — it's defined in the same file (not yet promoted to `@/components/trainers/`). The intake editor and claim dialog ARE separate files. Consider extracting `IntakeTab` if it grows.
- The General tab `useQuery` casts the response (`as TrainerAvailabilityRow[]`) because the typed client return shape doesn't yet match the consumer type exactly.
- Tabs UI uses shadcn `Tabs` (string state), not TanStack Router search params — switching tabs is **not** URL-persisted. If deep-linking to "intake" matters, hoist tab state to the route's `validateSearch`.
- `CoachIntakeEditor` is always mounted (even when no trainer is selected, with empty-string ids) — its `open` flag gates the actual sheet display.
