# Dashboard Bug Fixes — Phase 1 Results

## Task 1.1: Remove debug panel from Branch View

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`

**Done.** Removed the entire `{process.env.NODE_ENV === "development" && ( ... )}` block (lines 859–926 in the original). This block displayed Organization ID, auth state, hierarchy node counts, and expandable raw JSON. It no longer exists in the file.

---

## Task 1.2: Fix permission resolution for admin users

**File:** `apps/server/src/routers/auth.ts`

**Changes made:**

1. Added `sql` to the drizzle-orm import alongside the existing `eq`:
   ```typescript
   import { eq, sql } from "drizzle-orm";
   ```

2. Changed the role lookup from an exact `eq` comparison to a case-insensitive `LOWER()` comparison, so "Admin" and "admin" resolve to the same role:
   ```typescript
   const role = await tenantDb.query.roles.findFirst({
     where: sql`LOWER(${roles.name}) = LOWER(${member.role})`,
   });
   ```

3. Added a `console.warn` when no role is found for a member's role value, to aid debugging:
   ```typescript
   if (!role) {
     console.warn(`[userContext] No role found for member.role="${member.role}" in tenant DB`);
   }
   ```

4. Added a `console.warn` when an admin-priority role resolves but the `permissions` table is empty (indicating the table was never seeded):
   ```typescript
   if (allPerms.length === 0) {
     console.warn(`[userContext] Admin role "${role.name}" has priority ${role.priority} but permissions table is empty`);
   }
   ```

**Root cause addressed:** A case-sensitive mismatch between `member.role` (e.g. "Admin") and `roles.name` (e.g. "admin") caused the role lookup to silently return no results, producing an empty permissions array. All permission-gated pages then redirected to `?unauthorized=true`.

---

## Task 1.3: Fix Branch View PIC name resolution

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`

**Changes made:**

1. Added a React Query call to fetch the members list:
   ```typescript
   const { data: membersData = [] } = useQuery({
     queryKey: ["members", organizationId],
     queryFn: () => client.members.list({ organizationId: organizationId! }),
     enabled: !!organizationId && isAuthenticated,
   });
   ```

2. Added a `useMemo` to build a `userId → { name, email }` lookup map:
   ```typescript
   const memberByUserId = useMemo(() => {
     const map = new Map<string, { name: string; email: string }>();
     membersData.forEach((m) => {
       map.set(m.userId, { name: m.name || "Unknown", email: m.email || "N/A" });
     });
     return map;
   }, [membersData]);
   ```

3. Replaced the TODO block in `mapBranchesWithHierarchy` that was echoing the raw `picUserId` string as the name:
   ```typescript
   // Before:
   const picInfo = picUserId
     ? { name: picUserId || "N/A", email: picUserId || "N/A" }
     : { name: currentUser?.name || "N/A", email: currentUser?.email || "N/A" };

   // After:
   const picInfo = picUserId
     ? memberByUserId.get(picUserId) ?? { name: "Unknown", email: "N/A" }
     : { name: currentUser?.name || "N/A", email: currentUser?.email || "N/A" };
   ```

4. Added `memberByUserId` to the `useCallback` dependency array for `mapBranchesWithHierarchy`.

**Root cause addressed:** PIC column was showing an opaque encoded user ID string instead of the member's name and email because the lookup was deferred with a TODO comment. The fix leverages the already-available `members.list` API to resolve IDs at render time.

---

## Type Check

No new TypeScript errors introduced in the changed files. All pre-existing errors in test files and unrelated packages remain unchanged.

---

# Dashboard Bug Fixes — Phase 2A Results

## Task 2A.1: Trainer Sidebar name display

**File:** `apps/web/src/components/calendar/trainer-sidebar.tsx`

**Root cause:** `members.list` returns a `name` field, not `displayName`. The filter function (line 40) and the render loop (line 97) both referenced the non-existent `member.displayName`, causing the fallback to fall through to `member.userId` — a raw UUID visible to users.

