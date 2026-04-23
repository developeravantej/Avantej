# Dashboard Home / Overview

**Route:** `/dashboard`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Main dashboard landing page showing KPI cards, analytics, and activity widgets for organization management (sales, appointments, members, staff performance, payroll, claims).

**Produces:** Multi-section layout: greeting banner, quick actions, period filter pills, 3 KPI cards (sales, appointments, active members), quick insight message, revenue by branch table, staff performance table, and activity widgets (appointments, expiring memberships, announcements, payroll, claims).

**On success:** Displays real-time analytics data filtered by selected period (today, this_week, this_month, this_year); links to detailed pages for sales, appointments, memberships.

**On failure / error states:** Skeleton loaders show while data fetches. Empty states show if no data for period. KPI cards remain empty until API returns data.

---

## 2. How It Works

**Execution flow:**
1. Page loads; reads `period` from search params (defaults to `this_month`)
2. Calls `client.analytics.getDashboardKpis({ organizationId, period })`
3. Calls `client.analytics.getStaffPerformance({ organizationId, period })` with mapped period
4. Renders KPI cards, revenue table, staff table, and child widgets once data arrives
5. User clicks period pill → updates search param → queries re-run with new period

**Inputs:** Query param `period` (optional); organizationId from useUserContext

**State management:** TanStack Query for KPI and staff data; search params for period filter; useUserContext for org ID

**Outputs:** API calls to `client.analytics.*`; renders charts and tables; links to detail pages

**Side effects:** Query cache invalidation on period change; localStorage access in useUserContext

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.analytics.getDashboardKpis({ organizationId, period })` — KPI data (sales, appointments, members, revenue by branch)
- `client.analytics.getStaffPerformance({ organizationId, period })` — staff appointments and commission

**Uses these components:**
- `GreetingBanner` — `@/components/dashboard/greeting-banner` — welcome message
- `QuickActions` — `@/components/dashboard/quick-actions` — action buttons
- `SectionHeader` — `@/components/dashboard/section-header` — section titles
- `QuickInsight` — `@/components/dashboard/quick-insight` — contextual message
- `AppointmentsWidget, ExpiringMembershipsWidget, AnnouncementsWidget, PayrollWidget, ClaimsWidget` — activity/team cards
- `Card, CardContent` — `@/components/ui/card` — layout
- `Skeleton` — `@/components/ui/skeleton` — loading placeholders
- `Link` — TanStack Router — navigate to detail pages

**Uses these hooks:**
- `useUserContext` — fetch org ID and user data
- `useQuery` — TanStack Query for analytics
- `useNavigate, useSearch` — TanStack Router navigation and search params

**Navigation: who navigates here:** From login, direct URLs, sidebar links

**Navigation: where it goes:** `/dashboard/sales/view`, `/dashboard/appointment/view`, `/dashboard/memberships/view` (KPI card links)

---

## 4. Data Shapes

**DB tables touched:** (Backend: sales orders, appointments, organization members, staff commissions)

**Key types / Zod schemas:**
```typescript
// Search params
dashboardSearchSchema = z.object({
  period: z.enum(["today", "this_week", "this_month", "this_year"]).default("this_month"),
})

// KPI data
interface KpiData {
  totalSales: number;               // in cents
  salesOrderCount: number;
  totalAppointments: number;
  completedAppointments: number;
  activeMembersCount: number;
  revenueByBranch: Array<{
    branchId: string;
    branchName: string | null;
    totalRevenue: number;
    orderCount: number;
  }>;
}

// Staff performance data
interface StaffRow {
  staffId: string;
  memberId: string;
  appointmentsCompleted: number;
  totalCommission: number;           // in cents
}
```

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/dashboard.test.tsx`

**Scenarios covered:**
- Renders dashboard heading and period selector tabs
- Defaults to "this_month" period on load
- Switches period and calls correct analytics endpoints
- KPI cards display formatted sales (cents → currency) and appointment counts
- Completion rate calculated and shown as percentage
- Revenue by branch table renders branch data
- Staff performance table shows top 10 by appointments
- All widget titles and child components render

**Not tested (risk areas):** Error boundary handling, large data sets (pagination), real-time updates, concurrent period changes, accessibility (keyboard nav, screen readers)

---

## 6. Notes

- Sales total is displayed in MYR currency (from formatPrice helper).
- Staff performance sorted by appointments, top 10 shown.
- staleTime is 1 minute; cache not invalidated on search param change, but new queries made with updated period.
- Quick insight message contextualizes completion rate or member count based on data.
- Period "today" maps to "this_week" for staff performance (weekly context).
- All widgets (AppointmentsWidget, PayrollWidget, etc.) have their own query logic and error handling.
- Child widgets are mocked in tests to isolate dashboard component testing.
