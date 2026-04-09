# Implementation Changelog — 2026-04-07/08

Complete record of all changes made during the web app completion sprint. Use this document for code review, QA testing, and deployment verification.

---

## Table of Contents

1. [Deployment Prerequisites](#deployment-prerequisites)
2. [Phase 1: Security Fixes](#phase-1-security-fixes)
3. [Phase 2: Feature Completions](#phase-2-feature-completions)
4. [Phase 3: Error Handling & Validation](#phase-3-error-handling--validation)
5. [Phase 4: Polish & Cleanup](#phase-4-polish--cleanup)
6. [QA Checklist](#qa-checklist)
7. [Files Changed (Complete List)](#files-changed-complete-list)

---

## Deployment Prerequisites

No special deployment steps are required. All changes are application-level (API procedures + frontend). No new database migrations were added.

> **Note:** The onboarding organization creation flow (Task 2.1) was implemented but **reverted** on 2026-04-08. The onboarding page remains in mock/placeholder state with TODO comments marking where real API calls should be wired. See [Task 2.1 (Reverted)](#21--onboarding-organization-creation-reverted) for details.

---

## Phase 1: Security Fixes

### 1.1 — Real Permission Guard System

**What changed:**

| File | Change |
|------|--------|
| `apps/server/src/routers/auth.ts` | `userContext` procedure now returns `permissions[]` per org and `isSystemAdmin` flag |
| `apps/web/src/hooks/useUserContext.ts` | Added `hasPermission()`, `hasAnyPermission()`, `hasRole()` helpers; permissions cached in localStorage |
| `apps/web/src/lib/route-guards.ts` | All 4 guard functions (`requirePermission`, `requireAnyPermission`, `requireRole`, `requireSystemAdmin`) fully implemented with 5-minute query cache |

**How it works:**
- Backend queries the user's role-permissions from the tenant DB and returns a flat `string[]` of `"resource:action"` permissions
- Admin roles (priority >= 100) get all permissions automatically
- Frontend caches permissions via TanStack Query (5-min stale time) — no network request on every navigation
- Unauthorized users are redirected to `/dashboard?unauthorized=true`

**What to check:**
- [ ] Log in as an admin user — verify all routes are accessible
- [ ] Log in as a staff user with limited permissions — verify restricted routes redirect to dashboard
- [ ] Check that permissions persist across page refreshes (localStorage cache)
- [ ] Verify no extra network requests on route navigation after initial load

### 1.2 — Missing Route Guards Added

| Route | Permission Added |
|-------|-----------------|
| `/dashboard/appointment/class-slots` | `appointment_management:read` |
| `/dashboard/packages` | `service_management:read` |
| `/dashboard/packages/instances` | `service_management:read` |
| `/customers` | `user_management:read` |
| `/dashboard/customers/walk-in` | `walk_in_customer_management:read` |

**What to check:**
- [ ] Navigate directly to each URL as a user without the permission — should redirect
- [ ] Navigate as a user with the permission — should load normally

### 1.3 — Open Redirect Fix

**File:** `apps/web/src/routes/verify-email.tsx`

**What changed:** `callbackURL` search parameter now validated to be a relative path (starts with `/`, not `//`). Invalid URLs default to `/login`.

**What to check:**
- [ ] `/verify-email?token=abc&callbackURL=/dashboard` — should redirect to `/dashboard` after verification
- [ ] `/verify-email?token=abc&callbackURL=https://evil.com` — should redirect to `/login`
- [ ] `/verify-email?token=abc&callbackURL=//evil.com` — should redirect to `/login`

### 1.4 — Error Message Leakage Fix

**File:** `apps/web/src/routes/verify-email.tsx`

**What changed:** Raw API error messages no longer displayed to users. Shows friendly "Email verification failed" message instead. Actual error logged to console.

**What to check:**
- [ ] Trigger a verification error (e.g., expired token) — should see friendly message, not stack trace

### 1.5 — localStorage (No Change Needed)

`accept-invitation.tsx` already had try/catch around localStorage. No changes made.

---

## Phase 2: Feature Completions

### 2.1 — Onboarding Organization Creation (REVERTED)

> **This change was reverted on 2026-04-08.** The backend organization creation router and its integration were removed. The onboarding page is back to mock/placeholder state.

**What was reverted:**

| File | Action |
|------|--------|
| `apps/server/src/routers/organizations.ts` | **Deleted** — backend router removed entirely |
| `apps/server/src/index.ts` | Removed organizations router import and registration |
| `packages/api/src/routers/index.ts` | Removed organizations type stub from appRouter |
| `apps/web/src/routes/_authenticated/onboarding.tsx` | Restored to mock `setTimeout` calls with TODO comments |

**What still works:**
- The onboarding page renders and accepts user input
- Name availability check shows UI feedback (mock — names starting with "test" rejected)
- Form submission shows success toast and navigates to dashboard (mock — no real org created)
- `console.log` debug statements remain removed (clean code kept)

**What to check:**
- [ ] `/onboarding` page loads without errors
- [ ] Name input shows checking/available/unavailable UI states
- [ ] Form submission shows toast and redirects to dashboard
- [ ] No TypeScript errors related to `client.organizations` (references removed)

**To implement for real in the future**, the following is needed:
1. Backend procedures: `checkNameAvailability` and `create` (see `Plan/web-app-completion/02-phase-2-broken-features.md` Task 2.1 for full spec)
2. Neon API integration for tenant DB provisioning
3. `ONBOARDING_SUBSCRIPTION_ID` env var with a seeded subscription row
4. Wire frontend to real API calls (replace the `setTimeout` mocks)

### 2.2 — Dynamic App Sidebar

**Files changed:**

| File | Change |
|------|--------|
| `apps/web/src/components/app-sidebar.tsx` | Removed `SIDEBAR_DATA` constant; user/teams from session; fixed all stub URLs |
| `apps/web/src/components/app-topbar.tsx` | Updated breadcrumbs to use new `NAV_PROJECTS` structure |

**What to check:**
- [ ] Sidebar shows real user name and email (not "Way Sern" / "m@example.com")
- [ ] Organization name displayed in header
- [ ] All sidebar links navigate to real routes (no `#` or `...` URLs)
- [ ] Breadcrumbs update correctly when navigating
- [ ] Sidebar collapse/expand still works

### 2.3 + 2.4 — Appointment Calendar

**Files changed:**

| File | Change |
|------|--------|
| `apps/web/src/components/calendar/appointment.tsx` | Confirm/Cancel/Edit buttons wired to real API; debug logs removed |
| `apps/web/src/components/calendar/add-appointment-modal.tsx` | Mock rooms/employees replaced with API queries; all `alert()` → `toast.error()` |

**What to check:**
- [ ] Open appointment detail modal — Confirm button calls API and updates status
- [ ] Cancel button calls API and updates status
- [ ] Edit button opens the add-appointment modal pre-populated
- [ ] Add Appointment modal — rooms dropdown shows real rooms from API
- [ ] Staff/employee dropdown shows real members from API
- [ ] Validation errors show as toast notifications (not browser alerts)

### 2.5 — Permissions Page CRUD

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/permissions.tsx`

**What changed:** Removed impossible Create/Duplicate/Edit actions (resources are system-defined enums). Added real "Remove All Permissions" with confirmation dialog using `client.rolePermissions.remove()`.

**What to check:**
- [ ] Permission resource cards display correctly
- [ ] "Remove All Permissions" shows confirmation dialog before executing
- [ ] After removal, permissions are actually removed (refresh to verify)

### 2.6 — Roles Page (Mock Data Removed)

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/roles.tsx`

**What changed:** Removed `MOCK_RESOURCES`, `MOCK_ROLES`, `MOCK_USER_COUNTS`. All data now from real API. Wizard "All"/"None" buttons now functional.

**What to check:**
- [ ] Roles page shows real roles from the API
- [ ] User counts per role are accurate
- [ ] Permission matrix shows real permissions grouped by resource
- [ ] Create Role wizard: "All" button checks all permissions in category
- [ ] Create Role wizard: "None" button unchecks all permissions in category
- [ ] Saving a role persists to database

### 2.7 — User Assignment Edit

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/user-assignment.tsx`

**What changed:** "Edit User" dropdown now opens a dialog with role selector and hierarchy scope reassignment.

**What to check:**
- [ ] Click "Edit User" on any member — dialog opens
- [ ] Change role — saves via `client.members.updateRole()`
- [ ] Change hierarchy scope — saves via `client.hierarchy.reassignMember()`
- [ ] Changes persist after page refresh

### 2.8 + 2.9 — Stock Requests & Transfer Orders Items

**Files changed:**

| File | Change |
|------|--------|
| `apps/web/src/routes/_authenticated/dashboard/_layout/stock-requests/view.tsx` | Items fetched via `getById` when Fulfill dialog opens |
| `apps/web/src/routes/_authenticated/dashboard/_layout/transfer-orders/view.tsx` | Items fetched via `getById` when Complete dialog opens |

**What to check:**
- [ ] Open a stock request's Fulfill dialog — items should display with quantities
- [ ] Open a transfer order's Complete dialog — items should display with received quantity inputs
- [ ] Buttons show "Loading..." while fetching item details

### 2.10 — Customer Page Search & Buttons

**File:** `apps/web/src/routes/_authenticated/customers.tsx`

**What changed:** Search input now filters by name/email. Contact button opens mailto. Schedule button navigates to appointments.

**What to check:**
- [ ] Type in search box — customer list filters in real-time
- [ ] Click Contact — opens email client with customer's email
- [ ] Click Schedule — navigates to appointment view
- [ ] Empty search shows all customers

### 2.11 — Contact Form

**File:** `apps/web/src/routes/contact.tsx`

**What changed:** Form now has React Hook Form + Zod validation. Submits via mailto. Social links show "Coming soon" toast.

**What to check:**
- [ ] Submit with empty fields — validation errors shown inline
- [ ] Submit with valid data — opens email client
- [ ] Click social media buttons — toast says "Social links coming soon"

### 2.12 — Demo Page

**File:** `apps/web/src/routes/demo.tsx`

**What changed:** "Coming soon" replaced with a demo request form (name, email, company, message). Submits via mailto.

**What to check:**
- [ ] Form validates required fields (name, email)
- [ ] Submit opens email client with structured body

### 2.13 — Invitation Email Error Handling

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/user-assignment.tsx`

**What changed:** Invitation create and email send now have separate error handling. If email fails, user sees a warning toast and can resend from invitations page.

**What to check:**
- [ ] Invite a user successfully — toast says "Invitation sent"
- [ ] If email service is down, invitation still created — toast warns to resend
- [ ] Dialog closes and list refreshes regardless of email outcome

### 2.14 — Purchase Orders Product Names

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx`

**What changed:** Product names displayed in receive-items sheet instead of raw UUIDs. Lookup map built from `client.products.list()`.

**What to check:**
- [ ] Open a PO's receive items — products show names not UUIDs
- [ ] Fallback to UUID if product not found in lookup

---

## Phase 3: Error Handling & Validation

### 3.1 + 3.2 — Improved Error Toast Messages

**Files:** `products/view.tsx`, `suppliers/view.tsx`, `uom/view.tsx`, `uom-conversions/view.tsx`, `stock-requests/view.tsx`, `transfer-orders/view.tsx`, `expenses/view.tsx`

**What changed:** 20 mutation `onError` handlers updated from generic "Failed" messages to include server error: `"Failed to create product: Duplicate SKU"`.

**What to check:**
- [ ] Trigger a mutation error (e.g., duplicate name) — toast should include the specific reason

### 3.3-3.7 — Form Validation

| Page | Validation Added |
|------|-----------------|
| Promotions | Code min 3 chars + alphanumeric format; end date must be after start date |
| Tax Rates | Rate capped at 100% (10000 basis points); name/code required |
| Expenses | Receipt URL format validation; amount must be > 0 |
| Purchase Orders | Unit cost must be > 0 (was >= 0, allowed zero) |
| Announcements | End date must be after start date |

**What to check:**
- [ ] Promotions: enter a 1-char code — should show validation error
- [ ] Promotions: enter code with special chars — should reject
- [ ] Tax rates: enter rate > 100% — should reject
- [ ] Expenses: enter invalid URL for receipt — should reject
- [ ] Purchase orders: enter 0 for unit cost — should reject
- [ ] Announcements: set end date before start date — should reject

### 3.8 + 3.9 — Empty States & Error States

**7 pages got empty states:** products, brands, categories, suppliers, UOM, UOM conversions, promotions

**9 pages got error states with retry:** all 7 above + sales, payments

**What to check:**
- [ ] Any list page with no data shows a meaningful "No items found" message
- [ ] Disconnect network, refresh a list page — error state shows with "Try Again" button
- [ ] Click "Try Again" — refetches data

### 3.10 — Permission-Based Action Buttons

**Files:** `expenses/view.tsx`, `purchase-orders/view.tsx`, `stock-requests/view.tsx`, `transfer-orders/view.tsx`

**What changed:** Create and action buttons (approve, reject, fulfill, etc.) hidden for users without the appropriate permission. Data table remains visible as read-only.

**What to check:**
- [ ] Log in as staff with `expense_management:read` but NOT `expense_management:update` — Approve/Reject buttons should be hidden
- [ ] Log in as admin — all buttons visible
- [ ] Data table still shows for read-only users

### 3.12 — Signup Validation

**File:** `apps/web/src/components/forms/signup-form.tsx`

**What changed:** First/last name min 2 chars (was 1). Password requires uppercase letter + number.

**What to check:**
- [ ] Try single-char name — rejected
- [ ] Try password without uppercase — rejected
- [ ] Try password without number — rejected
- [ ] Valid signup still works

---

## Phase 4: Polish & Cleanup

### 4.1 — Console.log Removal

Removed from: `onboarding.tsx`, `subscribe.tsx`, `appointment.tsx`, `add-appointment-modal.tsx`

### 4.2 — Dead Code Removal

Removed: commented-out code in `add-appointment-modal.tsx`, unused state variables

### 4.3 — Placeholder Content Fixed

| Before | After |
|--------|-------|
| `support@example.com` (subscribe.tsx) | `support@avantej.com` |
| Terms of Service `href="#"` (login-form) | `href="/terms"` |
| Privacy Policy `href="#"` (login-form) | `href="/privacy"` |

**Note:** `/terms` and `/privacy` routes don't exist yet — links are forward-references.

### 4.4 — Social Login Buttons

**File:** `apps/web/src/components/forms/login-form.tsx`

Apple, Google, Meta buttons now `disabled` with `opacity-50 cursor-not-allowed` and `title="Coming soon"`.

### 4.5 — setup-password Code Quality

**File:** `apps/web/src/routes/(auth)/setup-password.tsx`

- `useState<any>` → `useState<TokenInfo | null>` with proper interface
- Error handler properly typed

### 4.6 — Product Counts

**Files:** `brands/view.tsx`, `categories/view.tsx`

"Products Assigned: 0" replaced with real counts from `client.products.list()`.

**What to check:**
- [ ] Create a product with a brand — brand page shows count = 1
- [ ] Create a product with a category — category page shows count = 1

### 4.7 — Subscribe Page

**File:** `apps/web/src/routes/subscribe.tsx`

- `alert()` → `toast.error()`
- Auth error detection centralized via `isAuthError()` helper

### 4.8 — Accept Invitation Race Fix

**File:** `apps/web/src/routes/accept-invitation.tsx`

- `useRef` guard prevents double-fire of auto-accept
- Email mismatch now shows `toast.warning` with clear message

**What to check:**
- [ ] Accept invitation with matching email — auto-accepts once (not twice)
- [ ] Accept invitation with different email — warning toast explains the mismatch

### 4.9 — Unused Imports Cleanup

30+ files cleaned. Run `bun check` to verify no new warnings in `apps/web/src/`.

### 4.10 — Confirmation Dialogs

| Page | Action | Dialog Added |
|------|--------|-------------|
| Announcements | Delete + Deactivate | Yes |
| UOM | Delete | Yes |
| Promotions | Deactivate | Yes |
| Brands | Delete | Already had one |
| Categories | Delete | Already had one |
| Suppliers | Deactivate | Already had one |

**What to check:**
- [ ] Delete an announcement — confirmation dialog appears first
- [ ] Delete a UOM — confirmation dialog appears first
- [ ] Deactivate a promotion — confirmation dialog appears first
- [ ] Click Cancel in dialog — action is not performed

---

## QA Checklist

### Critical Path Testing
- [ ] **Login** → Dashboard loads with real KPI data
- [ ] **Signup** → New user created with password requirements enforced
- [ ] **Onboarding** → New org created, tenant DB provisioned, redirect to dashboard
- [ ] **Permission system** → Staff user cannot access admin routes
- [ ] **Sidebar** → Shows real user, real org, all links work
- [ ] **Appointment flow** → Create → Confirm → Cancel all work via API
- [ ] **Sales flow** → View sales → View detail → View invoices
- [ ] **Inventory flow** → Create stock request → Approve → Fulfill with item details
- [ ] **RBAC flow** → Create role → Assign permissions → Assign to member

### Regression Testing
- [ ] All existing functionality still works (no broken imports, no missing components)
- [ ] `bun check` passes for `apps/web/src/`
- [ ] `bun check-types` passes (or no new errors introduced)
- [ ] `bun dev` starts without errors
- [ ] All toast notifications display correctly (no browser alerts remain)

### Browser Testing
- [ ] Chrome — full flow
- [ ] Firefox — session cookies work (Better-Auth cookie fix from prior work)
- [ ] Safari — localStorage fallback works

---

## Files Changed (Complete List)

### New Files
None (organizations.ts was created then reverted)

### Backend Files Modified
- `apps/server/src/routers/auth.ts` (permissions added to userContext response)

### Frontend — Routes Modified
- `apps/web/src/routes/verify-email.tsx`
- `apps/web/src/routes/contact.tsx`
- `apps/web/src/routes/demo.tsx`
- `apps/web/src/routes/subscribe.tsx`
- `apps/web/src/routes/accept-invitation.tsx`
- `apps/web/src/routes/(auth)/setup-password.tsx`
- `apps/web/src/routes/_authenticated/onboarding.tsx`
- `apps/web/src/routes/_authenticated/customers.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/permissions.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/roles.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/user-assignment.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/announcement/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/class-slots/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/brands/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/categories/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/customers/walk-in/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/expenses/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/products/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/promotions/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/tax-rates.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/stock-requests/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/suppliers/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/transfer-orders/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/uom/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/uom-conversions/view.tsx`

### Frontend — Components Modified
- `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/components/app-topbar.tsx`
- `apps/web/src/components/calendar/appointment.tsx`
- `apps/web/src/components/calendar/add-appointment-modal.tsx`
- `apps/web/src/components/forms/login-form.tsx`
- `apps/web/src/components/forms/signup-form.tsx`
- `apps/web/src/components/tables/uom/view/data-table.tsx`

### Frontend — Hooks & Utilities Modified
- `apps/web/src/hooks/useUserContext.ts`
- `apps/web/src/hooks/usePermissions.ts`
- `apps/web/src/hooks/useProductData.ts`
- `apps/web/src/lib/route-guards.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/stripe.ts`

### Frontend — Unused Import Cleanup (30+ files)
- Various component, hook, and route files — see Task 4.9 agent output for full list
