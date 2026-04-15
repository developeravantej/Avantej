# Phase 3: Fix `packages/instances/view.tsx` render bug

**Goal:** Stop the Package Instances dashboard page from crashing when it tries to render a row.

**User journey this advances:** "Admin lists package instances" — see Journey A below. This phase completes that journey end-to-end for the first time since the consolidation work started.

**Dependencies:** Phase 2 complete. The bug is a pure code fix, but validating the fix requires live data from the migrated dev DB.

---

## The bug

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx`

**What's broken:**

```ts
// Lines 192-206
const data: PackageInstanceRow[] = apiData.map((item: {
  id: string;
  packageId: string;   // ❌ field doesn't exist on API response anymore
  clientId: string;
  // ...
}) => ({
  id: item.id,
  packageId: item.packageId,  // undefined at runtime
  // ...
}));
```

```ts
// Lines 218-225 (column definition)
{
  accessorKey: "packageId",
  header: "Package ID",
  cell: ({ row }) => (
    <CopyableCell
      value={row.original.packageId}
      displayText={row.original.packageId.slice(0, 8) + "…"}
      //                                  ^^^^^^^^^^^ TypeError: undefined.slice is not a function
    />
  ),
},
```

The API call (`client.packageInstances.listAll`) returns rows from the `package_instances` table, which since the consolidation has `serviceId` (not `packageId`). So `item.packageId` is `undefined`, and `row.original.packageId.slice(0, 8)` throws as soon as any row is displayed.

**Why the form submission path isn't affected:** Line 179 (`serviceId: form.packageId`) correctly maps the local form state variable `packageId` to the API input key `serviceId`. The form state variable is misleadingly named, but the outbound call is correct.

---

## User journeys this phase touches

### Journey A: Admin views the list of package instances (BROKEN → FIXED)

**Trigger:** Admin navigates to `/dashboard/packages/instances/view` from the sidebar.

**Steps (current, broken):**
1. Admin clicks "Package Instances" in sidebar
2. Router loads `packages/instances/view.tsx`
3. Component mounts, calls `client.packageInstances.listAll({ organizationId })`
4. API returns rows with `serviceId`, `clientId`, `creditsTotal`, etc.
5. Component tries to render the data table → reads `row.original.packageId` → `.slice()` on undefined → **React error boundary or full crash**
6. Flow ends: user sees a blank page or a red error screen

**Steps (after fix):**
1. Admin clicks "Package Instances" in sidebar
2. Router loads `packages/instances/view.tsx`
3. Component mounts, calls `client.packageInstances.listAll({ organizationId })`
4. API returns rows with `serviceId`
5. Data table renders each row showing the service's human-readable name (not the UUID)
6. Admin can filter by status, click into a row (if detail nav exists), see credits/client/dates
7. Flow ends: admin has a usable overview of all package instances in the org

**Where it lives:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx` — unchanged. Same page, same route.

### Journey B: Admin creates a new package instance (WORKING, verify untouched)

**Trigger:** Admin clicks "+ Assign Package" button on the instances page.

**Steps (current, correct):**
1. Admin clicks "+ Assign Package"
2. Create dialog opens inline
3. Admin selects a service from the dropdown (populated by `client.services.list` filtered for `sessionCount > 0`)
4. Admin enters client ID, credits total, dates
5. Admin clicks "Create"
6. Component calls `client.packageInstances.create({ serviceId: form.packageId, ... })` — note the local variable is still named `packageId` but the payload key is `serviceId`
7. API creates the instance
8. On success, dialog closes, table invalidates and refetches
9. New row appears in the table

**Where it lives:** Same page, inline dialog.

**Do not change this journey.** It works. This phase's only code-change risk is accidentally breaking the create path while fixing the render path.

---

## Tasks

