# Services

**Route:** `/dashboard/service/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-26

---

## 1. What It Does

**Purpose (user perspective):** Manage services, categories, rooms, promotions, pricing overrides, and installment plan templates for the organization — all from a single tabbed page.

**Produces:** A full-bleed `bg-[#f3f3f3]` page with a page header (breadcrumb label + h1 + description) and six rounded-pill tabs. Each tab renders a dedicated sub-component; the route itself only renders the header, tab bar, and switches on `tab` param.

**On success:** Tab switching renders the appropriate sub-page.

**On failure / error states:** Handled entirely within sub-components; route renders no error state of its own.

---

## 2. How It Works

**Execution flow:**

1. Route loads with optional search param `tab` (default `"services"`)
2. `validateSearch` coerces the raw string; any value is accepted (unknown → `ServicesPage` fallback)
3. Page header rendered (static text)
4. Tab pill bar rendered from `TABS` constant (6 tabs)
5. Pill click → `Route.useNavigate({ search: { tab: t.id } })`
6. Content switch:
   - `"installments"` → `<InstallmentPlansTab />`
   - `"pricing"` → `<ServicePricingPage />`
   - `"promotions"` → `<PromotionsPage />`
   - `"rooms"` → `<RoomsPage />`
   - `"categories"` → `<ServiceCategoriesPage />`
   - default → `<ServicesPage />`
7. Each sub-component manages its own data fetching, mutations, and UI

**Inputs:**
- Search param: `tab` (one of `services`, `categories`, `rooms`, `promotions`, `pricing`, `installments`; default `"services"`)

**State management:**
- Router search params: tab selection only
- All data state: handled within sub-components

**Outputs:**
- Page header: "Service Catalog" breadcrumb + "Services" h1 + description text
- Tab bar: six rounded-pill buttons with active (black fill) / inactive (border) styling
- Tab content: sub-component for the active tab

**Side effects:**
- Tab navigation updates URL search params
- Sub-components handle all queries, mutations, and cache invalidations

---

## 3. What Depends On It

**Calls these API endpoints:** None directly (all delegated to sub-components)

**Uses these components:**
- `ServicesPage` — `apps/web/src/components/pages/services/services-page.tsx` — service list with search/filter/sort/bulk actions
- `ServiceCategoriesPage` — `apps/web/src/components/pages/services/categories-page.tsx` — category management + commission config
- `RoomsPage` — `apps/web/src/components/pages/services/rooms-page.tsx` — room management
- `PromotionsPage` — `apps/web/src/components/pages/services/promotions-page.tsx` — promotion/discount code management
- `ServicePricingPage` — `apps/web/src/components/pages/services/pricing-page.tsx` — branch price override management
- `InstallmentPlansTab` — `apps/web/src/components/pages/services/installment-plans-tab.tsx` — installment plan template management

**Uses these hooks:**
- `Route.useSearch()` — read `tab` param
- `Route.useNavigate()` — navigate on tab change

**Navigation: who navigates here:**
- Sidebar link (Business → Services → View Services)
- Direct URL

**Navigation: where it goes:**
- Tab selection: updates search param (in-page navigation)
- Sub-components stay in-page (all actions use dialogs)

---

## 4. Data Shapes

**DB tables touched:** None directly (delegated to sub-components)

**Key types:**
```typescript
type SearchParams = {
  tab?: string; // validated but accepts any string; unknown values fall back to ServicesPage
};

// Valid tab IDs (from TABS constant)
type TabId = "services" | "categories" | "rooms" | "promotions" | "pricing" | "installments";
```

---

## 5. Tests

**Test files:** None for the route shell itself.

**Scenarios covered:** (none)

**Not tested (risk areas):**
- Tab switching and search param updates
- Unknown tab param fallback to ServicesPage
- Sub-component rendering per tab

---

## 6. Notes

- **Container layout:** `-m-6 min-h-screen bg-[#f3f3f3] p-6` — negative margin overrides the authenticated layout's padding to produce a full-bleed grey page background.
- **Tab styling:** Rounded-full pill buttons. Active: `bg-[#0a0a0a] text-white`. Inactive: `border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3]`.
- **Tab bar:** Six tabs in order: Services, Categories, Rooms, Promotions, Pricing, Installment Plans.
- **validateSearch:** Accepts any string; unknown values are not rejected — the default `ServicesPage` renders for anything not matching the five explicit cases.
- **Sub-pages:** Each sub-component is fully self-contained (fetches its own data, manages its own mutation state, shows its own error/empty states).
- **beforeLoad guard:** `requirePermission("service_management:read")` — note this is currently a stub in `route-guards.ts` and does not actually gate the route in production.
- **Deep-dive reference:** See `zhub/pages/web-dashboard-service-view.md` for full component details, API calls, state management, and data shapes for all six tabs.
