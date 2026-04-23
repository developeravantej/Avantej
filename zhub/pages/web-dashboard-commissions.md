# Commissions

**Route:** `/dashboard/commissions/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Tab-based commissions dashboard showing user's own commissions, all commissions (if permitted), and liability information (if permitted). Tabs hidden/shown based on RBAC permissions.

**Produces:** A tabbed interface with three tabs: "My Commissions", "All Commissions" (if `commission_management:read`), and "Liability" (if `commission_payout:read`). Content changes per tab selection. Default tab is "mine".

**On success:** Tab content renders; tab selection preserved in URL search params. Tab changes update URL and load new content.

**On failure / error states:** If permission missing for a tab, that tab is hidden. If data fails to load, error handling deferred to tab components.

---

## 2. How It Works

**Execution flow:**
1. Route loads with search param validation: `tab` defaults to "mine"
2. Component reads `useSearch()` and `useNavigate()` from TanStack Router
3. Component reads `useUserContext()` to check permissions: `commission_management:read`, `commission_payout:read`
4. Renders `ConsolidatedTabs` component with three tab definitions
5. Tab visibility controlled by `hidden` prop (uses `hasPermission()`)
6. Tab content: `MyCommissionsPage`, `AllCommissionsPage`, `LiabilityTab` — each manages its own data fetching
7. Tab change calls `navigate({ search: { tab: v } })` to update URL

**Inputs:**
- URL search param: `tab` (string, defaults to "mine")

**State management:**
- Tab selection managed by TanStack Router search params, not component state
- Data loading deferred to individual tab components (`MyCommissionsPage`, etc.)

**Outputs:**
- Renders: ConsolidatedTabs wrapper with conditional tab content
- Updates URL search params when tab changes

**Side effects:**
- Navigation updates on tab selection
- Each tab component may trigger its own API calls and side effects

---

## 3. What Depends On It

**Calls these API endpoints:**
- None directly in this component
- Delegated to tab components: `MyCommissionsPage`, `AllCommissionsPage`, `LiabilityTab`

**Uses these components:**
- `ConsolidatedTabs` — `@/components/ui/consolidated-tabs` — tabbed interface wrapper
- `MyCommissionsPage` — `@/components/pages/commissions/mine-tab` — shows user's own commissions
- `AllCommissionsPage` — `@/components/pages/commissions/all-tab` — shows all commissions (permission-gated)
- `LiabilityTab` — `@/components/pages/commissions/liability-tab` — shows payout liability (permission-gated)

**Uses these hooks:**
- `useUserContext()` — get permission checker
- `Route.useSearch()` — read tab search param
- `Route.useNavigate()` — navigate on tab change

**Navigation: who navigates here:**
- From `/dashboard/commissions/my` redirect
- Direct links to `/dashboard/commissions/view`

**Navigation: where it goes:**
- Stays on this page; updates search param `?tab={tabId}`

---

## 4. Data Shapes

**DB tables touched:**
- None directly in this route component
- Tab components query: commissions, liability, appointments, sales orders (inferred)

**Key types / Zod schemas:**
```typescript
type CommissionTab = {
  id: "mine" | "all" | "liability";
  label: string;
  content: React.ReactNode;
  hidden?: boolean;
};

type CommissionPageProps = {
  // Inferred from tab components
};
```

---

## 5. Tests

**Test files:** None found for this route

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Permission check logic and tab visibility toggling
- URL search param sync and tab state management
- Tab navigation and content switching
- Interactions between tabs (e.g., data changes in one tab affecting another)

---

## 6. Notes

- **Tab routing:** Uses TanStack Router search params to manage tab state (clean URL, bookmark-able, back-button compatible)
- **Permission-gated tabs:** Uses `hasPermission()` to hide "All Commissions" and "Liability" tabs; no fallback message if all tabs hidden (edge case)
- **Delegated data loading:** Each tab component is responsible for its own queries; no shared state management between tabs
- **Tab component imports:** `AllCommissionsPage` partially examined (see read output) — validates use of TanStack Query, `client.X()` calls, and commission data shapes
