# Create Branch

**Route:** `/dashboard/branch/create`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/create.tsx`
**Platform:** web
**Auth required:** rbac(hierarchy_management:create)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Step-by-step form to create a hierarchical branch with country, region, area, and branch details.

**Produces:** A two-column layout with the form on the left (spanning 2 cols on large screens) and an informational card on the right showing the 4-step process.

**On success:** Form submission calls `onSuccess` callback (currently unimplemented — TODO notes "Navigate to branch view after successful creation").

**On failure / error states:** Form validation errors are handled by `HierarchicalBranchForm` component; errors display as toast notifications.

---

## 2. How It Works

**Execution flow:**
1. Route guard `requirePermission()` in `beforeLoad` checks for `hierarchy_management:create` permission
2. If denied, redirects to `/dashboard/branch/view`
3. Component renders `HierarchicalBranchForm` + informational sidebar
4. Form submission → API calls via `client.hierarchy.X()` endpoints
5. Success callback (`onSuccess`) invoked but currently empty

**Inputs:**
- No URL params or query params
- Form inputs: country (select/create), region (select/create), area (select/create), branch name, branch code, branch type

**State management:**
- All state managed inside `HierarchicalBranchForm`; route component only receives `onSuccess` callback
- TanStack Query likely used inside form component (not visible at this route level)

**Outputs:**
- Renders layout grid with form card and info card
- Emits `onSuccess` callback when form submits successfully

**Side effects:**
- Permission check on load; redirect if lacking permission
- API mutations to create hierarchy nodes (country/region/area/branch)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.hierarchy.X()` — (called inside `HierarchicalBranchForm`, not directly in route)

**Uses these components:**
- `HierarchicalBranchForm` — `@/components/forms/hierarchical-branch-form` — multi-step form for hierarchy + branch creation
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` — shadcn/ui card
- Button, Input, Label, Select — shadcn/ui form primitives

**Uses these hooks:**
- None directly in route component

**Navigation: who navigates here:**
- From `/dashboard/branch/view` via "Create Branch" link button

**Navigation: where it goes:**
- Back to `/dashboard/branch/view` (intended after success, via TODO callback)

---

## 4. Data Shapes

**DB tables touched:**
- `hierarchy_nodes` (tenantDb) — INSERT country, region, area, branch records
- `organizations` (controlPanelDb) — read for org context

**Key types / Zod schemas:**
- `HierarchicalBranchSchema` (from form component) — validates country_name, region_name, area_name, branch_name, branch_code

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Permission guard logic
- Form submission and success callback
- Hierarchy creation with invalid parent IDs
- Concurrent creation requests

---

## 6. Notes

- **TODO:** Success handler is empty; needs navigation to `/dashboard/branch/view` after creation
- Route uses `requirePermission()` guard for RBAC enforcement
- Form component is self-contained; route is primarily a layout wrapper
- No error boundary; relies on form's error handling and toast notifications
