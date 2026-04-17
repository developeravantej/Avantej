# Book Workout — Setup (Native)

**Route:** `/(app)/dashboard/book-workout/book-workout`
**File:** `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** book-workout (step 1/4) — next: `/(app)/dashboard/book-workout/schedule`
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Step 1 of the book-workout flow — select which active package to book from and optionally choose a specific trainer (or auto-assign).
**Produces:** A scrollable screen with a progress bar (25%), package selection cards, and trainer selection cards. A "Continue" button appears in a sticky footer once both a package and a trainer are selected.
**On success:** Writes selections into `BookingFlowContext` and navigates to `./schedule`.
**On failure / error states:** Skeleton cards while packages or trainers load. Empty-state message if no active packages exist. Trainer section shows placeholder until a package is selected.

---

## 2. How It Works

**Execution flow:**
```
BookWorkoutScreen
  → useOrganization() → organizationId
  → useBookingFlow() → state (initial or resumed), update()
  → useQuery(orpc.packageInstances.listForClient, { status: "active" })
    → packageInstancesRouter.listForClient
      → listPackageInstancesForClient(tenantDb, { clientId: session.userId, status: "active" })
        → package_instances table (joined with packages)
  → useQuery(orpc.members.list, { role: "trainer", status: "active" })  [enabled when package selected]
    → membersRouter.list
      → members table (filtered by role/status)
  → handleContinue:
      update(BookingFlowState partial)
      router.push("./schedule")
  → useFocusEffect: hide tab bar
```

**Inputs:**
- `state.packageInstanceId` and `state.trainerId` from `BookingFlowContext` (pre-populates selections if resuming)

**State management:**
- `selectedPackageInstanceId`: string | null (local state, init from context)
- `selectedTrainer`: string | "auto" | null (local state, init from context)
- `BookingFlowContext.state` / `update` — persists selections to context on Continue

**Outputs:** Updates `BookingFlowContext` with:
```
packageInstanceId, packageName, serviceType ("private"|"semi-private"),
serviceDuration (60), trainerId, trainerName, branchId (null),
categoryId/categoryName/serviceId/serviceName (all null at this step)
```
**Side effects:** Hides tab bar via navigator traversal (does not restore in cleanup — layout handles restoration)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `packageInstances.listForClient` — fetch user's active packages
- `members.list` — fetch trainers (role=trainer, status=active); enabled only after package selection

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — SafeAreaView wrapper
- `SkeletonCard` — inline — loading placeholder

**Uses these hooks / contexts:**
- `useBookingFlow` — `apps/native/contexts/booking-flow-context.tsx` — shared booking state
- `useOrganization` — `apps/native/hooks/useOrganization.ts` — provides `organizationId`
- `useFocusEffect` — React Navigation — hide tab bar on focus

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/index.tsx` — "Book Workout" button / "Book Session" CTA
- `apps/native/app/(app)/dashboard/explore/[id].tsx` — service detail page "Book" button
- `apps/native/app/(app)/dashboard/buy-package/done.tsx` — after package purchase, "Book Now" button

**Navigation: where it goes:**
- `./schedule` — on Continue (with package + trainer selected)
- `router.back()` — back arrow

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `package_instances` | SELECT | `id`, `clientId`, `status`, `creditsRemaining`, `creditsTotal`, `expiresAt`, `package.name`, `package.appointmentType` |
| `members` | SELECT | `id`, `role`, `status`, `user.name` |

**Key types from BookingFlowContext written at this step:**
```typescript
packageInstanceId: string | null
packageName: string | null
serviceType: "private" | "semi-private"
serviceDuration: 60  // hardcoded
trainerId: string | null
trainerName: string | null  // "Auto-assign" when auto selected
```

**Package card data displayed:** `inst.package.name`, `inst.package.appointmentType`, `inst.creditsRemaining / inst.creditsTotal`, `inst.expiresAt`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** `serviceDuration` is hardcoded at 60 regardless of package; `branchId` is set to `null` at this step and must be resolved before `create` is called at the Review step.

---

## 6. Notes

- The `BookingFlowProvider` is set up in `apps/native/app/(app)/dashboard/book-workout/_layout.tsx`, wrapping all four steps. Context resets if the user navigates out of the stack.
- `serviceType` is derived from `package.appointmentType`: `"semi-private"` maps to `"semi-private"`, everything else maps to `"private"`. The `"both"` type maps to `"private"` which may be incorrect.
- Trainer list is only fetched once a package is selected (lazy-enabled query). Changing the package resets trainer selection to `null`.
- The `branchId` written here is `null` — the Review screen sends `state.branchId!` to the API which will be `null`, likely causing a server-side validation failure unless the API tolerates it.
