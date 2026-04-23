# Units of Measure (UoM)

**Route:** `/dashboard/uom/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/uom/view.tsx`
**Platform:** web
**Auth required:** Inherited from layout (likely authenticated)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage units of measure and their conversions. Two-tab interface: Units (base UoMs) and Conversions (derived UoMs with factors).

**Produces:** Tabbed layout with ConsolidatedTabs component. Units tab shows table of base units; Conversions tab shows table of conversion factors.

**On success:** Tab switch updates query param (`?tab=units` or `?tab=conversions`). Each tab manages its own create/edit/delete dialogs.

**On failure / error states:** Loading, error, and empty states managed by individual tab components (UnitsTabPage and UomConversionsTabPage).

---

## 2. How It Works

**Execution flow:**
1. On mount: Parse search params for `tab` (default: "units")
2. Render ConsolidatedTabs with two tabs: units, conversions
3. Tab click: `navigate({ search: { tab: v } })` updates URL
4. Active tab content: `UnitsTabPage` or `UomConversionsTabPage` renders based on `tab` value

**Inputs:**
- Search param: `?tab=units` or `?tab=conversions`

**State management:**
- TanStack Router: `Route.useSearch()` provides `tab`
- `Route.useNavigate()` for tab changes
- Each tab component (UnitsTabPage, UomConversionsTabPage) manages its own TanStack Query state

**Outputs:** Tabbed UI; clicking tabs updates URL; tab content re-mounts or re-renders

**Side effects:** URL updates when tab changes; browser history updated

---

## 3. What Depends On It

**Calls these API endpoints:** (delegated to tab components)

**Uses these components:**
- `ConsolidatedTabs` — tabbed interface from `@/components/ui/consolidated-tabs`
- `UnitsTabPage` — `@/components/pages/uom/units-tab` — base units tab
- `UomConversionsTabPage` — `@/components/pages/uom/conversions-tab` — conversion factors tab

**Uses these hooks:**
- `Route.useSearch()` — parse search params
- `Route.useNavigate()` — change tab

**Navigation: who navigates here:** `/dashboard/uom/view` route

**Navigation: where it goes:** None (internal tabs only)

---

## 4. Data Shapes

**DB tables touched:** (delegated to tab components; see units-tab and conversions-tab docs)

**Key types / Zod schemas:**
```typescript
// Route search validation
type Search = {
  tab: string; // "units" | "conversions"
};
```

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/uom.test.tsx`

**Scenarios covered:** (check test file)

**Not tested (risk areas):** 
- Tab switching and URL persistence
- Search param validation (what if invalid tab name?)
- Default tab behavior

---

## 6. Notes

- **Tab consolidation pattern:** Two separate logical pages (units, conversions) unified under one URL with query param
- **Delegated logic:** This page is a router + layout; actual data logic in UnitsTabPage and UomConversionsTabPage
- **No LEGACY comment** — actively maintained
- **Search validation:** Simple string validation; defaults to "units" if missing or invalid
- **No RBAC here:** Auth likely enforced at layout level or on parent route