### Task 3.1 — Rename the `PackageInstanceRow` type field (30 min)

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx`

**Changes:**

1. Update the `PackageInstanceRow` type definition (search for `type PackageInstanceRow` or `interface PackageInstanceRow` at the top of the file, around line 50):
   ```ts
   // OLD
   type PackageInstanceRow = {
     id: string;
     packageId: string;
     // ...
   };

   // NEW
   type PackageInstanceRow = {
     id: string;
     serviceId: string;
     serviceName: string;  // added for Task 3.2
     // ...
   };
   ```

2. Update the `apiData.map` at line 192:
   ```ts
   // OLD
   const data: PackageInstanceRow[] = apiData.map((item: { id: string; packageId: string; ... }) => ({
     id: item.id,
     packageId: item.packageId,
     // ...
   }));

   // NEW
   const data: PackageInstanceRow[] = apiData.map((item) => ({
     id: item.id,
     serviceId: item.serviceId,
     serviceName: serviceNameById.get(item.serviceId) ?? item.serviceId.slice(0, 8) + "…", // fallback
     clientId: item.clientId,
     source: item.source,
     creditsTotal: item.creditsTotal,
     // ...
   }));
   ```
   Note: drop the inline type annotation on `item` — let TypeScript infer it from `apiData`, which is already correctly typed from the oRPC client. The inline annotation was the whole reason the bug existed (it was lying about the API shape).

3. Update the column definition at line 218:
   ```ts
   // OLD
   {
     accessorKey: "packageId",
     header: "Package ID",
     cell: ({ row }) => (
       <CopyableCell
         value={row.original.packageId}
         displayText={row.original.packageId.slice(0, 8) + "…"}
       />
     ),
   }

   // NEW
   {
     accessorKey: "serviceName",
     header: "Service",
     cell: ({ row }) => (
       <CopyableCell
         value={row.original.serviceId}
         displayText={row.original.serviceName}
       />
     ),
   }
   ```

**Acceptance:** The file type-checks and the table renders without crashing. At this point the "Service" column will still show UUID slices (fallback path) because `serviceNameById` isn't populated yet — Task 3.2 fixes that.

---

### Task 3.2 — Join to services for human-readable names (1–2 hours)

**Why:** The old column showed a truncated UUID. That was a pre-existing UX wart and it's worth fixing now while we're in the file. The user will see "Personal Training — 10 Sessions" instead of `a1b2c3d4…`.

**How:** The same page already fetches services for the create dialog (line ~135, `client.services.list` filtered for `sessionCount > 0`). That query is gated on `createOpen` (`enabled: !!organizationId && createOpen`), so it only runs when the dialog is open. We need a SEPARATE query that always runs for the mapping table.

**Implementation:**

1. Find the existing "services for dropdown" query (around line 130-145) and add a parallel always-on query:

   ```ts
   // Services query for the create dialog — already exists
   const { data: servicesForDropdown = [] } = useQuery({
     ...orpc.services.list.queryOptions({
       input: { organizationId, isActive: true },
     }),
     enabled: !!organizationId && createOpen,
     select: (services) => services.filter((s) => s.sessionCount != null && s.sessionCount > 0),
   });

   // NEW: Always-on services query for the name mapping
   const { data: allServices = [] } = useQuery({
     ...orpc.services.list.queryOptions({
       input: { organizationId },  // no isActive filter — we want archived too, so historical rows render
     }),
     enabled: !!organizationId,
   });

   const serviceNameById = useMemo(() => {
     const map = new Map<string, string>();
     for (const s of allServices) {
       map.set(s.id, s.name);
     }
     return map;
   }, [allServices]);
   ```

2. Use `serviceNameById` in the `data` transformation (see Task 3.1 step 2).

3. Make sure `useMemo` is imported at the top of the file if not already.

**Acceptance:** Rows show the service name (e.g. "Personal Training 10-Session Pack") instead of a UUID. If the service has been archived, the name still shows (because we don't filter by `isActive`). If the service has been hard-deleted (shouldn't happen — they're archived, not deleted), the row falls back to the truncated UUID.

---

### Task 3.3 — Rename the form state variable (30 min, OPTIONAL)

**Why:** The create form's state field is named `packageId` but actually holds a service ID. Keeping the misleading name is a code-rot trap — someone in 6 months will look at `form.packageId` and assume it refers to a deleted concept.

**How:** In the same file, do a **scoped** rename of `packageId` → `serviceId` within the form state, form handlers, and dialog JSX. Be careful:

- The `EMPTY_FORM` definition around line 80
- The `form` state declaration
- The `handleCreateSubmit` function (lines 157-190)
- The JSX `<Select value={form.packageId} onValueChange={...}>` at line 376
- Any labels or placeholder text referencing "package"

Do NOT rename the `createMutation.mutate({ ... serviceId: form.packageId })` payload key — that's the API contract. Change it to `serviceId: form.serviceId` after the rename.

Do NOT touch the button label ("Assign Package"), page title, or any user-visible copy — from the user's perspective, these are still "packages" in the UI. The rename is purely internal.

**Acceptance:** No occurrences of `packageId` remain in the file as variable/state names. API call still works. Type-check passes. Create flow (Journey B) still works end-to-end.

**Note:** This task is marked optional because it's cosmetic. If you're in a hurry, skip it — Tasks 3.1 and 3.2 are the load-bearing fixes. If you do skip, add a comment at the top of the state declaration explaining the lie:
```ts
// NOTE: `packageId` in this form holds a service ID. The page is called "Packages" in the UI
// but the underlying entity is `services` (with sessionCount > 0). See SCHEMA_CONSOLIDATION.md.
```

---

### Task 3.4 — Update the frontend test if one exists (30 min)

**File:** `apps/web/src/__tests__/routes/packages.test.tsx` (for the packages page) — this tests `packages/view.tsx`, NOT `packages/instances/view.tsx`. There is no existing test for the instances view.

**Decision:** **Do not add a new test.** The existing frontend test infrastructure (vitest + RTL + mocked client) would require a full mock of `orpc.packageInstances.listAll` and `orpc.services.list`. The cost-value ratio is poor for a cleanup branch. Instead, rely on the Phase 5 manual smoke test to verify the fix.

If the team prefers a test anyway, the pattern to follow is `apps/web/src/__tests__/routes/packages.test.tsx` (uses `mock-client.ts` and `render-with-providers.tsx`). Mock two endpoints (`packageInstances.listAll` and `services.list`), render the route, and assert the "Service" column cell shows the mapped name.

---

## Phase 3 exit checklist

- [ ] `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx` type-checks
- [ ] `bun check` (biome) passes for the file
- [ ] Running `bun dev:web` and navigating to `/dashboard/packages/instances/view` shows instance rows with a human-readable service name column (no crash, no red screen)
- [ ] The create dialog still works end-to-end (Journey B unchanged)
- [ ] If Task 3.3 is done: no misleading `packageId` variable names remain in the file
