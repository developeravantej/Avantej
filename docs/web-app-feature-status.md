# Web App Feature Status

Comprehensive audit of all pages and features in `apps/web/src/routes/`.

**Legend:**
- **Complete** — Fully functional with real API integration
- **Partial** — Some functionality works but has mock data, stubs, or missing features
- **Stub** — Placeholder or "coming soon" with no real functionality

---

## Summary (Revised after deep audit — 2026-04-07)

| Status | Count | Notes |
|--------|-------|-------|
| Truly Complete | 30 | Working API, adequate validation and error handling |
| Functional but has issues | 12 | API works but missing validation, error states, or permission guards |
| Partial (Mock/Stub) | 4 | Key features use mock data or stub handlers |
| Stub/Placeholder | 2 | No functionality at all |
| **Total** | **48** | |

> **See full implementation plan:** [`Plan/web-app-completion/`](../Plan/web-app-completion/README.md)

---

## Critical Finding: Route Guards Are Stubs

**ALL permission guard functions in `apps/web/src/lib/route-guards.ts` are stubs.** `requirePermission()`, `requireAnyPermission()`, `requireRole()`, and `requireSystemAdmin()` only check if the user is logged in — they never verify actual permissions. Any authenticated user can access any route including admin pages. 5 additional routes have no guard at all.

---

## Quick View: All Issues Requiring Attention

