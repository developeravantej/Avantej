# Availability Tab — Component Map

**Route:** `/dashboard/trainers/view?tab=availability`
**Traced:** 2026-05-25
**Source of truth:** post-refactor files (hub doc describes a richer planned version that was partially dropped)

---

## 1. Entry Point

**`apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx`** (line 68–104)

- `validateSearch` extracts `tab` (default `"trainers"`).
- When `tab === "availability"`, renders the page shell (header + pill tabs) and mounts `<TrainerAvailabilityTab />`.
- `beforeLoad` calls `requirePermission("user_management:read")` — this gate applies to all three tabs.

---

## 2. Redirect Stub

**`apps/web/src/routes/_authenticated/dashboard/_layout/trainers/availability.tsx`** (all 13 lines)

- Throws `redirect({ to: "/dashboard/trainers/view", search: { tab: "availability" } })` in `beforeLoad`.
- `component: () => null` — nothing renders here.
- Verified: redirect is unconditional and happens server-side (before any render). Old bookmark `/dashboard/trainers/availability` lands correctly at the new URL.

---

## 3. TrainerAvailabilityTab

**`apps/web/src/components/pages/trainers/trainer-availability-tab.tsx`**

### 3a. Context & role detection (lines 315–330)
```
useUserContext()
  → organizationId (null guard on line 373)
  → currentOrg.hierarchy.member.role  → memberRole (lowercased)
  → MemberWithId helper type cast → callerMemberId
  → isTrainerRole = (memberRole === "trainer")
```
`MemberWithId` is a local cast to avoid a type error because `id` is not in the official `UserContextResponse` type (known limitation, same pattern as the old page).

### 3b. State (lines 332–340)
| State var | Type | Purpose |
|---|---|---|
| `exceptionDialogOpen` | `boolean` | AddExceptionDialog open flag |
| `exceptionDialogKind` | `"timeoff" \| "blocked"` | Pre-selects kind when dialog opens |
| `selectedTrainer` | `TrainerAvailabilityRow \| null` | Trainer passed to the sheet |
| `sheetOpen` | `boolean` | Sheet open flag |
| `weekStart` | `string` (memo) | Current week's Monday as YYYY-MM-DD |

### 3c. Queries

**Query 1 — Weekly availability grid (lines 342–351)**
```
queryKey: ["trainerAvailabilityByBranch", organizationId]
queryFn:  client.trainerAvailability.listByBranch({ organizationId })
enabled:  !!organizationId
```
Returns `TrainerAvailabilityRow[]` cast. No `branchId` filter — returns all trainers across accessible branches.

**Query 2 — Utilisation data (lines 353–363)**
```
queryKey: ["trainerUtilisation", organizationId, weekStart]
queryFn:  client.trainerAvailability.getUtilisation({ organizationId, weekStart })
enabled:  !!organizationId
```
Returns `UtilisationMap = Record<trainerId, { availableHours, bookedHours, utilisationPct }>`.

### 3d. Row filtering (lines 365–371)
When `isTrainerRole === true` and `callerMemberId` is non-null, `allRows` is filtered to only the row where `r.trainerId === callerMemberId`. Non-trainer roles see all rows.

### 3e. Render states
| Condition | Render |
|---|---|
| `!organizationId` | `<StatusCallout variant="info" title="No organization">` |
| `isLoading` | `<PageLoader />` |
| `isError` | `<StatusCallout variant="error" title="Couldn't load trainer availability" onRetry={refetch}>` |
| `allRows.length === 0` | `<StatusCallout variant="info">` — message differs by `isTrainerRole` |
| Otherwise | `<WeeklyGrid>` inside overflow-x-auto, min-width 900px |

### 3f. Action buttons (lines 385–410)
Both buttons are **only rendered when `!isTrainerRole`** (line 385).

- **Block Time** → sets `exceptionDialogKind = "blocked"`, opens dialog
- **Add Exception** → sets `exceptionDialogKind = "timeoff"`, opens dialog

---

## 4. WeeklyGrid + WeeklyGridRow

**`trainer-availability-tab.tsx` (lines 91–311)**

`WeeklyGrid` renders a CSS-grid header row (Trainer + Mon–Sun columns) then maps `rows` → `WeeklyGridRow`.

`WeeklyGridRow` (lines 91–246):
- Builds `slotsByDay` map via `useMemo` from `row.slots`.
- Trainer cell (left 220 px): avatar initials + name + specialization/email + utilisation bar + booked/avail hours.
- **Utilisation bar** (lines 162–176): rendered only if `util` from `utilisationData` is non-null. Bar width = `Math.min(pct, 100)%`. Color logic:
  - `pct > 90` → `bg-red-400`
  - `60 <= pct <= 90` → `bg-amber-400`
  - `pct < 60` → `bg-emerald-400`
- Seven day cells: clicking either the trainer cell or any day cell calls `onOpenSheet(row)`.
- Day cell: "Off" chip if no slots; otherwise slot pills with `slotPillClasses(kind)`:
  - `available` → `bg-[#d1fae5] text-[#065f46]` (green)
  - `blocked` → `bg-red-100 text-red-700`
  - `timeoff` → `bg-amber-100 text-amber-700`

Grid footer: legend row (Available / Blocked / Time Off chips).

**Utilisation bar shows `—%` and no bar fill when `utilisationData` does not contain an entry for that trainer** (i.e., the utilisation query is still loading or the trainer has no appointments).

---

## 5. TrainerAvailabilitySheet

