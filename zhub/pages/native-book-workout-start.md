# Book Workout - Setup Screen

**Route:** `(app)/dashboard/book-workout/book-workout`
**File:** `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** book-workout (step 1/4) — next: schedule
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** User selects an active package and assigns a trainer (or auto-assign). Transition gate to booking flow.

**Produces:** Two-column picker UI: packages (left) and trainers (right, gated by package selection).

**On success:** Continue button enabled when both package and trainer selected → advances to Schedule screen.

**On failure / error states:**
- No packages: "No active packages found. Purchase a package to book workouts."
- Package selected but trainers loading: skeleton cards shown
- Package not selected: "Please select a package first" below trainer section

---

## 2. How It Works

**Execution flow:**
1. Query active package instances via `orpc.packageInstances.listForClient()`
2. On package select → query trainers via `orpc.members.list()` (enabled only if package selected)
3. User picks trainer or "auto-assign"
4. Click Continue → update context, navigate to schedule

**Inputs:**
- `organizationId` from `useOrganization()`
- `state` from booking-flow-context (pre-filled selections)

**State management:**
- Local: `selectedPackageInstanceId`, `selectedTrainer` (useState)
- Query keys: `packageInstances.listForClient({ organizationId, status: "active" })`, `members.list({ organizationId, role: "trainer", status: "active" })`
- Context: updates booking-flow with packageInstanceId, packageName, serviceType, trainerId, trainerName

**Outputs:** Package cards + trainer cards → on Continue pushes to `./schedule`

**Side effects:**
- Hides tab bar on focus via `useFocusEffect`
- Appointment type "both" is mapped to "semi-private"

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.packageInstances.listForClient({ organizationId, status: "active" })` — active package instances
- `orpc.members.list({ organizationId, role: "trainer", status: "active" })` — available trainers

**Uses these components:**
- `Container` — `apps/native/components/container.tsx`
- `useBookingFlow` — `apps/native/contexts/booking-flow-context.tsx`

**Navigation: who navigates here:** Dashboard tab or back-navigation from schedule
**Navigation: where it goes:** Continue → `./schedule`, Back → previous screen

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns |
|-------|-----------|-------------|
| `packageInstances` | READ | creditsRemaining, creditsTotal, expiresAt, package.name, package.appointmentType |
| `members` | READ | user.name, role (filtered: trainer) |

---

## 5. Tests

**Test files:** None found

**Not tested (risk areas):**
- serviceType logic for appointmentType "both" → "semi-private" mapping
- Tab bar hiding robustness (depth-limited navigator tree search)
- Trainer query enable condition edge cases

---

## 6. Notes

- Auto-assign sets trainerId to null; backend handles matching logic.
- Skeleton loaders always show 3 cards (hardcoded, not dynamic).
- Appointment type "both" is ambiguously mapped to "semi-private".
