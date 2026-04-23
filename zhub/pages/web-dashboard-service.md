# Services

**Route:** `/dashboard/service/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage services and service categories offered by the organization; switch between two tabs: Services and Categories.

**Produces:** Tab-based interface — Services tab shows ServicesPage component, Categories tab shows ServiceCategoriesPage component.

**On success:** Tab switching renders appropriate sub-page

**On failure / error states:** None directly on this page (errors handled in sub-components)

---

## 2. How It Works

**Execution flow:**

1. Route loads with optional search param tab (default "services")
2. Router validates search params and extracts tab value
3. Render tabs header with two tabs: Services, Categories
4. Tab click updates search param and navigates (in-page)
5. Conditionally render tab content:
   - If tab === "services": render ServicesPage component
   - If tab === "categories": render ServiceCategoriesPage component
6. Each sub-page manages its own data fetching, mutations, and UI

**Inputs:**
- Search param: tab (services or categories, default services)

**State management:**
- Router search params: tab selection
- Sub-component state: handled in ServicesPage and ServiceCategoriesPage

**Outputs:**
- Tab header with active/inactive styling
- Conditional tab content (ServicesPage or ServiceCategoriesPage)

**Side effects:**
- Tab navigation updates URL search params
- Sub-components handle their own side effects (queries, mutations)

---

## 3. What Depends On It

**Calls these API endpoints:** None directly (delegated to sub-components)

**Uses these components:**
- ServicesPage from @/components/pages/services/services-page — services tab content
- ServiceCategoriesPage from @/components/pages/services/categories-page — categories tab content

**Uses these hooks:**
- Route.useSearch() — read tab param
- Route.useNavigate() — navigate on tab change

**Navigation: who navigates here:**
- Sidebar link
- Direct URL

**Navigation: where it goes:**
- Tab selection: updates search param (in-page navigation)
- Sub-components may navigate elsewhere (not specified here)

---

## 4. Data Shapes

**DB tables touched:** None directly (delegated to sub-components)

**Key types:**
```typescript
type SearchParams = {
  tab?: "services" | "categories";
};
```

---

## 5. Tests

**Test files:** None found matching service-view pattern

**Scenarios covered:** (none)

**Not tested (risk areas):**
- Tab switching and search param updates
- Tab content rendering
- Search param validation

---

## 6. Notes

- **Container layout:** Full viewport height (calc(100vh-48px)) with rounded border and shadow; flex column with shrink-0 header, tabs, and growing content area
- **Tab styling:** Custom button-based tabs with border-b-2 underline indicator; border-transparent default, border-foreground when active
- **Legacy notice:** File header comments "LEGACY — slated for rewrite; do not extend"
- **Tab header:** Fixed, shrink-0; services/categories management title and description
- **Sub-pages:** ServicesPage and ServiceCategoriesPage handle all content, data, and mutations
- **Search params:** tab defaults to "services" if not provided; validated via Route.validateSearch()