**`apps/web/src/components/trainers/trainer-availability-sheet.tsx`**

A **read-only** slide-over (shadcn `Sheet`, right side, `sm:max-w-md`). It:
- Displays trainer name + email in the header.
- Lists each day of the week (Mon–Sun) with a card showing time windows as color-coded chips.
- Sorts slots by `startTime` per day.
- Has **no edit/save functionality** — it is purely a display sheet.

**Risk:** The hub doc described the sheet as an "editor" that allows modifying the weekly schedule. The current implementation only displays. No mutation calls, no form inputs.

---

## 6. AddExceptionDialog

**`apps/web/src/components/calendar/add-exception-dialog.tsx`**

A shadcn `Dialog`. Props: `open`, `onOpenChange`, `organizationId`, `preselectedTrainerId?`, `preselectedTrainerName?`, `defaultKind?`, `onSuccess?`.

**When opened from `TrainerAvailabilityTab`:** no trainer is pre-selected, so it shows a trainer dropdown. The dropdown fetches `client.trainerAvailability.listByBranch` (same queryKey — cache hit).

**Fields:** Trainer selector (when not pre-selected), Kind radio (timeoff / blocked), Date picker, Reason textarea (optional).

**Submit condition:** `canSubmit = !!effectiveTrainerId && !!date` (line 101).

**Mutation:** `client.trainerAvailability.addException({ organizationId, trainerId, date, kind, reason })` → writes to `trainer_availability_exceptions` table.

**On success:** invalidates `["trainerExceptions", organizationId, effectiveTrainerId]` and `["trainerAvailabilityByBranch", organizationId]`, then calls `onSuccess()` which calls `refetch()` in the parent. Dialog state resets (date, reason, optionally trainerId).

**Syncs `kind` to `defaultKind` on every re-open** (line 97).

**Duplicate exception guard:** Server returns `CONFLICT` error with message "An exception already exists for this trainer on this date." — not caught distinctly in the dialog; `useApiMutation` shows it as a generic error toast.

---

## 7. API Layer

**`packages/api/src/routers/trainer-availability.ts`**

Relevant procedures for this tab:

| Procedure | Input | Guard | DB op |
|---|---|---|---|
| `listByBranch` | `organizationId`, `branchId?` | `assertOrgContextMatch`, `guardBranchAccessible` (if branchId) | SELECT from `trainer_availability` + cross-DB user lookup |
| `getUtilisation` | `organizationId`, `branchId?`, `weekStart` | `assertOrgContextMatch`, `guardBranchAccessible` (if branchId) | SELECT `trainer_availability` + `appointments` |
| `addException` | `organizationId`, `trainerId`, `date`, `kind`, `reason?` | `assertOrgContextMatch`, `requirePermissionOrpc("appointment_management", "update")` | INSERT `trainer_availability_exceptions` |

**Note:** The tab calls `listByBranch` without `branchId`, so the service returns trainers across ALL branches the org has (no branch-level scoping from the tab itself). RBAC scoping for trainers only happens via `isTrainerRole` on the client.

---

## 8. Service Layer

**`packages/services/src/trainer-availability.service.ts`**

- `listTrainerAvailabilityByBranch`: fetches active `role="trainer"` members, batch-fetches availability slots, cross-DB resolves names/emails from control panel `user` table.
- `getTrainerUtilisation`: sums recurring slot minutes for available hours; sums `appointments.duration` (confirmed/completed only) for booked hours; computes `utilisationPct`.
- `addTrainerAvailabilityException`: INSERTs into `trainer_availability_exceptions`; unique constraint `trainer_availability_exc_trainer_date_uniq` prevents duplicate (trainerId, date) pairs.

---

## 9. DB Tables Touched

| Table | Schema file | Operations from this tab |
|---|---|---|
| `trainer_availability` | `packages/db/src/schema/tenant/trainer-availability.ts` | SELECT (list + utilisation) |
| `trainer_availability_exceptions` | same file | INSERT (addException) |
| `appointments` | `packages/db/src/schema/tenant/appointments.ts` | SELECT (utilisation calc) |
| `members` | `packages/db/src/schema/tenant/members.ts` | SELECT (trainer filter) |
| `member_profiles` | `packages/db/src/schema/tenant/member-profiles.ts` | LEFT JOIN for specialization |
| `user` (control panel) | `packages/db/src/schema/auth.ts` | SELECT name + email |

---

## 10. What Is MISSING vs. Hub Doc

The hub doc (`web-dashboard-trainers-availability.md`) describes a version with **two sub-tabs**: "General Schedule" and "Intake Availability". The current `TrainerAvailabilityTab` has:

- **General Schedule table**: PRESENT (the `WeeklyGrid`)
- **Intake Availability sub-tab**: ABSENT — no `coachIntake` query, no `CoachIntakeEditor`, no `CoachIntakeClaimDialog`, no `IntakeTab` sub-component
- **TanStack `Tabs` component**: ABSENT — no sub-tab switching UI at all
- **Sheet edit functionality**: ABSENT — `TrainerAvailabilitySheet` is read-only; hub doc described it as an editor

**Coach-intake components DO exist in the codebase:**
- `apps/web/src/components/trainers/coach-intake-editor.tsx` — exists
- `apps/web/src/components/trainers/coach-intake-claim-dialog.tsx` — exists
- `packages/api/src/routers/coach-intake.ts` — exists

These components were not wired into the new tab. The refactor extracted only the General Schedule portion.
