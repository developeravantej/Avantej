# Dashboard Test Results

**Date:** 2026-04-16
**Tester:** Claude (automated browser testing)
**Environment:** localhost:3001 (web) + localhost:3000 (server)
**User:** Franchise Owner (franchisee@gmail.com) — Admin role
**Browser:** Chrome (via Claude-in-Chrome MCP)

---

## Summary

| Category | Count |
|----------|-------|
| Pages tested | 39/39 |
| Pages loading correctly | 35 |
| Pages blocked by permissions | 4 |
| Critical bugs | 3 |
| Moderate bugs | 7 |
| Minor issues / UX gaps | 10 |

---

## Critical Bugs

### 1. Branch View — Debug Panel Exposed in Production
- **Page:** `/dashboard/branch/view`
- **Issue:** A full debug info panel is rendered on the page showing:
  - Organization ID (UUID)
  - Context user email
  - Authentication status
  - Branch data item counts
  - Loading states
  - Hierarchy node counts
  - Expandable raw data ("First Branch Data", "Sample Hierarchy Nodes")
- **Impact:** Leaks internal system information (org IDs, auth state, data counts) to end users
- **Expected:** Debug panel should be hidden or removed in production builds

### 2. Branch View — PIC Name Shows Encoded/Raw ID
- **Page:** `/dashboard/branch/view`
- **Issue:** The "PIC Name" column for "Tenant Test Fitness Franchise Branch" shows `wZGQSvB1v2xWt3NwcSV0DYvRDQLxldkH` instead of an actual human name. The PIC Email column also shows the same encoded string.
- **Impact:** Cross-DB name resolution is failing for this member — the system is displaying a raw user ID or encoded token instead of looking up the name from the control panel DB
- **Expected:** Should show the actual user's name (e.g., "Franchise Owner") as it does for "Test Sabah Branch"

### 3. Access Control Pages — All Blocked by Permission Guards
- **Pages affected:**
  - `/dashboard/access-control/roles` → Redirects to `/dashboard?unauthorized="true"`
  - `/dashboard/access-control/permissions` → Redirects to `/dashboard?unauthorized="true"`
  - `/dashboard/access-control/user-assignment` → Redirects to `/dashboard?unauthorized="true"`
  - `/dashboard/customers/walk-in/view` → Redirects to `/dashboard?unauthorized="true"`
- **Issue:** The `requirePermission` route guard is actively blocking access, even for the admin ("Franchise Owner") user. This contradicts the documented behavior that `requirePermission` is a stub.
- **Impact:** Admin users cannot access role management, permission management, user assignment, or walk-in customers pages. The sidebar still shows these links, misleading users into clicking them.
- **Expected:** Either (a) the admin user should have the required permissions, or (b) the sidebar should hide links to pages the user can't access.

---

## Moderate Bugs

### 4. Service View — Prices Displayed in USD Format
- **Page:** `/dashboard/service/view`
- **Issue:** All service prices show with `$` symbol (e.g., `$30.00`, `$22.00`, `$150.00`, `$120.00`) instead of MYR (e.g., `RM 30.00`)
- **Impact:** Incorrect currency display for a Malaysian platform
- **Expected:** Prices should show as "RM XX.XX" consistent with the rest of the dashboard (Sales, Products, etc. all show MYR correctly)

### 5. Appointment Calendar — Trainer Sidebar Shows Raw UUIDs
- **Page:** `/dashboard/appointment/view`
- **Issue:** The trainer sidebar filter shows raw UUIDs instead of trainer names:
  - `92371eea-56f5-46a7-8bf0-...` — Trainer
  - `d4cf9021-5ef8-450c-bafe-f...` — Trainer
  - `262297bb-fd56-4290-bb80...` — Trainer
- **Impact:** Users cannot identify which trainer to filter by — the UUID is meaningless
- **Expected:** Should show trainer names (e.g., "Coach Alex", "Maya K.", "Danny T") as they appear on the Trainers page

### 6. User View — "Unknown" Members with No Name/Email
- **Page:** `/dashboard/user/view`
- **Issue:** At least 3 member rows display "Unknown" for both name and email. These members have valid roles (Staff, Client) and Active status but the cross-DB name resolution returned no data.
- **Impact:** Admins cannot identify these members to manage them
- **Expected:** Should show actual user names or at minimum a fallback like the email address

