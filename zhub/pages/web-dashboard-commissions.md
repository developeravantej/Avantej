# Commissions

**Route:** `/dashboard/commissions/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Tab-based commissions dashboard showing user's own commissions ("My Commissions"), all org commissions ("All Commissions", permission-gated), and the payout liability summary ("Liability", permission-gated). Tabs are hidden/shown based on RBAC permissions.

**Produces:** Page shell (icon + title + description + tab band) renders one of three full-page tab components in the scroll region. Default tab is `mine`. Tab is preserved as URL search param.

**On success:** Tab content renders; tab change updates URL.

**On failure / error states:** Each tab manages its own loading / error UI via `PageLoader` + `StatusCallout`. If a permission is missing the tab simply doesn't render.

---

## 2. How It Works

**Execution flow:**
1. Route reads `tab` search param (default `"mine"`).
2. Reads `useUserContext()` to get `hasPermission`.
3. Builds `TABS` array — only adding `"all"` if `commission_management:read` and `"liability"` if `commission_payout:read`.
4. Conditional render:
   - `tab === "all"` → `<AllCommissionsPage />` (`components/pages/commissions/all-tab.tsx`)
   - `tab === "liability"` → `<LiabilityTab />` (`components/pages/commissions/liability-tab.tsx`)
   - else → `<MyCommissionsPage />` (`components/pages/commissions/mine-tab.tsx`)
5. Tab button click → `navigate({ search: { tab: t.id } })`.

**Inputs:**
- URL search param: `tab` (string, defaults to "mine")

**State management:**
- Tab selection: TanStack Router search params (clean URL, bookmark-able).
- Data: each tab component owns its own queries; no shared state between tabs.

**Outputs:** Renders shell + active tab; updates URL search params on tab change.

**Side effects:** None at the route level; tabs trigger their own API calls.

---

## 3. What Depends On It

**Calls these API endpoints:** None directly. All API traffic happens inside the tab components.

**Uses these components:**
- `MyCommissionsPage` (`@/components/pages/commissions/mine-tab`) — KPI strip (Pending / Approved / Total Earned) + read-only DataTable; calls `commissionSplits.getMyCommissions`.
- `AllCommissionsPage` (`@/components/pages/commissions/all-tab`) — KPI strip + status tabs (All/Pending/Approved/Paid/Void) + filters (staff/branch/date) + bulk action bar (approve/markPaid) + per-row Void dialog; calls `commissionSplits.listLedger`, `commissionSplits.void`, plus reads `members.list` and uses `BulkActionBar`.
- `LiabilityTab` (`@/components/pages/commissions/liability-tab`) — date/branch/category filters, sorted-trainer table, CSV export, batch Mark-Paid dialog; calls `commissionSplits.liabilitySummary`, `commissionSplits.markPaidBatch`, `serviceCategories.list`.
- `useUserContext`, `Route.useSearch()`, `Route.useNavigate()`.

**Tab band:** built inline in `view.tsx` (no longer using `ConsolidatedTabs` — replaced with a plain rounded shell + scroll region).

**Navigation: who navigates here:**
- From `/dashboard/commissions/my` redirect (`?tab=mine`).
- Direct links to `/dashboard/commissions/view`.
- Sidebar.

**Navigation: where it goes:**
- Stays on this page; updates `?tab={tabId}`.

---

## 4. Data Shapes

**DB tables touched:** None directly; tab components query `commission_splits` (joined with `appointments`, `sales_orders`, branch enrichment), `service_categories`, and the cross-DB `members` table.

**Key shape — TABS array:**
```typescript
const TABS = [
  { id: "mine", label: "My Commissions" },
  ...(hasPermission("commission_management:read") ? [{ id: "all", label: "All Commissions" }] : []),
  ...(hasPermission("commission_payout:read")    ? [{ id: "liability", label: "Liability" }] : []),
];
```

---

## 5. Tests

**Test files:** None found for this route.

**Not tested (risk areas):**
- Permission-gated tab visibility.
- URL search param sync.
- Tab content switching.

---

## 6. Notes

- **Layout change (May 2026):** Page chrome moved inline (icon, title, sticky tab band, scroll region) — `ConsolidatedTabs` no longer used. Tab buttons are styled border-bottom-2 segments.
- **Permission gating:** If all gated tabs are hidden, the user still sees `MyCommissionsPage` (always visible). No empty-state for "no tabs available".
- **Delegated data loading:** Each tab is fully self-contained — handle its own queries, errors, and bulk actions. Nothing flows back through the route.
- **Companion deep-dive:** see `web-dashboard-commissions-view.md` for the All Commissions tab (ledger, bulk actions, void flow) and `web-dashboard-commissions-my.md` for the legacy redirect.