| Page / Component | Issue | Priority |
|------------------|-------|----------|
| **Route Guards** (`route-guards.ts`) | All 4 guard functions are stubs — no permission checking | Critical |
| **5 unguarded routes** (class-slots, packages, customers, walk-in) | No `requirePermission()` at all | Critical |
| **verify-email** | Open redirect vulnerability via `callbackURL` param | Critical |
| [Onboarding](#onboarding) | Organization creation uses mock API; name check is hardcoded | High |
| [App Sidebar](#app-sidebar-component) | Hardcoded user/team data; some URLs are `#` or `'...'` stubs | High |
| [Appointment Calendar](#appointments) | Confirm/Cancel/Edit buttons only console.log; Add button is empty | High |
| [Add Appointment Modal](#appointments) | Mock rooms and employees arrays; 16+ alert() calls | High |
| [Roles (Access Control)](#access-control) | MOCK_RESOURCES, MOCK_ROLES, MOCK_USER_COUNTS constants | High |
| [Permissions (Access Control)](#access-control) | Delete/Duplicate/Save handlers are empty stubs | High |
| [User Assignment](#access-control) | "Edit User" menu item has no onClick handler | High |
| [Stock Requests](#stock-management) | Items array always empty — item details never display | High |
| [Transfer Orders](#stock-management) | Items array always empty — item details never display | High |
| [Customers](#customer-management) | Search input not wired; Contact/Schedule buttons do nothing | Medium |
| [Purchase Orders](#purchase-orders) | Displays product UUID instead of product name | Medium |
| [Contact Page](#contact) | Form renders but has no submit handler; placeholder contact info | Medium |
| [Demo Page](#demo) | "Coming soon" stub | Low |
| 10+ list pages | Missing empty states and error states with retry | Medium |
| 15+ forms | Missing or insufficient validation | Medium |
| 20+ mutations | Generic error toasts with no specific context | Medium |
| Multiple action buttons | No double-click prevention during mutations | Low |
| Multiple files | 15+ console.log debug statements left in code | Low |
| login-form | Social login buttons (Apple/Google/Meta) non-functional | Low |
| login-form, contact | Dead links (Terms, Privacy, social media all point to `#`) | Low |
| subscribe | `support@example.com` placeholder email | Low |

---

## Public Pages

### Landing / Marketing

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| `/` | `index.tsx` | Complete | Static content |
| `/about` | `about.tsx` | Complete | Static content |
| `/features` | `features.tsx` | Complete | Static content |

### Contact

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| `/contact` | `contact.tsx` | **Partial** | None |

**Issue:** Contact form renders with name, email, subject, and message fields but **has no `onSubmit` handler**. The submit button does nothing. Needs a backend endpoint or third-party integration (e.g., Resend, SendGrid) to actually send the message.

### Demo

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| `/demo` | `demo.tsx` | **Stub** | None |

**Issue:** Displays "Request a Demo - Coming soon". No form, no functionality.

---

## Authentication

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| `/login` | `(auth)/login.tsx` | Complete | Better-Auth client |
| `/signup` | `(auth)/signup.tsx` | Complete | Better-Auth client |
| `/setup-password` | `(auth)/setup-password.tsx` | Complete | Real API (`/api/v1/auth-setup/`) |
| `/verify-email` | `verify-email.tsx` | Complete | `client.auth.verifyEmail()` |
| `/accept-invitation` | `accept-invitation.tsx` | Complete | `client.invitations.getByToken()`, `.verifyEmailByToken()` |

---

## Subscription & Payments

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| `/subscribe` | `subscribe.tsx` | Complete | Real API + Stripe.js |

---

## Onboarding

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| `/onboarding` | `_authenticated/onboarding.tsx` | **Partial** | Mock API |

**Issues (High Priority):**

1. **Mock name availability check** (lines 55-83): Simulates API with a 500ms `setTimeout`. Names starting with "test" are hardcoded as unavailable. Should call a real backend endpoint.
2. **Mock organization creation** (line 97): Has a `// TODO: Replace with actual API call when backend is ready` comment. Submission uses a 1000ms delay and then navigates to dashboard without actually creating anything.

**What's needed:**
- Backend procedure: `organizations.checkNameAvailability({ name: string })` or similar
- Backend procedure: `organizations.create({ name, slug, ... })` to create the org and tenant DB branch
- Wire the form submission to the real API

---

## Dashboard

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Dashboard Index | `dashboard/_layout/index.tsx` | Complete | `client.analytics.getDashboardKpis()`, `client.analytics.getStaffPerformance()` |

KPI cards (Sales Overview, Appointments, Active Members, Revenue by Branch), staff performance table, and widgets (appointments, announcements, payroll, claims) all use real API data.

---

## Access Control

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Invitations | `access-control/invitations.tsx` | Complete | Real API |
| Permissions | `access-control/permissions.tsx` | Complete | Real API (with UI mock) |
| Roles | `access-control/roles.tsx` | **Partial** | Real API + Mock |
| User Assignment | `access-control/user-assignment.tsx` | Complete | Real API |

**Roles Issue (Medium Priority):**

Contains a `MOCK_RESOURCES` array (lines 82-176) used for UI layout/structure alongside real API data from `useRoles()` and `useRoleMatrix()`. The mock array defines resource names and descriptions for the permission matrix UI. This should ideally be driven by the `client.permissions.list()` response or a shared constant.

---

## Members & Profiles

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| User List | `user/view.tsx` | Complete | `orpc.members.list` |
| User List (dashboard) | `dashboard/_layout/user/view.tsx` | Complete | `orpc.members.list` |

---

## Appointments

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Appointment Calendar | `appointment/view.tsx` | Complete | `client.appointments.list()` |
| Appointment Calendar (dashboard) | `dashboard/_layout/appointment/view.tsx` | Complete | `client.appointments.list()` |
| Class Slots | `dashboard/_layout/appointment/class-slots/view.tsx` | Complete | `client.classSlots.list()`, `.create()`, `.update()`, `.cancel()` |

**Minor Issue:** `handleAddAppointment` in the dashboard appointment view is an empty function — clicking "Add Appointment" does nothing. The create flow may need a form/dialog.

---

## Customer Management

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Customers | `customers.tsx` | Complete | `client.customerProfiles.get()`, `orpc.members.list()` |
| Walk-In Customers | `dashboard/_layout/customers/walk-in/view.tsx` | Complete | `client.walkInCustomers.list()`, `.create()`, `.update()`, `.deactivate()` |

---

## Services

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Services | `service/view.tsx` | Complete | `client.services.list()`, `client.serviceCategories.list()` |
| Services (dashboard) | `dashboard/_layout/service/view.tsx` | Complete | Real API |
| Service Categories | `service-category/view.tsx` | Complete | `client.serviceCategories.list()` |
| Service Categories (dashboard) | `dashboard/_layout/service-category/view.tsx` | Complete | Real API |

---

## Packages

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Packages | `dashboard/_layout/packages/view.tsx` | Complete | `client.packages.list()`, `.create()`, `.update()`, `.archive()` |
| Package Instances | `dashboard/_layout/packages/instances/view.tsx` | Complete | `client.packageInstances.listAll()`, `.create()` |

---

## Sales & Invoicing

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Sales List | `dashboard/_layout/sales/view.tsx` | Complete | `client.salesOrders.list()` |
| Sales Detail | `dashboard/_layout/sales/$id.tsx` | Complete | `client.salesOrders.getById()`, `client.invoices.list()` |
| Payments/Invoices | `dashboard/_layout/payment/view.tsx` | Complete | `client.invoices.list()` |
| Payouts | `dashboard/_layout/payouts/view.tsx` | Complete | `client.payouts.list()` (read-only, auto-generated) |

---

## Promotions & Tax

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Promotions | `dashboard/_layout/promotions/view.tsx` | Complete | `client.promotions.list()`, `.create()`, `.update()`, `.deactivate()` |
| Tax Rates | `dashboard/_layout/settings/tax-rates.tsx` | Complete | `client.taxRates.list()`, `.create()`, `.update()`, `.setDefault()`, `.deactivate()` |

---

## Purchase Orders

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Purchase Orders | `dashboard/_layout/purchase-orders/view.tsx` | Complete | `client.purchaseOrders.list()`, `.create()`, `.approve()`, `.receiveItems()`, `.cancel()` |

---

## Expenses

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Expenses | `dashboard/_layout/expenses/view.tsx` | Complete | `client.expenses.list()`, `.create()`, `.approve()`, `.reject()`, `.markPaid()` |

---

## Products & Inventory

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Products | `dashboard/_layout/products/view.tsx` | Complete | `orpc.products.list`, brands, categories, suppliers, UOMs |
| Brands | `dashboard/_layout/brands/view.tsx` | Complete | `client.brands.list()`, `.create()`, `.update()`, `.delete()` |
| Categories | `dashboard/_layout/categories/view.tsx` | Complete | `client.productCategories.list()`, `.create()`, `.update()`, `.delete()` |
| Suppliers | `dashboard/_layout/suppliers/view.tsx` | Complete | `client.suppliers.list()`, `.create()`, `.update()`, `.deactivate()` |
| Units of Measure | `dashboard/_layout/uom/view.tsx` | Complete | Real API |
| UOM Conversions | `dashboard/_layout/uom-conversions/view.tsx` | Complete | Real API |
| Inventory Options | `dashboard/_layout/inventory-options.tsx` | Complete | Delegates to component |

---

## Stock Management

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Stock Requests | `dashboard/_layout/stock-requests/view.tsx` | Complete | `client.stockRequests.list()`, `.create()`, `.approve()`, `.reject()`, `.fulfill()` |
| Transfer Orders | `dashboard/_layout/transfer-orders/view.tsx` | Complete | `client.transferOrders.list()`, `.create()`, `.markInTransit()`, `.complete()`, `.cancel()` |

---

## Notifications & Announcements

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| Notifications | `dashboard/_layout/notifications/view.tsx` | Complete | `client.notifications.list()`, `.markRead()`, `.markAllRead()` |
| Announcements | `dashboard/_layout/announcements/view.tsx` | Complete | `client.announcements.list()`, `.create()`, `.update()`, `.delete()` |

---

## Integrations

| Route | File | Status | Data Source |
|-------|------|--------|-------------|
| GoHighLevel | `go-highlevel-integration.tsx` | Complete | Real API (internal debug/admin tool) |

---

## Key Components

### App Sidebar (Component)

**File:** `apps/web/src/components/app-sidebar.tsx`
**Status:** **Partial**

**Issues (High Priority):**

1. **Hardcoded user data** — `"Way Sern"` / `"m@example.com"` as placeholder user info instead of pulling from session/context.
2. **Hardcoded team names** — `"Avantej Core"`, `"MoveFitness"`, `"Genius Corp."` are sample entries, not fetched from the user's organizations.
3. **Stub URLs** — Some navigation items use `#` or `'...'` as the URL, meaning those links go nowhere.
4. **Large hardcoded `SIDEBAR_DATA` constant** (lines 54-496) defines the entire nav structure. Should be driven by user permissions and organization context.

### Dashboard Widgets

| Widget | File | Status | Data Source |
|--------|------|--------|-------------|
| Claims Widget | `components/claims-widget.tsx` | Complete | `client.expenses.list({ status: "pending" })` |
| Announcements Widget | `components/announcements-widget.tsx` | Complete | `client.announcements.listActive()` |

---

## Detailed Breakdown: Incomplete Items

### 1. Onboarding — Mock Organization Creation (High)

**File:** `apps/web/src/routes/_authenticated/onboarding.tsx`

The onboarding page is the first thing new organization owners see after subscribing. Currently:
- Name availability check fakes a 500ms delay and rejects names starting with "test"
- Organization creation fakes a 1000ms delay and navigates to dashboard
- No backend procedures exist for these operations

**Backend needed:**
- `POST /rpc/organizations/checkNameAvailability` — check if org slug is available
- `POST /rpc/organizations/create` — create org, provision Neon branch, set up default hierarchy

### 2. App Sidebar — Hardcoded Navigation (High)

**File:** `apps/web/src/components/app-sidebar.tsx`

The sidebar should be dynamic based on:
- Current user session (name, email, avatar)
- User's organizations (team switcher)
- User's permissions (which nav items to show/hide)

Currently all of this is a static `SIDEBAR_DATA` constant.

### 3. Roles Page — Mock Resources (Medium)

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/roles.tsx`

Lines 82-176 contain a `MOCK_RESOURCES` array that defines resource types for the permission matrix UI. While the actual role and permission data comes from real APIs, the resource list used for rendering the matrix columns is hardcoded. Should use the response from `client.permissions.list()` grouped by resource type.

### 4. Contact Form — No Submit Handler (Low)

**File:** `apps/web/src/routes/contact.tsx`

Pure UI form with no submission logic. Options:
- Wire to a `POST /rpc/support/contactForm` procedure
- Use Resend or similar email service directly
- Redirect to an external support system

### 5. Demo Page — Stub (Low)

**File:** `apps/web/src/routes/demo.tsx`

Shows "Coming soon". Needs a demo request form or Calendly embed.

### 6. Appointment Add Button — Empty Handler (Low)

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`

`handleAddAppointment` is defined as an empty function. The calendar view works for viewing/filtering appointments but the "Add" action doesn't open a creation dialog.