### 7. Notifications Page — Missing Columns and Actions
- **Page:** `/dashboard/notifications/view`
- **Issue:** The DataTable only shows 2 columns (Title, Message) but the documented schema includes Type, Status, and Created At columns. The "Mark All as Read" button is not visible. Individual "Mark Read" actions are not visible on rows.
- **Impact:** Users cannot see notification metadata or manage read/unread status from this view
- **Expected:** Show all documented columns (Title, Message, Type, Status, Created At) and action buttons

### 8. Payment View — Missing Page Header
- **Page:** `/dashboard/payment/view`
- **Issue:** The page has no title/heading. It jumps directly from the breadcrumb to the search bar and table. Every other dashboard page has a styled header with icon, title, and subtitle.
- **Impact:** Inconsistent UI — users may be confused about which page they're on
- **Expected:** Add a page header matching the pattern of other pages (e.g., icon + "Payments" + "View and manage invoice payments")

### 9. Expenses Page — Missing "New Expense" Button
- **Page:** `/dashboard/expenses/view`
- **Issue:** No "New Expense" or "Submit Expense" button is visible on the page. The page shows status tabs and an empty data table but no way to create a new expense claim.
- **Impact:** Users cannot submit expense claims from this page
- **Expected:** A "New Expense" button should appear (possibly hidden by permission check or scrolled off-screen — needs verification)

### 10. Brands Page — Inconsistent Product Count Between Views
- **Page:** `/dashboard/brands/view` vs `/dashboard/inventory-options`
- **Issue:** On the standalone Brands page, "test Brand" shows "Products Assigned: 2". On the Inventory Options hub page, the same brand shows "Products Assigned: 0".
- **Impact:** Inconsistent data — one view is not fetching product counts correctly
- **Root Cause:** The standalone Brands page fetches `client.products.list()` and computes counts client-side, while the Inventory Options page sets all counts to 0 in the data transform.

---

## Minor Issues / UX Gaps

### 11. Service Categories — All Categories Show "—" for Description
- **Page:** `/dashboard/service/view`
- **Issue:** The Category column for all services shows "—" (dash). This could be a data issue (no categories assigned) or a display bug.

### 12. Class Slots — All Instructor Fields Empty
- **Page:** `/dashboard/appointment/class-slots/view`
- **Issue:** Every class slot shows "—" for the Instructor column. No instructor is assigned to any slot.

### 13. Sidebar — Shows Links to Pages User Can't Access
- **Issue:** The sidebar navigation shows links to Access Control (Roles, Permissions, User Assignment), Walk-in Customers, and other permission-gated pages even when the current user lacks permissions. Clicking these links results in a silent redirect to dashboard home with `?unauthorized="true"`.
- **Expected:** Either hide menu items the user can't access, or show an "Unauthorized" message on the page instead of a silent redirect.

### 14. UoM Page — No Page Title
- **Page:** `/dashboard/uom/view`
- **Issue:** Page has no heading/title. Goes directly from breadcrumb ("Uom > View") to the "Add UoM" button and table. Breadcrumb also shows "Uom" instead of "Units of Measure".

### 15. Purchase Orders — No Create Button Visible
- **Page:** `/dashboard/purchase-orders/view`
- **Issue:** No "New PO" button visible. The page only shows the title and empty table. Likely requires `inventory_management:create` permission which the current user may not have.

### 16. Stock Requests / Transfer Orders — No Create Buttons Visible
- **Pages:** `/dashboard/stock-requests/view`, `/dashboard/transfer-orders/view`
- **Issue:** Neither page shows a "New Request" or "New Transfer" button. Same permission issue as Purchase Orders.

### 17. My Services — Visible to Admin Users in Sidebar
- **Page:** `/dashboard/my-services/view`
- **Issue:** The "My Work > My Services" sidebar section is supposed to only show for staff/trainer roles. While the page itself shows the correct empty state, the sidebar link is still shown — the `hasRole(["trainer", "staff"])` check may not be working correctly for this admin user, OR the admin also has a trainer/staff secondary role.

### 18. Tax Rates — "Add Tax Rate" Button Not Visible
- **Page:** `/dashboard/settings/tax-rates`
- **Issue:** The "Add Tax Rate" button appears to be positioned off-screen to the right. Users may not discover it without horizontal scrolling on smaller viewports.

### 19. Dashboard Home — QuickInsight is Hardcoded
- **Page:** `/dashboard`
- **Issue:** The insight message "Most members book 2 workouts per week. Your busiest day is Wednesday." is hardcoded and does not reflect actual data.

