# Dashboard Home

**Route:** `/dashboard`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Central command screen showing KPIs, analytics, and activity widgets for the organization.
**Produces:** Greeting banner, quick actions, period-filtered KPI cards (Sales Overview, Appointments, Active Members), Revenue by Branch table, Staff Performance table, and widget panels for appointments, announcements, payroll, and claims.
**On success:** All cards and widgets populate with live data after queries resolve.
**On failure / error states:** Each section renders skeleton placeholders while loading. Widget components manage their own error states. The KPI queries have a 1-minute stale time; no explicit error UI at this level.

---

## 2. How It Works

**Execution flow:**
```
DashboardComponent
  → useUserContext() → organizationId
  → useQuery(analytics.getDashboardKpis)  → client.analytics.getDashboardKpis({ organizationId, period })
  → useQuery(analytics.getStaffPerformance) → client.analytics.getStaffPerformance({ organizationId, period })
  → <GreetingBanner /> (links to /dashboard/notifications/view)
  → <QuickActions />
  → Period filter pills (local state: Period)
  → SalesCard / AppointmentsKpiCard / ActiveMembersCard (from kpiData)
  → RevenuByBranchCard (from kpiData)
  → StaffPerformanceCard (from staffData)
  → <AppointmentsWidget /> / <AnnouncementsWidget /> / <PayrollWidget /> / <ClaimsWidget />
```

**Inputs:** No URL/query params. Period filter is local state (default: `"this_month"`).
**State management:** `useState<Period>` for period filter; TanStack Query for KPI and staff data.
**Outputs:** Read-only display — no mutations on this page.
**Side effects:** None. Queries stale after 60 seconds.

**Period mapping quirk:** `getStaffPerformance` does not accept `"today"` — when `period === "today"` the staff query sends `"this_week"` instead.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `analytics.getDashboardKpis` — total sales (cents), order count, total/completed appointments, active members count, revenue-by-branch breakdown
- `analytics.getStaffPerformance` — per-staff appointment count and commission (cents)

**Uses these components:**
- `GreetingBanner` — `apps/web/src/components/dashboard/greeting-banner.tsx` — time-of-day greeting + notification bell link
- `QuickActions` — `apps/web/src/components/dashboard/quick-actions.tsx` — shortcut buttons
- `SectionHeader` — `apps/web/src/components/dashboard/section-header.tsx` — styled section label
- `QuickInsight` — `apps/web/src/components/dashboard/quick-insight.tsx` — static insight chip
- `AppointmentsWidget` — `apps/web/src/components/appointments-widget.tsx` — recent appointments list
- `AnnouncementsWidget` — `apps/web/src/components/announcements-widget.tsx` — active announcements
- `PayrollWidget` — `apps/web/src/components/payroll-widget.tsx` — payroll summary
- `ClaimsWidget` — `apps/web/src/components/claims-widget.tsx` — pending expense claims

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId` to scope all queries

**Navigation: who navigates here:**
- App sidebar "Home" link — `/dashboard`
- Logo link in sidebar header — `/dashboard`
- Default redirect after login

**Navigation: where it goes:**
- `/dashboard/notifications/view` — bell icon in `GreetingBanner`

---

## 4. Data Shapes

**DB tables touched (via analytics service):**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `sales_orders` | SELECT aggregate | `total`, `created_at`, `status` |
| `appointments` | SELECT aggregate | `status`, `created_at` |
| `members` | SELECT count | `isActive` |
| `hierarchy_nodes` | SELECT | `id`, `name`, `type` |
| `commission_splits` | SELECT aggregate | `calculatedAmount`, `staffId` |

**Key types:**
```typescript
type Period = "today" | "this_week" | "this_month" | "this_year";

interface KpiData {
  totalSales: number;          // cents
  salesOrderCount: number;
  totalAppointments: number;
  completedAppointments: number;
  activeMembersCount: number;
  revenueByBranch: Array<{
    branchId: string;
    branchName: string | null;
    totalRevenue: number;      // cents
    orderCount: number;
  }>;
}

interface StaffRow {
  staffId: string;
  memberId: string;
  appointmentsCompleted: number;
  totalCommission: number;     // cents
}
```

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/dashboard.test.tsx`
**Scenarios covered:**
- Renders heading without crashing
- Defaults to `this_month` period on mount
- Renders all four period selector tabs
- Switching to "Today" maps staff performance period to `"this_week"`
- KPI card formats cents → MYR correctly (250000 → "2,500")
- Displays order count label
- Completion rate shown as percentage
- Revenue-by-branch table renders branch names
- KPI card titles ("Sales Overview", "Active Members", "Revenue by Branch", "Staff Performance") visible

**Not tested:** Error states, empty branch list, staff performance sorting, `QuickActions` / widget interactions.

---

## 6. Notes

- `QuickInsight` message is currently hardcoded: `"Most members book 2 workouts per week. Your busiest day is Wednesday."` — not data-driven.
- Staff Performance card shows top 10 entries sorted by `appointmentsCompleted` desc (client-side sort).
- `formatRM` is a local helper (not from `lib/currency`) — converts integer cents to `RM X,XXX.XX` string.
- The `RevenuByBranchCard` has a typo in the component name: `RevenuByBranchCard` (missing 'e').
