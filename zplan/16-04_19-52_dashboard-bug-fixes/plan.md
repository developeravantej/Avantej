# Dashboard Bug Fixes — Implementation Plan

## 1. Overview

### Problem Statement
Dashboard testing on 2026-04-16 revealed 20 issues across 39 pages: 3 critical (security/access), 7 moderate (data display/missing UI), and 10 minor (UX polish). These bugs degrade user trust, leak internal data, and block admins from managing core RBAC features.

### Goals
- Fix all 3 critical bugs (security, data integrity, access control)
- Fix all 7 moderate bugs (currency, missing UI, data consistency)
- Fix 10 minor UX gaps
- Zero regressions on the 30+ pages that currently work

### Success Criteria
- Admin user can access all access control pages (roles, permissions, user assignment, walk-in customers)
- No debug info visible to users on any page
- All names resolve to human-readable text (no raw UUIDs or encoded IDs)
- All prices display in MYR format (RM)
- All pages have consistent headers and actionable UI elements

### Scope
**In:** Fix all 20 issues from `zdocs/dashboard-test-results.md`
**Out:** New features, refactoring unrelated code, native app bugs

---

## 2. Result (What Changes for the User)

**Before:** Admin users are blocked from Access Control pages. Branch view leaks debug data. Trainer names show as UUIDs. Service prices show in USD. Several pages are missing headers, create buttons, or table columns.

**After:** All dashboard pages are accessible to admin users with correct permissions. All names display as human-readable text. All prices show in MYR. Every page has a consistent header and all CRUD actions are visible.

**Key differences:**
- Admin users can access Roles, Permissions, User Assignment, and Walk-in Customers pages
- Branch view no longer shows debug panel; PIC column shows real names
- Appointment calendar sidebar shows trainer names ("Coach Alex") instead of UUIDs
- Service prices show "RM 30.00" instead of "$30.00"
- Notifications page shows all 5 columns (Title, Message, Type, Date, Status) with mark-read actions
- Payment and UoM pages have proper page headers
- Sidebar hides links to pages the user can't access
- Expense submit button, tax rate add button, and inventory create buttons are visible to authorized users

---

## 3. Technical Architecture

### Root Cause Analysis

| Bug ID | Root Cause | Fix Location |
|--------|-----------|--------------|
| #1 Debug panel | `process.env.NODE_ENV === "development"` check — correct for prod but visible in dev server | `branch/view.tsx` — remove or gate behind feature flag |
| #2 PIC name | `name: picUserId` — TODO left unimplemented; raw userId used as display name | `branch/view.tsx` lines 243-244 — resolve userId via API |
| #3 Permissions blocked | `member.role` → `roles.name` lookup in `auth.ts` may fail on case mismatch OR permissions table is empty for this tenant | `apps/server/src/routers/auth.ts` — add case-insensitive role lookup + verify permissions table data |
| #4 USD currency | `currency: "USD"` hardcoded in `components/tables/service/view/columns.tsx` line 9 | Replace with `formatPrice(priceCents, "MYR")` from `@/lib/currency` |
| #5 Trainer UUIDs | `member.displayName ?? member.userId` fallback in `trainer-sidebar.tsx` line 97 | Fetch profiles or use the members.list API that returns displayName |
| #6 Unknown members | Cross-DB name join returns null for some users — control panel may not have matching user records | `user/view.tsx` / members.list API — fallback to member email or userId |
| #7 Notifications columns | Columns exist in `columns.tsx` (5 defined) but DataTable may be truncating due to viewport or config | Investigate DataTable column visibility settings |
| #8 Payment header | No JSX header element in `payment/view.tsx` | Add header block matching other pages |
| #9 Expense button | Button is gated by `hasPermission("expense_management:create")` — same root cause as #3 | Fix #3 (permissions) will resolve this |
| #10 Brand count | `inventory-options-dashboard.tsx` hardcodes `"Products Assigned": 0` | Fetch products.list and compute counts like standalone brands page |
| #13 Sidebar links | `app-sidebar.tsx` renders all nav items unconditionally | Add `hasPermission`/`hasRole` checks to conditionally render |
| #15-16 Create buttons | Gated by `hasPermission("inventory_management:create")` — same root cause as #3 | Fix #3 |