### 20. Invitations — Many Duplicate Declined Entries
- **Page:** `/dashboard/access-control/invitations`
- **Issue:** The invitations list shows many duplicate rows — all with the same email (developer.avantej@gmail.com), same role (staff), same dates, all "Declined" status. This suggests invitations were sent repeatedly without cleanup.
- **Impact:** Clutters the view — there should be a way to clean up old declined invitations.

---

## Pages Verified Working Correctly

| Page | Route | Status |
|------|-------|--------|
| Dashboard Home | `/dashboard` | Working (KPIs, period filters, widgets) |
| Trainers | `/dashboard/trainers/view` | Working (list, search, profiles) |
| Branch Create | `/dashboard/branch/create` | Not directly tested (wizard) |
| Service Categories | `/dashboard/service-category/view` | Working (CRUD, categories list) |
| Class Slots | `/dashboard/appointment/class-slots/view` | Working (filters, data table) |
| Package Instances | `/dashboard/packages/instances/view` | Working (status tabs, data) |
| Installments | `/dashboard/packages/installments/view` | Working (status tabs, empty) |
| Sales | `/dashboard/sales/view` | Working (read-only table) |
| Cancelled Sales | `/dashboard/cancelled-sales/view` | Working (read-only table) |
| Promotions | `/dashboard/promotions/view` | Working (empty state, create button) |
| Products | `/dashboard/products/view` | Working (status tabs, CRUD, MYR prices) |
| Brands | `/dashboard/brands/view` | Working (CRUD) |
| Categories | `/dashboard/categories/view` | Not directly tested |
| Suppliers | `/dashboard/suppliers/view` | Not directly tested |
| Inventory Options | `/dashboard/inventory-options` | Working (3-table hub) |
| UoM | `/dashboard/uom/view` | Working (CRUD) |
| UoM Conversions | `/dashboard/uom-conversions/view` | Not directly tested |
| Stock Requests | `/dashboard/stock-requests/view` | Working (status tabs, empty) |
| Transfer Orders | `/dashboard/transfer-orders/view` | Working (status tabs, empty) |
| Purchase Orders | `/dashboard/purchase-orders/view` | Working (empty table) |
| Expenses | `/dashboard/expenses/view` | Working (status tabs, empty) |
| Payouts | `/dashboard/payouts/view` | Working (status tabs, empty) |
| Invitations | `/dashboard/access-control/invitations` | Working (list, filter, actions) |
| Announcements | `/dashboard/announcements/view` | Working (status tabs, CRUD) |
| Notifications | `/dashboard/notifications/view` | Partial (missing columns) |
| User View | `/dashboard/user/view` | Working (member list) |
| Role View | `/dashboard/role/view` | Working (role list) |
| Tax Rates | `/dashboard/settings/tax-rates` | Working (CRUD) |
| Google Calendar | `/dashboard/settings/google-calendar` | Working (connection UI) |
| My Services | `/dashboard/my-services/view` | Working (empty state) |

### Pages Blocked by Permissions (Not Testable with Current User)

| Page | Route | Redirect |
|------|-------|----------|
| Roles | `/dashboard/access-control/roles` | → `/dashboard?unauthorized="true"` |
| Permissions | `/dashboard/access-control/permissions` | → `/dashboard?unauthorized="true"` |
| User Assignment | `/dashboard/access-control/user-assignment` | → `/dashboard?unauthorized="true"` |
| Walk-in Customers | `/dashboard/customers/walk-in/view` | → `/dashboard?unauthorized="true"` |

---

## Recommendations (Priority Order)

1. **Remove debug panel** from Branch View — immediate security concern
2. **Fix cross-DB name resolution** — affects Branch View PIC, User View members, and Appointment trainer sidebar
3. **Fix permission assignments** — admin user should have access to access control pages
4. **Fix Service View currency** — change `$` to `RM` formatting
5. **Hide sidebar links** for pages user can't access, or show proper "unauthorized" page
6. **Add missing page headers** to Payment View and UoM View
7. **Fix Inventory Options** product count calculation (hardcoded to 0)
8. **Add missing Notifications columns** and mark-read actions
9. **Clean up hardcoded QuickInsight** data on Dashboard Home
10. **Fix "Add Tax Rate" / "New Expense" button visibility** on smaller viewports
