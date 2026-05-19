# Test Plan: Dashboard Home

**Route:** `/dashboard`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Org: Test Fitness Franchise (ID: 996febce-aaad-4ded-8f47-02d2b566c8ee)
- Tenant DB has some sales orders, appointments, and members

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard`
**Steps:**
1. Log in, navigate to `/dashboard`
2. Wait for all widgets to load
**Expected:**
- GreetingBanner visible with user name
- QuickActions section visible
- SectionHeader visible
- KPI cards: Sales Overview, Appointments, Active Members
- Revenue by Branch table
- AppointmentsWidget, AnnouncementsWidget, PayrollWidget, ClaimsWidget visible
- ExpiringMembershipsWidget visible
- PendingApprovalsWidget visible
- No console errors

### TC-02: Period filter — default is "this_month"
**Trigger:** Load dashboard with no search params
**Steps:**
1. Navigate to `/dashboard`
**Expected:**
- Default period is "this_month"
- KPI data reflects current month

### TC-03: Period filter — switch periods
**Trigger:** Change period via URL
**Steps:**
1. Navigate to `/dashboard?period=today`
2. Then `/dashboard?period=this_week`
3. Then `/dashboard?period=this_year`
**Expected:**
- Each period change triggers new KPI query
- Period label in cards updates (Today, This Week, This Year)
- Revenue by Branch re-fetches

### TC-04: KPI cards loading state
**Trigger:** Observe before API responds
**Steps:**
1. Navigate to `/dashboard`
2. Observe immediately
**Expected:**
- Skeleton loading states visible in all KPI cards
- TableRowSkeleton shown in Revenue by Branch section

### TC-05: Sales KPI card populated
**Trigger:** Wait for KPI data
**Steps:**
1. Navigate to `/dashboard`, wait for load
**Expected:**
- "SALES OVERVIEW" label
- Total sales amount in MYR format
- Order count with "order/orders" text
- Period label (e.g., "This Month")

### TC-06: Appointments KPI card populated
**Trigger:** Wait for KPI data
**Steps:**
1. Navigate to `/dashboard`, wait
**Expected:**
- "APPOINTMENTS" label
- Total count as large number
- Completed count and completion percentage
- Progress bar showing completion rate (0-100%)

### TC-07: Active Members KPI card populated
**Trigger:** Wait for KPI data
**Steps:**
1. Navigate to `/dashboard`, wait
**Expected:**
- "ACTIVE MEMBERS" label
- Member count as large number

### TC-08: Revenue by Branch table — populated state
**Trigger:** Wait for KPI data with multiple branches
**Steps:**
1. Navigate to `/dashboard`, wait
**Expected:**
- Table with columns: Branch, Revenue, Orders
- Each branch row shows formatted revenue (formatPrice, MYR)
- Top row sorted by revenue descending

### TC-08b: Staff Performance card
**Trigger:** Wait for staff data
**Expected:**
- "Staff Performance" section visible
- Staff rows show: truncated staffId (8 chars + ...), appointments completed, commission (MYR)
- Top 10 by appointmentsCompleted shown
- Empty state if no data for period

### TC-08c: QuickInsight banner
**Trigger:** KPI data loaded
**Expected:**
- QuickInsight shows contextual sentence about appointments (if any) or active members
- Completion rate percentage shown

### TC-09: Revenue by Branch — empty state
**Trigger:** Period with no revenue data
**Steps:**
1. Navigate to `/dashboard?period=today` with no sales today
**Expected:**
- "No revenue data for this period" message shown

### TC-10: Announcements widget
**Trigger:** Check widget state
**Steps:**
1. Navigate to `/dashboard`, wait
**Expected:**
- AnnouncementsWidget renders (active announcements shown or empty state)
- Wired to `client.announcements.listActive`

### TC-11: Claims widget
**Trigger:** Check widget state
**Steps:**
1. Navigate to `/dashboard`, wait
**Expected:**
- ClaimsWidget renders (pending expenses or empty state)
- Wired to `client.expenses.list(status:"pending")`

### TC-12: PendingApprovalsWidget — admin view
**Trigger:** Admin user loads dashboard
**Steps:**
1. Log in as admin user
2. Navigate to `/dashboard`
**Expected:**
- PendingApprovalsWidget shows pending package approvals count
- Link/button to `/dashboard/operations/approvals`

### TC-13: ExpiringMembershipsWidget
**Trigger:** Load dashboard
**Steps:**
1. Navigate to `/dashboard`, wait
**Expected:**
- Widget renders with expiring memberships or empty state
- No crash

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.analytics.getDashboardKpis({ organizationId, period })` | TC-01, TC-03, TC-04 |
| `client.analytics.getStaffPerformance({ organizationId, period })` | TC-01, TC-03 |
| `client.announcements.listActive` | TC-10 |
| `client.expenses.list({ status: "pending" })` | TC-11 |
| `client.packageInstances.listPending` (or similar) | TC-12 |
| `useUserContext()` | TC-01 |

## Edge Cases

### EC-01: No organization in context
**Setup:** User has no active org
**Expected:** "No organization selected" or redirect to onboarding

### EC-02: Large revenue numbers
**Setup:** Org with millions in revenue
**Expected:** formatPrice handles large numbers; no overflow in KPI card

### EC-03: Completion rate 0% (no appointments)
**Setup:** Period with no appointments at all
**Expected:** Progress bar shows 0% width; `—` shown for completion rate

### EC-04: Invalid period param
**Setup:** Navigate to `/dashboard?period=invalid`
**Expected:** Zod schema `.default("this_month")` catches invalid enum; falls back to "this_month"

## Known Gaps
- Individual widget APIs (PayrollWidget, AppointmentsWidget) not inspected in detail
- QuickActions component content not confirmed
- ExpiringMembershipsWidget and PendingApprovalsWidget exact API procedures not confirmed