**Changes made:**

- Line 40 (filter function): `member.displayName ?? member.userId ?? ""` changed to `member.name ?? member.email ?? ""`
- Line 97 (render): `member.displayName ?? member.userId ?? "Unknown"` changed to `member.displayName ?? member.name ?? member.email ?? "Unknown Trainer"`

The `member.displayName` check is kept as the first step in line 97 (harmless — always undefined at runtime) so the chain matches the task spec and remains forward-compatible if `displayName` is ever added to the API response.

---

## Task 2A.2: User View "Unknown" member names

**File:** `apps/web/src/components/tables/user/view/columns.tsx`

**Root cause:** When the control-panel user record is missing, `members.list` returns `name: "Unknown"` and `email: "No email"`. The existing `member.name || member.email || "Unknown"` fallback would display the literal string `"Unknown"` with no extra indication, giving users no way to identify the row.

**Changes made (name column cell renderer):**

Added fallback detection logic:

```ts
const nameIsUnknown = !member.name || member.name === "Unknown";
const emailIsValid = member.email && member.email !== "No email";
const isFallback = nameIsUnknown && !!emailIsValid;
```

- When `isFallback` is true: displays the email address styled as `text-muted-foreground text-sm`, making it visually distinct from a real name while still being identifiable.
- When `isFallback` is false: existing behavior — bold name, or email fallback, or "Unknown".
- Avatar initials are derived from whichever value is displayed, so they remain meaningful in both states.

---

# Dashboard Bug Fixes — Phase 2C Results

## Task 2C.1: Add page header to Payment View

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx`

**Status:** Done.

Added `CreditCard` icon import from `lucide-react` and `Separator` import from `@/components/ui/separator`. Wrapped the return JSX in `<div className="p-6 space-y-6">`. Added the standard header block above the DataTable:

- Icon: `CreditCard` in `bg-primary/10` rounded container
- Title: "Payments"
- Subtitle: "View and manage invoice payments."
- `<Separator />` between header and DataTable

---

## Task 2C.2: Add page header to UoM View

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/uom/view.tsx`

**Status:** Done.

Added `Ruler` icon import from `lucide-react` and `Separator` import from `@/components/ui/separator`. Wrapped the return JSX in `<div className="p-6 space-y-6">`. Added the standard header block above the DataTable:

- Icon: `Ruler` in `bg-primary/10` rounded container
- Title: "Units of Measure"
- Subtitle: "Manage base units of measure for products."
- `<Separator />` between header and empty-state/DataTable

Also fixed DataTable prop indentation (was misaligned from the wrapping fragment removal).

---

