# Inventory Options (Brands, Categories, Suppliers)

**Route:** `/dashboard/inventory-options`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/inventory-options.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage inventory configuration across three tabs: Brands, Categories, and Suppliers.

**Produces:** Tab-based dashboard with content for each inventory option type; query parameter tracks active tab.

**On success:** Tab content loads; user can switch tabs via button or URL.

**On failure / error states:** Per-tab error handling (delegated to tab components).

---

## 2. How It Works

**Execution flow:**  
1. Route matches `/dashboard/inventory-options`
2. `validateSearch()` parses `?tab=` param; defaults to "brands"
3. `InventoryOptionsDashboard` renders tabbed UI with three tabs
4. `onTabChange` handler calls `navigate({ search: { tab: v } })` to update URL
5. Each tab mounts its respective page component

**Inputs:**  
- URL query param `tab` (brands|categories|suppliers); defaults to brands

**State management:**  
- Router search state: `{ tab: string }`
- Tab-specific state delegated to child components (BrandsTabPage, CategoriesTabPage, SuppliersTabPage)

**Outputs:**  
- Tab UI with content switching
- URL updates on tab change

**Side effects:**  
- History entry on tab change
- Tab-specific API calls (per child component)

---

## 3. What Depends On It

**Calls these API endpoints:** None (delegated to tab components)

**Uses these components:**  
- `InventoryOptionsDashboard` — `src/components/merge-tables/inventory-options-dashboard.tsx` — tabbed wrapper
- `BrandsTabPage` — `src/components/pages/inventory/brands-tab.tsx` — brands CRUD
- `CategoriesTabPage` — `src/components/pages/inventory/categories-tab.tsx` — categories CRUD
- `SuppliersTabPage` — `src/components/pages/inventory/suppliers-tab.tsx` — suppliers CRUD
- `ConsolidatedTabs` (shadcn/ui variant) — tab component

**Uses these hooks:**  
- `Route.useSearch()` — read tab param
- `Route.useNavigate()` — update tab param

**Navigation: who navigates here:**  
- Dashboard sidebar link

**Navigation: where it goes:** None (internal tab navigation)

---

## 4. Data Shapes

Delegated to child components. See their respective docs.

---

## 5. Tests

**Test files:** `src/__tests__/routes/brands.test.tsx`, `src/__tests__/routes/categories.test.tsx` (may exist)

**Scenarios covered:** Per tab component

**Not tested (risk areas):**  
- Tab switching via URL parameter
- Search parameter validation/parsing
- Default tab fallback to "brands"

---

## 6. Notes

- **Thin wrapper**: This route file is minimal; all logic delegated to tab page components
- **Tab routing**: Uses TanStack Router search params for tab state; shareable URL includes active tab
- **Layout**: Single-level tabs; no nested routing per tab
- **Accessibility**: Tab switching via buttons (handled by ConsolidatedTabs component)