### Key Technical Decision
The permission issue (#3) is the **root cause** of bugs #3, #9, #13, #15, and #16. Fixing the role→permission lookup in `auth.ts` will cascade-fix 5 issues at once. This is the highest-leverage fix.

---

## 4. User Journeys

### Journey A: Admin accesses Access Control pages
**Trigger:** Admin clicks "Role Management" in sidebar
**Before:**
1. User clicks sidebar link → redirect to `/dashboard?unauthorized="true"` → sees dashboard home with no explanation
**After:**
1. User clicks sidebar link → Role Management page loads → shows role cards, matrix view, wizard
**Where it lives:** Existing routes, no new pages

### Journey B: Admin views branch details with PIC name
**Trigger:** Admin navigates to `/dashboard/branch/view`
**Before:**
1. User sees debug panel with raw org IDs → scrolls past → PIC column shows `wZGQSvB1v2...`
**After:**
1. No debug panel → PIC column shows "Franchise Owner" (resolved from control panel DB)

### Journey C: User views service prices in correct currency
**Trigger:** User navigates to `/dashboard/service/view`
**Before:**
1. Price column shows `$30.00`, `$22.00`
**After:**
1. Price column shows `RM 30.00`, `RM 22.00`

### Journey D: Admin filters appointments by trainer name
**Trigger:** Admin opens appointment calendar, uses trainer sidebar
**Before:**
1. Sidebar shows `92371eea-56f5-46a7-8bf0-...` — Trainer
**After:**
1. Sidebar shows `Coach Alex` — Trainer (or `Alex Wong` if displayName not set, falls back to full name)

---

## 5. Phased Implementation

---

### Phase 1: Security & Access Control (Critical)
**Goal:** Remove debug exposure, fix permission system so admin can access all pages
**Delivers:** Journey A, Journey B (partial)
**Dependencies:** None

#### Task 1.1: Remove debug panel from Branch View
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`
**Change:** Delete the entire `{process.env.NODE_ENV === "development" && (...)}` block (lines ~859-920). This debug info is developer-only and should not exist in user-facing UI even in dev mode. If debug tools are needed, use browser devtools or a dedicated admin route.
**Acceptance:** Branch view loads without any debug info panel.

#### Task 1.2: Diagnose and fix permission resolution for admin users
**File:** `apps/server/src/routers/auth.ts` (lines 387-416)
**Investigation steps:**
1. Query the tenant DB to check what `member.role` value the franchisee user has
2. Query the `roles` table to see if a matching role name exists
3. Check if the `permissions` table has entries (may be empty if seed/migration wasn't run)
4. Check if `role_permissions` junction table has entries

**Likely fix options (investigate to determine which):**
- **Option A (role name mismatch):** The `member.role` is "Admin" but `roles.name` is "admin" — fix with case-insensitive comparison:
  ```typescript
  // Change from:
  where: eq(roles.name, member.role)
  // To:
  where: sql`LOWER(${roles.name}) = LOWER(${member.role})`
  ```
- **Option B (empty permissions table):** Run the permission seed script to populate the `permissions` table in the tenant DB
- **Option C (empty role_permissions):** The admin role has priority >= 100 so it should get ALL permissions — verify this code path executes correctly

**Acceptance:** After fix, `client.auth.userContext({})` response includes a non-empty `permissions` array for the admin user. Access control pages load without redirect.

#### Task 1.3: Verify cascading fixes from permission fix
Once Task 1.2 is done, verify these pages now work:
- `/dashboard/access-control/roles` — loads
- `/dashboard/access-control/permissions` — loads
- `/dashboard/access-control/user-assignment` — loads
- `/dashboard/customers/walk-in/view` — loads
- Expense page shows "Submit Expense" button
- Purchase Orders shows "New PO" button
- Stock Requests shows "New Request" button
- Transfer Orders shows "New Transfer" button
- Tax Rates shows "Add Tax Rate" button

**Acceptance:** All 9 previously-blocked features are accessible to admin user.

---

### Phase 2: Cross-DB Name Resolution (Critical/Moderate)
**Goal:** All user-facing displays show human-readable names instead of UUIDs/encoded IDs
**Delivers:** Journey B (complete), Journey D
**Dependencies:** None (independent of Phase 1)

#### Task 2.1: Fix Branch View PIC name resolution
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx` (lines 239-245)
**Current code:**
```typescript
const picInfo = picUserId
  ? {
      // TODO: Fetch actual user details from control panel DB by picUserId
      name: picUserId || "N/A",
      email: picUserId || "N/A",
    }
  : { name: currentUserName, email: currentUserEmail };
```
**Fix approach:** The branch list API (`client.hierarchy.listBranches` or equivalent) should return PIC user details. Check if the API already enriches this data. If not:
1. After fetching branches, collect all unique `picUserId` values
2. Call `client.members.list({ organizationId })` to get member records (which may include names)
3. If member records don't include names, add a batch user lookup endpoint or use existing cross-DB resolution in the members.list API
4. Map picUserId → resolved name/email in the client-side transform

**Acceptance:** PIC Name column shows real human names for all branches.

#### Task 2.2: Fix Trainer Sidebar name display
**File:** `apps/web/src/components/calendar/trainer-sidebar.tsx` (line 97)
**Current code:**
```typescript
const displayName = member.displayName ?? member.userId ?? "Unknown";
```
**Fix:** The `members.list` API with `role: "trainer"` returns `displayName` but it's often null because it comes from `member_profiles` which may not be populated. The fallback should use the member's actual name from the control panel DB instead of `userId`.

Check what fields `members.list` returns — it should have `firstName`/`lastName` or `name` from the cross-DB join. Update fallback chain:
```typescript
const displayName = member.displayName 
  ?? (member.firstName && member.lastName ? `${member.firstName} ${member.lastName}` : null)
  ?? member.name 
  ?? member.email 
  ?? "Unknown Trainer";
```
**File also:** Verify the `members.list` API actually returns name fields. If not, the API needs to be updated to include the cross-DB user name.

**Acceptance:** Trainer sidebar shows human-readable names for all trainers.

#### Task 2.3: Fix User View "Unknown" members
**File:** `apps/web/src/components/tables/user/view/columns.tsx` (or wherever member rows are transformed)
**Issue:** Some members show "Unknown" for name and email because the cross-DB join failed.
**Fix:** Add better fallback logic — if name is null/empty, show `member.email` or `member.userId` with a visual indicator (e.g., muted text, tooltip: "Name not synced").

**Acceptance:** No member row shows "Unknown" for both name and email simultaneously. At minimum, one identifier is always visible.

---

### Phase 3: Currency & Data Display Fixes (Moderate)
**Goal:** Fix all data formatting and consistency issues
**Delivers:** Journey C
**Dependencies:** None

#### Task 3.1: Fix Service View currency from USD to MYR
**File:** `apps/web/src/components/tables/service/view/columns.tsx` (lines 5-10)
**Current code:**
```typescript
const formatPrice = (priceCents: number | null | undefined): string => {
  if (priceCents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(priceCents / 100);
};
```
**Fix:** Replace with the shared `formatPrice` from `@/lib/currency`:
```typescript
import { formatPrice } from "@/lib/currency";
// In cell renderer:
cell: ({ getValue }) => {
  const val = getValue<number>();
  return val != null ? formatPrice(val, "MYR") : "—";
},
```
**Acceptance:** Service prices show as "RM 30.00" not "$30.00".

#### Task 3.2: Fix Inventory Options brand product count
**File:** `apps/web/src/components/merge-tables/inventory-options-dashboard.tsx` (line 206)
**Current code:**
```typescript
const brandsData = brandsRaw.map((brand) => ({
  Name: brand.name,
  "Products Assigned": 0,  // ← hardcoded
  ID: brand.id,
}));
```
**Fix:** Fetch `client.products.list()` and compute counts per brand, same as the standalone brands page does:
```typescript
const { data: productsRaw = [] } = useQuery({
  queryKey: ["products", organizationId],
  queryFn: () => client.products.list({ organizationId: organizationId! }),
  enabled: !!organizationId,
});

const productCountByBrand = useMemo(() => {
  const counts = new Map<string, number>();
  productsRaw.forEach((p) => {
    if (p.brandId) counts.set(p.brandId, (counts.get(p.brandId) ?? 0) + 1);
  });
  return counts;
}, [productsRaw]);

// Then in brandsData:
"Products Assigned": productCountByBrand.get(brand.id) ?? 0,
```
Do the same for categories (`productCountByCategory`).

**Acceptance:** Brand and category product counts match between standalone pages and Inventory Options hub.

#### Task 3.3: Fix Notifications page — verify all columns render
**Files:**
- `apps/web/src/components/tables/notifications/view/columns.tsx` — already defines 5 columns (Title, Message, Type, Date, Status)
- `apps/web/src/routes/_authenticated/dashboard/_layout/notifications/view.tsx`
**Investigation:** The columns are defined but may not render due to:
1. DataTable column visibility defaults hiding some columns
2. Viewport too narrow to show all columns (horizontal scroll needed)
3. DataTable generic not passing all columns through

Check the DataTable component for default column visibility. Also verify the "Mark All as Read" button and per-row "Mark Read" action are in the page component (they ARE — lines 48-72 have the mutations, but verify the JSX renders them).

**Fix:** Read the full notifications view.tsx to check if the "Mark All as Read" button JSX exists. Add it if missing. Ensure per-row actions use `markReadMutation`.

**Acceptance:** Notifications page shows all 5 columns and has "Mark All as Read" button.

---

### Phase 4: Missing UI Elements (Moderate/Minor)
**Goal:** Add missing page headers, fix layout issues
**Delivers:** Consistent UI across all pages
**Dependencies:** None

#### Task 4.1: Add page header to Payment View
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx`
**Change:** Add header block before the DataTable, matching the pattern from other pages:
```tsx
<div className="flex items-center gap-3">
  <div className="p-2 rounded-lg bg-primary/10">
    <CreditCard className="h-6 w-6 text-primary" />
  </div>
  <div>
    <h1 className="text-2xl font-bold font-heading">Payments</h1>
    <p className="text-brand-secondary-1 text-sm">
      View and manage invoice payments.
    </p>
  </div>
</div>
```

#### Task 4.2: Add page header to UoM View
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/uom/view.tsx`
**Change:** Add similar header with `Package` or `Ruler` icon and title "Units of Measure".

#### Task 4.3: Fix sidebar to hide unauthorized links
**File:** `apps/web/src/components/app-sidebar.tsx`
**Approach:** The sidebar already has access to `useUserContext()` (line 442). Use `hasPermission` to conditionally render nav items.

**Implementation:**
1. Add a `permission` field to the `SidebarNavItem` type:
   ```typescript
   type SidebarNavItem = {
     title: string;
     url: string;
     icon: React.ComponentType<{ className?: string }>;
     permission?: string; // e.g., "user_management:read"
     items?: Array<{
       title: string;
       url: string;
       icon: React.ComponentType<{ className?: string }>;
       permission?: string;
     }>;
   };
   ```
2. Tag permission-gated items in `NAV_GROUPS`:
   ```typescript
   { title: "Role Management", url: "/dashboard/access-control/roles", icon: Shield, permission: "user_management:read" },
   { title: "Walk-in Customers", url: "/dashboard/customers/walk-in/view", icon: BookUser, permission: "walk_in_customer_management:read" },
   ```
3. In `NavGroup` and `CollapsibleNavItem`, filter out items where `hasPermission(item.permission)` returns false.
4. If all sub-items are filtered out, hide the parent group item too.

**Acceptance:** Sidebar only shows links the user has permission to access. No more silent redirects.

#### Task 4.4: Fix "My Services" sidebar visibility
**File:** `apps/web/src/components/app-sidebar.tsx` (line 504)
**Current code:**
```typescript
const isStaffOrTrainer = hasRole(["trainer", "staff"]);
```
**Investigation:** Check if the admin user has `member.role === "admin"` — if so, `hasRole(["trainer", "staff"])` should return false and the section should be hidden. If the sidebar IS showing it, either:
1. `hasRole` returns `true` for admin (it does — line 208: `if (ctx.isSystemAdmin) return true`) — but `isSystemAdmin` is likely false for franchisee
2. The admin member's role field contains "trainer" or "staff" in addition to "admin"

**Fix:** Verify `memberRole` value. If the fix is that admin users shouldn't see "My Services", the `hasRole` check is correct but maybe `isSystemAdmin` is incorrectly true.

---

### Phase 5: Minor UX Polish
**Goal:** Clean up remaining minor issues
**Delivers:** Polished, production-ready UI
**Dependencies:** Phase 1 (permissions fix)

#### Task 5.1: Remove hardcoded QuickInsight
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx`
**Change:** Find the hardcoded insight string and either:
- Replace with a dynamic query to `client.analytics.getInsight()` if such an API exists
- Remove the QuickInsight widget entirely if no backend exists
- Replace with a static but accurate message like "Welcome to your dashboard"

#### Task 5.2: Clean up duplicate declined invitations (data)
**Action:** This is a data cleanup task, not a code fix. Run a SQL query against the tenant DB:
```sql
-- Delete duplicate declined invitations, keeping the most recent one per email
DELETE FROM invitations
WHERE status = 'declined'
  AND id NOT IN (
    SELECT DISTINCT ON (email) id
    FROM invitations
    WHERE status = 'declined'
    ORDER BY email, created_at DESC
  );
```
Consider also adding a UI "clean up" button or auto-archiving declined invitations after 30 days.

#### Task 5.3: Verify Service Category "—" display (Bug #11)
**Investigation only:** Check if services actually have categories assigned in the DB. If `categoryId` is null in the services table, the "—" display is correct behavior (data issue, not code bug). If categories ARE assigned, check the column accessor.

#### Task 5.4: Verify Class Slot instructor display (Bug #12)
**Investigation only:** Check if class slots have `instructorId` values in the DB. If null, the "—" is correct (data issue). If populated, check the column accessor.

---

## 6. Impact & Breakage Analysis

### Files Modified Per Phase

| Phase | Files | Risk |
|-------|-------|------|
| 1.1 | `branch/view.tsx` | Low — removing debug JSX only |
| 1.2 | `apps/server/src/routers/auth.ts` | **High** — auth/permission changes affect all protected routes |
| 2.1 | `branch/view.tsx` | Medium — changing data transform |
| 2.2 | `components/calendar/trainer-sidebar.tsx` | Low — display-only change |
| 2.3 | `components/tables/user/view/columns.tsx` | Low — display-only change |
| 3.1 | `components/tables/service/view/columns.tsx` | Low — formatting change |
| 3.2 | `components/merge-tables/inventory-options-dashboard.tsx` | Low — adding query |
| 3.3 | `notifications/view.tsx` + columns | Low — UI additions |
| 4.1 | `payment/view.tsx` | Low — adding JSX |
| 4.2 | `uom/view.tsx` | Low — adding JSX |
| 4.3 | `components/app-sidebar.tsx` | Medium — conditional rendering logic |

### Deployment Coupling
- **Phase 1.2** (server auth fix) can deploy independently — it only adds permissions that were missing. No frontend changes needed for it to take effect.
- **Phase 4.3** (sidebar filtering) depends on Phase 1.2 being deployed first — without permissions populated, the sidebar would hide everything.
- All other phases are independently deployable.

### Return Type Changes
- **Task 1.2:** No return type change — `userContext` response shape stays the same, just the `permissions` array gets populated.
- **Task 2.1:** No API change — client-side transform only.
- **Task 2.2:** May require `members.list` API to return additional fields (firstName, lastName). Check if it already does.

---

## 7. Cross-Cutting Concerns

### Testing Approach
1. **Phase 1.2 (critical):** After fix, verify with browser test — navigate to all 4 previously-blocked pages
2. **Phase 2:** Visual verification — check all name columns show human-readable text
3. **Phase 3.1:** Visual verification — service prices show "RM"
4. **All phases:** Run `bun check-types` to verify no TypeScript errors introduced

### Rollback Strategy
- All changes are additive (adding UI elements, fixing display logic) — easy to revert
- Phase 1.2 is the only risky change. If role lookup fix causes unexpected behavior, revert the single line change in `auth.ts`

### Error Handling
- Cross-DB name resolution failures should gracefully fallback to email or "Unknown" — never show raw UUIDs or encoded tokens
- Permission check failures should show a clean "Access Denied" message, not a silent redirect

---

## 8. Open Questions / Risks

### Must resolve before starting Phase 1.2:
1. **What is the actual `member.role` value for the franchisee user?** Query: `SELECT role FROM members WHERE user_id = '<franchisee-user-id>'` in the tenant DB. If it's "admin" (lowercase) and `roles.name` is also "admin", the issue is elsewhere (empty permissions table).
2. **Is the `permissions` table populated in the test tenant DB?** Query: `SELECT COUNT(*) FROM permissions`. If 0, the Phase 2S migration seed script needs to be re-run.

### Risks:
- **Risk:** Changing permission resolution in `auth.ts` could inadvertently grant or revoke access for other users
  - **Mitigation:** Only fix the specific lookup issue (case sensitivity or empty table). Don't change the permission model itself.
- **Risk:** Cross-DB name resolution adds latency to page loads
  - **Mitigation:** The `members.list` API already does cross-DB joins. Reuse existing patterns, don't add new cross-DB calls.