## Task 2C.3: Notifications page — Mark All as Read + per-row actions

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/notifications/view.tsx`

**Status:** Already complete — no changes needed.

The file already contained:
1. A "Mark All as Read" button in the header row (right side), wired to `markAllReadMutation.mutate()`, disabled when pending or no data.
2. An inline `columnsWithActions` definition that spreads `staticColumns` and appends an `actions` column with a "Mark Read" `Button` for unread rows, calling `markReadMutation.mutate(row.original.id)`.
3. Full header with `Bell` icon, title "Notifications", and subtitle.
4. Read/Unread/All filter tabs.
5. Empty state with `Bell` icon.

No modifications were required for this task.

---

# Dashboard Bug Fixes — Phase 2B Results

## Task 2B.1: Fix Service View currency from USD to MYR

**File:** `apps/web/src/components/tables/service/view/columns.tsx`

**Root cause:** A local `formatPrice` function hardcoded `currency: "USD"` in an `Intl.NumberFormat` call, causing service prices to be shown with a dollar sign instead of Malaysian Ringgit.

**Changes made:**

1. Removed the local `formatPrice` function (lines 5–11 in original).
2. Added import: `import { formatPrice } from "@/lib/currency";`
3. Updated the `price` column cell renderer from `formatPrice(getValue<number>())` to:
   ```typescript
   cell: ({ getValue }) => {
     const val = getValue<number>();
     return val != null ? formatPrice(val, "MYR") : "—";
   },
   ```

Prices now display as `RM X.XX` instead of `$X.XX`.

---

## Task 2B.2: Fix Inventory Options brand and category product counts

**File:** `apps/web/src/components/merge-tables/inventory-options-dashboard.tsx`

**Root cause:** Both `brandsData` and `categoriesData` transforms hardcoded `"Products Assigned": 0`, so the Brands and Categories tables always showed 0 regardless of actual product assignments.

**Changes made:**

1. Added `useMemo` to the React import.
2. Added a products query alongside the existing brands/categories/suppliers queries:
   ```typescript
   const { data: productsRaw = [], isLoading: productsLoading } = useQuery({
     queryKey: ["products", organizationId],
     queryFn: () => client.products.list({ organizationId: organizationId! }),
     enabled: !!organizationId,
   });
   ```
3. Added two `useMemo` maps to count products per brand and per category:
   - `productCountByBrand`: maps `brandId → count`
   - `productCountByCategory`: maps `categoryId → count`
4. Updated both data transforms to use the computed counts:
   - `"Products Assigned": productCountByBrand.get(brand.id) ?? 0`
   - `"Products Assigned": productCountByCategory.get(cat.id) ?? 0`
5. Updated `isLoading` to include `productsLoading` so the loading spinner covers the products fetch.

**Type check:** No new TypeScript errors introduced in either changed file. All pre-existing errors in unrelated packages remain unchanged.

---

# Dashboard Bug Fixes — Phase 3 Results

## Task 3.1: Sidebar permission-based filtering

**File:** `apps/web/src/components/app-sidebar.tsx`

**Changes made:**

1. Added optional `permission?: string` field to the `SidebarNavItem` type and its sub-items array element type.

2. Annotated nav items with permissions:
   - **Main > Trainers** → `permission: "user_management:read"`
   - **Business > Appointments > Appointments** → `permission: "appointment_management:read"`
   - **Business > Appointments > Class Slots** → `permission: "appointment_management:read"`
   - **Business > Appointments > Package Instances** → `permission: "service_management:read"`
   - **Business > Appointments > Installments** → `permission: "service_management:read"`
   - **Business > Customers > Walk-in Customers** → `permission: "walk_in_customer_management:read"`
   - **Business > Branches > Create Branch** → `permission: "hierarchy_management:create"`
   - **People > Access Control > Role Management** → `permission: "role_management:read"`
   - **People > Access Control > Permissions** → `permission: "role_management:read"`
   - **People > Access Control > User Assignment** → `permission: "user_management:read"`
   - **People > Access Control > Invitations** → `permission: "user_management:read"`

3. Updated `NavGroup` to call `useUserContext()` (hook already imported at file top) and derive `visibleItems` by:
   - Filtering top-level items with a `permission` field against `hasPermission(item.permission)`
   - Filtering each item's sub-items the same way
   - Hiding a parent collapsible if all of its sub-items are filtered out
   - Returning `null` for the entire group if no items remain visible

Items without a `permission` field are always shown (no regression for items that are not access-controlled).

---

## Task 3.2: Dynamic QuickInsight on dashboard

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx`

**Changes made:**

Replaced the hardcoded `<QuickInsight message="Most members book 2 workouts per week..." />` with a conditional render driven by live `kpiData`:

- When `kpiData` is `undefined` (loading), `QuickInsight` is not rendered.
- When `kpiData.totalAppointments > 0`: message shows appointment count for the selected period label, completed count, and computed completion percentage.
- When `kpiData.totalAppointments === 0`: message falls back to showing active member count.

The computed percentage matches the existing `AppointmentsKpiCard` logic (`completedAppointments / totalAppointments * 100`) for consistency.

---

## Type Check

No new TypeScript errors introduced in either file. All pre-existing errors are in test files and unrelated packages.
