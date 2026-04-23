# Packages

**Route:** `/dashboard/packages/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage packages: memberships, session packs, and installments.
**Produces:** Tabbed interface with three sub-pages (MembershipsPage, PackageInstancesPage, PackageInstallmentsPage).
**On success:** User sees tab selection UI + active tab content.
**On failure / error states:** Each sub-page handles its own errors (delegated).

---

## 2. How It Works

**Execution flow:** Route → validate search param `?tab=` → render tabbed layout → conditionally render active sub-component
**Inputs:** URL search param `tab` (default: "memberships"); values: "memberships" | "session-packs" | "installments"
**State management:** TanStack Router useSearch + useNavigate for tab switching
**Outputs:** Rendered tab nav + active sub-page component
**Side effects:** URL updates on tab change (search param); browser back/forward works

---

## 3. What Depends On It

**Calls these API endpoints:** Delegated to sub-components
**Uses these components:**
  - `MembershipsPage` — `@/components/pages/packages/memberships-page` — Membership list & management
  - `PackageInstancesPage` — `@/components/pages/packages/instances-page` — Session packs
  - `PackageInstallmentsPage` — `@/components/pages/packages/installments-page` — Installment plans
**Uses these hooks:** TanStack Router (useSearch, useNavigate)
**Navigation: who navigates here:** Dashboard nav, links to /dashboard/packages/view
**Navigation: where it goes:** None (tabs stay on same route, URL updates only)

---

## 4. Data Shapes

**DB tables touched:** Delegated to sub-components
**Key types / Zod schemas:** Search validation: `tab?: string` → "memberships" | "session-packs" | "installments"

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Tab switching, URL sync, invalid tab values (fallback to default)

---

## 6. Notes

- Tab nav is visually inside a rounded card border
- Invalid tab values default to "memberships" (validated via `NAV_TABS.some()`)
- Sub-page components are responsible for their own data fetching and error handling
