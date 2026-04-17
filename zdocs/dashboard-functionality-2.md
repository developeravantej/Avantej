# Avantej Core - Dashboard Functionality (Part 2: Gaps & Missing Coverage)

> Companion document to `dashboard-functionality.md`.
> Catalogs features, routers, flows, and concerns that exist in the codebase but are absent from the primary reference.
> Scope: `apps/web` only (native customer app excluded by design).

---

## Table of Contents

1. [Backend Routers With No Dashboard Page](#1-backend-routers-with-no-dashboard-page)
2. [Undocumented Flow: Appointment Creation Modal](#2-undocumented-flow-appointment-creation-modal)
3. [Undocumented Flow: Service Category Configuration](#3-undocumented-flow-service-category-configuration)
4. [Platform Admin Panel (Server-Side Router)](#4-platform-admin-panel-server-side-router)
5. [Incomplete CRUD Coverage on Documented Pages](#5-incomplete-crud-coverage-on-documented-pages)
6. [Cross-Cutting UX Concerns Not Captured](#6-cross-cutting-ux-concerns-not-captured)
7. [Data Integrity & Input Quality Gaps](#7-data-integrity--input-quality-gaps)
8. [Security & RBAC Gaps Not Flagged](#8-security--rbac-gaps-not-flagged)
9. [Prioritized Summary](#9-prioritized-summary)
10. [Authenticated Routes Outside `/dashboard/_layout`](#10-authenticated-routes-outside-dashboard_layout)
11. [Public & Auth-Flow Routes](#11-public--auth-flow-routes)
12. [Heavy Form Components Not Enumerated](#12-heavy-form-components-not-enumerated)
13. [Fine-Grained Scope Permission System](#13-fine-grained-scope-permission-system)
14. [Billing, Subscription & Onboarding Lifecycle](#14-billing-subscription--onboarding-lifecycle)
15. [Hooks Layer — Conditional UI Engine](#15-hooks-layer--conditional-ui-engine)

---

## 1. Backend Routers With No Dashboard Page

These oRPC routers exist and are wired into `baseRouter` (see `packages/api/src/routers/index.ts`), but have **no corresponding dashboard route** and are **not referenced in `dashboard-functionality.md`**.

| Router | Procedures | Business Purpose | User Impact of Missing UI |
|--------|-----------|------------------|--------------------------|
| `waitlist` | `list`, `add`, `remove`, `promote` | Appointment waitlist management | Admins cannot see who is waiting for a slot, cannot promote a client off the waitlist manually |
| `commissionSplits` | `list`, `getByAppointment`, `getMyCommissions` | Staff commission tracking per appointment | No UI for admins to review payout calculations, and no dedicated view for staff to inspect their own earnings |
| `organizationSettings` | `get`, `update` | Org-level configuration (business hours, currency, timezone, defaults) | Settings that should be configurable in-app are hard-coded or stuck at defaults |
| `userActivityLog` | `list` | Immutable audit trail | No visibility into who changed/approved/deactivated what — compliance and forensic gap |
| `customerProfiles` | `get`, `upsert` | Registered customer records | Only walk-in customers have a dashboard page; registered clients with profiles have no admin-facing view |
| `notificationPreferences` | `get`, `update` | Per-user channel preferences (email / push / SMS) | Users cannot manage their own notification channels from the dashboard |
| `preferredTimes` | `list`, `upsert` | Customer preferred booking windows | Admins have no way to review or edit a customer's preferred times |
| `products.getStock` / `products.adjustStock` | 2 procedures on the products router | Inventory stock counts + manual adjustments | Products page has no stock column and no adjustment UI — the stock movement system is invisible |

### Recommended new dashboard pages

- **Waitlist Management** — at `/dashboard/appointment/waitlist/view` — list + promote actions
- **Commission Center** — at `/dashboard/finance/commissions/view` — admin totals + per-staff drill-down
- **Organization Settings** — at `/dashboard/settings/organization` — single form for all `organizationSettings` fields
- **Activity Log** — at `/dashboard/access-control/activity-log` — filterable audit trail
- **Customer Profiles** — at `/dashboard/customers/registered/view` — parity with walk-in page
- **My Notifications** — at `/dashboard/settings/notifications` — personal preference editor
- **Stock Levels** — add stock column to `/dashboard/products/view` + "Adjust Stock" row action

---

## 2. Undocumented Flow: Appointment Creation Modal

### Location

- **Component:** `apps/web/src/components/calendar/add-appointment-modal.tsx` (~2,200 lines)
- **Used by:** `routes/_authenticated/dashboard/_layout/appointment/view.tsx`

### Why it matters

Section 5a (Appointment Calendar) in the primary doc describes viewing only. The creation flow — the most business-critical action on that page — is omitted entirely.

### What the modal does

- Multi-step creation: client selection → service selection → trainer/staff assignment → time slot picker → room assignment → confirmation
- **Client source toggle:** registered client search vs. walk-in customer creation
- **Service selection** pulled from tenant services, filtered by category
- **Trainer eligibility** respects `serviceMembers` assignments (only trainers assigned to that service are pickable)
- **Buffer time handling** uses per-trainer override, falling back to category default
- **Room assignment** via `client.rooms.list({ organizationId })` dropdown
- **Credit deduction** against the client's active package instance (credit count decrements on confirm)
- **Availability check** against existing appointments + `trainerAvailability` windows

### Related routers (also undocumented on the calendar page)

| Router | Procedure | Purpose in this flow |
|--------|-----------|---------------------|
| `rooms` | `list`, `create`, `update`, `delete` | Populates the room dropdown; no standalone Rooms management page exists either |
| `trainerAvailability` | `list`, `create`, `update`, `delete` | Weekly/daily availability windows used to validate slot picks |
| `serviceMembers` | `listForMember`, `updateBuffer` | Enforces trainer-service assignment and buffer overrides |

### Recommended documentation additions

- Full field-by-field breakdown of the Add Appointment sheet
- Credit / package-instance interaction (how many credits deduct, what happens if insufficient)
- Rooms as a first-class entity (and add a standalone `/dashboard/rooms/view` page)
- Trainer availability editor surface — currently only exposed via the Trainers edit flow

---

## 3. Undocumented Flow: Service Category Configuration

The `serviceCategoryConfig` router drives per-category default settings (notably buffer times) and is referenced in three files but not covered in the doc.

### Usage points

| File | Procedure Called | Purpose |
|------|------------------|---------|
| `components/forms/service-category-detail-dialog.tsx` | `serviceCategoryConfig.getByCategoryId` | Reads config when viewing a category |
| `components/forms/service-category-form.tsx` | `serviceCategoryConfig.upsert` | Writes config from the create/edit form |
| `components/tables/service-category/view/data-table.tsx` | `serviceCategoryConfig.getByCategoryId` | Fetches config for row detail panel |

### Why it matters

- The buffer-time system spans three layers: **category default → trainer override → per-service override**.
- The doc covers the trainer override (Trainers page) and the per-service override (My Services page) but omits the category default, which is the root of the cascade.
- Without documenting this layer, the full buffer-resolution logic is invisible.

### Recommended documentation additions

- Add a subsection under **Section 4b. Service Categories** describing the Config dialog fields
- Document the buffer resolution order: `service-level override (member) → service member default → category config → zero`
- Note that deleting a category does not cascade to configs (check FK behavior)

---

## 4. Platform Admin Panel (Server-Side Router)

### Router location

`apps/server/src/routers/admin.ts`

### Exposed procedures

- `listTenants`, `getTenant`
- `suspendTenant`, `unsuspendTenant`
- `startImpersonation`, `exitImpersonation`
- `getAuditLogs`, `getStats`

### Gap

The primary doc is scoped to tenant-facing dashboard features and does not acknowledge that a **platform-admin surface exists in the backend**. If a UI is planned or partially built, it belongs in the dashboard reference (or a sibling doc). If no UI exists, this gap should still be called out so consumers of the reference know platform admin is backend-only today.

### Recommended documentation additions

- Dedicated section describing the admin router's procedures and current UI status (built / not built)
- Clarification on how `startImpersonation` / `exitImpersonation` interacts with the session + cookie layer
- Note on who can call these procedures (expected to be platform admins, not tenant admins)

---

## 5. Incomplete CRUD Coverage on Documented Pages

The primary doc lists many "read-only table" pages but understates the create/edit/mutate surface that actually ships.

| Page | Documented | Actual Surface |
|------|-----------|----------------|
| Appointment Calendar | View + filter only | Full create modal (see section 2) |
| Services | "Create/Edit via DataTable" (no detail) | Sheet-based form with category, duration, credit cost, price, buffer fields — fields not enumerated |
| Service Categories | "Self-fetching DataTable" | Also has a detail dialog with `serviceCategoryConfig` upsert — omitted |
| Roles (Access Control) | Wizard + Matrix + Cards view described | `roles.create`, `roles.update`, `roles.delete` procedures + the create/edit surfaces from the Cards view aren't detailed |
| Permissions (Access Control) | List view described | `rolePermissions.add` / `rolePermissions.remove` mutation flows aren't enumerated |

### Recommended documentation additions

- For each page marked "read-only", re-check whether row actions or per-column interactions expose mutations
- For each create/edit sheet, enumerate every field + validation rule + server-side effect

---

## 6. Cross-Cutting UX Concerns Not Captured

The primary doc describes per-page behavior but omits concerns that span all pages.

| Concern | What's Missing |
|---------|----------------|
| Error handling | Which pages show error UI, which silently return empty arrays, which toast, which do nothing. Only Cancelled Sales is flagged. |
| Loading states | Skeleton vs. spinner vs. blank conventions — not documented |
| Pagination | Only Payouts is called out (50-record cap). Actual caps on members, products, suppliers, invoices, sales-orders, etc. are not audited |
| Empty states | Documented in a few places (Brands, My Services), missing elsewhere |
| Toast conventions | `sonner` mentioned once — no note on success/error copy conventions across mutations |
| Query cache invalidation | Mutation → `invalidateQueries` pattern mentioned generically — no per-router map of affected cache keys |
| Keyboard & accessibility | Not mentioned — no focus management, aria, or keyboard shortcut documentation |
| Responsive behavior | Doc assumes desktop — mobile/tablet layout of dashboard pages is not documented |
| Cross-DB name resolution | Members/users are joined from control panel DB; failure modes beyond User View's "Unknown" fallback are not covered |

### Recommended documentation additions

- A dedicated **Common Patterns > Operational** subsection (error/loading/pagination/empty-state conventions)
- A per-router cache invalidation matrix

---

## 7. Data Integrity & Input Quality Gaps

| Issue | Pages Affected | Detail |
|-------|----------------|--------|
| Raw UUID text input for Branch ID | Walk-in Customers, Class Slots, Purchase Orders | Doc lists these as "open" bugs but doesn't note that Stock Requests and Transfer Orders already use comboboxes — the pattern is inconsistent and the fix is replicable |
| Raw UUID text input for Product ID | Stock Requests, Transfer Orders (create forms) | Same class of bug — product dropdown exists elsewhere (Purchase Orders) but not wired here |
| Raw UUID text input for Client ID | Package Instances (assign flow) | Client should be a searchable combobox against `customerProfiles` + `walkInCustomers` |
| Supplier list not hierarchy-scoped | Purchase Orders create | `client.suppliers.list()` returns all suppliers regardless of `accessibleNodeIds` — staff in one branch can assign a PO to any supplier |
| Single-item-only create forms | Stock Requests, Transfer Orders | Doc notes "currently supports only 1 item" but does not flag this as a blocker for real-world workflows |
| Currency field defaults to "usd" | Expenses | Flagged as open — but pattern isn't audited across invoices, payouts, sales orders |

### Recommended documentation additions

- Consolidated "Input Quality" table listing every raw UUID input with the intended lookup source
- Audit of currency field defaults across finance-adjacent tables

---

## 8. Security & RBAC Gaps Not Flagged

| Gap | Severity Not Communicated |
|-----|--------------------------|
| `requirePermission` in `route-guards.ts` is a stub | The doc describes it as "does not actually block navigation" — but doesn't emphasize that **any authenticated member of the org can navigate to any dashboard route**. Server-side procedure-level checks are the only real gate. |
| GHL Integration page has no RBAC guard and uses raw `fetch()` | Listed as "demo/diagnostic" — but it lives inside the authenticated shell and is reachable by any logged-in user |
| Invitations list scoped to `invitedBy: current member` | Admin A cannot see Admin B's invitations — creates audit gap + allows duplicate invitations |
| No documented rate limits | No mutation endpoint has a documented rate-limit contract; brute-force / abuse surface is unmeasured |
| Impersonation flow (admin router) | Server procedures exist but the session/cookie impact on the tenant context middleware is not documented — risk of cross-tenant data leaks if impersonation is mis-implemented |
| Role badges silent failure (User Assignment) | Documented as "never render (API gap)" — but the underlying issue is that the member list API does not return role IDs, so the frontend cannot verify role assignment correctness at all |

### Recommended documentation additions

- Elevate the `requirePermission` stub note to a top-level security caveat in the primary doc
- Per-procedure table listing: required permission resource + action, hierarchy scoping, and whether responses are filtered by `accessibleNodeIds`
- Explicit section on impersonation flow end-to-end

---

## 9. Prioritized Summary

| Priority | Gap | Action |
|----------|-----|--------|
| P0 | Appointment creation modal (~2,528 lines) undocumented | Add a new Section 5c **Create Appointment** to the primary doc with full field list, rooms/credits/buffer/recurrence interactions |
| P0 | Entire lifecycle (signup → verify → setup-password → subscribe → onboarding → dashboard) undocumented | Add a **Lifecycle** section or sibling doc |
| P0 | Parallel/legacy `_authenticated/` routes exist (customers, appointment, service, service-category, user) | Audit: delete dead copies or document both |
| P0 | 8 routers with no dashboard page | Decide per-router: build UI, mark as backend-only, or remove router |
| P0 | Billing & subscription flow (`/subscribe`, ~765 lines, Stripe) entirely absent | Document end-to-end — plans, states, Stripe webhook, paymentStatus transitions |
| P1 | Invitation acceptance flow (`/accept-invitation`, ~342 lines) — core multi-tenant UX — absent | Add to lifecycle doc; document email-mismatch and auto-accept paths |
| P1 | 8-level scope permission model reduced to 3 roles in primary doc | Replace simplified RBAC table with full Resource × Action × Scope model |
| P1 | `route-config.ts` (route → permission source of truth) not referenced | Add cross-reference and auto-generate a route-permission table |
| P1 | Heavy form components (service-category-form 1,144 lines, service-form 849 lines, role-form 647 lines) encode major business logic | Per-form field enumeration + validation + immutable-after-creation rules |
| P1 | Hooks layer (`useAuth`, `useUserContext`, `usePermissions`, `useCommonPermissions`) gates every mutation button | Reference in Common Patterns; document convention |
| P1 | Commission & incentive system (staff weightage, conditional thresholds, staff pools) scattered across form/router/page | Dedicated subsection consolidating the model |
| P1 | Service category config (buffer defaults) undocumented | Add subsection under Section 4b; document buffer cascade order |
| P1 | Platform admin router undocumented | Add a new top-level section or sibling doc; clarify UI status |
| P1 | `requirePermission` stub severity under-communicated | Elevate to a security caveat in the primary doc |
| P2 | Pagination caps unaudited across pages | Add per-router pagination column to the Testing Status table |
| P2 | Raw UUID inputs inconsistently replaced with comboboxes | Consolidated "Input Quality" table + remediation plan |
| P2 | Error-handling conventions not captured | Add an Operational Patterns subsection to Section 20 |
| P2 | GHL integration has no RBAC guard (reachable by any logged-in user) | Add guard or mark the page as `superadmin` only |
| P2 | Organization switching UI not documented | Document multi-org flow + how `current_organization_id` localStorage key is set |
| P3 | Single-item-only Stock Requests / Transfer Orders | Flag as design limitation, not a bug |
| P3 | Currency field defaults not audited | Cross-page audit of "usd" vs "MYR" handling |
| P3 | Public marketing pages (`/`, `/about`, `/features`, `/contact`, `/demo`) unrelated but worth cataloging | One-line index, as they ship with the same app |

---

## 10. Authenticated Routes Outside `/dashboard/_layout`

The primary doc treats the dashboard as the entire authenticated surface. It is not. These routes live under `_authenticated/` but **outside** `dashboard/_layout/` and are either completely omitted or acknowledged only in passing.

### 10a. Onboarding

- **File:** `apps/web/src/routes/_authenticated/onboarding.tsx` (~245 lines)
- **Purpose:** First-time organization setup after signup — org name input with real-time availability check, redirects to `/dashboard` on success
- **Primary doc status:** Not mentioned
- **Note:** Contains TODOs indicating mocked endpoints — ship-blocker for new-tenant activation

### 10b. GoHighLevel Integration (authenticated copy)

- **File:** `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx` (~438 lines)
- **Primary doc status:** Mentioned once in Section 18d with route `/go-highlevel-integration` — but the actual route path is `/_authenticated/go-highlevel-integration`
- **Undocumented functionality:** webhook setup instructions, connected GHL locations, sync event log with raw/parsed payload viewers, contact links, location mapping CRUD
- **Concern reiterated:** No RBAC guard — reachable by any logged-in member

### 10c. Parallel / Legacy Resource Views

Four routes duplicate dashboard pages at the `_authenticated/` level:

| File | Mirrors Dashboard Route | Status |
|------|------------------------|--------|
| `_authenticated/customers.tsx` (~14KB) | No direct dashboard parallel — possibly an older customer-management page pre-walk-in/registered split | Unclear |
| `_authenticated/appointment/view.tsx` | `/dashboard/appointment/view` | Likely legacy — uses older flows |
| `_authenticated/service/view.tsx` | `/dashboard/service/view` | Likely legacy |
| `_authenticated/service-category/view.tsx` | `/dashboard/service-category/view` | Likely legacy |
| `_authenticated/user/view.tsx` | `/dashboard/user/view` | Likely legacy |

### Why it matters

- Users can navigate to either copy, and the two may drift in features and permission enforcement
- The doc's Testing Status section covers only the dashboard copies — the `_authenticated/` copies have no recorded test status
- The `customers.tsx` route in particular has no dashboard parallel — if a user lands on it via a stale link, the experience is undocumented

### Recommended documentation additions

- Audit whether each parallel route is live or legacy
- Delete legacy routes (and their entries in `routeTree.gen.ts`) OR document them explicitly
- Add `customers.tsx` to the dashboard doc (or confirm it is deprecated)

---

## 11. Public & Auth-Flow Routes

Omitted from the dashboard doc (understandable by scope, but worth cross-referencing):

| Route | File | Purpose |
|-------|------|---------|
| `/` | `routes/index.tsx` | Marketing landing page |
| `/about` | `routes/about.tsx` | Company / mission |
| `/features` | `routes/features.tsx` | Marketing feature showcase |
| `/contact` | `routes/contact.tsx` | Contact form with Zod validation + email integration |
| `/demo` | `routes/demo.tsx` | Demo request form |
| `/(auth)/login` | `routes/(auth)/login.tsx` | Login |
| `/(auth)/signup` | `routes/(auth)/signup.tsx` | Signup |
| `/(auth)/setup-password` | `routes/(auth)/setup-password.tsx` | Password setup after invitation / email verification (token + email + full_name query params) |
| `/verify-email` | `routes/verify-email.tsx` (~112 lines) | Email verification landing — calls `client.auth.verifyEmail({ token })`, auto-redirects |
| `/accept-invitation` | `routes/accept-invitation.tsx` (~342 lines) | **Critical multi-tenant flow** — embedded signup for new users, auto-accept for logged-in matching email, sets `current_organization_id` in localStorage, handles email-mismatch errors |
| `/subscribe` | `routes/subscribe.tsx` (~765 lines) | **Billing / Stripe checkout** — authenticated + guest variants, plan cards, post-subscription password setup, onboarding routing |

### Why it matters

- The dashboard doc's `Common Patterns` section describes "every dashboard page" flow but never explains how users _arrive_ at the dashboard (signup → verify → setup-password → onboarding → dashboard) or how they get billed (subscribe → Stripe → callback)
- `accept-invitation.tsx` materially affects the multi-tenant UX — first-time invitee experience is invisible in the current doc
- No doc of Stripe checkout, plan tiers, billing statuses, or what happens when a subscription lapses

### Recommended documentation additions

- A new top-level section **"Lifecycle: Signup → Dashboard"** documenting signup → verify-email → setup-password → onboarding → dashboard, including the invitation fork
- A sibling doc for billing flows (`zdocs/billing-flow.md`) or a subsection covering `/subscribe` end-to-end

---

## 12. Heavy Form Components Not Enumerated

The primary doc treats create/edit sheets as single-line items. Several forms are large enough that their field-level behavior is business-critical and deserves enumeration.

| Component | Lines | What's Actually In It |
|-----------|-------|----------------------|
| `components/calendar/add-appointment-modal.tsx` | ~2,528 | Full appointment creation + recurrence engine + room assignment + credit deduction (see Section 2) |
| `components/access-control/permission-matrix/EnhancedPermissionMatrix.tsx` | ~1,218 | Role × Resource × Action × Scope 4-dimensional matrix with 8 scope levels |
| `components/forms/service-category-form.tsx` | ~1,144 | Staff incentive structures (fixed vs variable), conditional commission thresholds, staff pool percentage splits, multiple staff weightage configs, booking rules (advance notice, cancellation window, buffer time) |
| `components/forms/hierarchical-branch-form.tsx` | ~969 | Multi-level hierarchy creation (Country → Region → Area → Branch) with cascading dependencies, node type determination, geographic structure |
| `components/forms/service-form.tsx` | ~849 | Appointment-based vs time-preset scheduling, payment plans (full/half/quarterly/custom), installment intervals, grace periods, multi-attendee services, tax configuration |
| `components/forms/role-form.tsx` | ~647 | Role definition with commission & incentive structures, fixed vs variable types, conditional thresholds, embedded mock role templates |
| `components/access-control/editors/RoleEditor.tsx` | ~485 | Comprehensive role editor with collapsible permission groups |
| `components/access-control/mobile/MobileRoleSheet.tsx` | ~462 | Mobile role editor with permission assignment |
| `components/access-control/editors/PermissionEditor.tsx` | ~427 | Permission resource editor with scope selectors |
| `components/forms/supplier-form.tsx` | ~433 | Supplier with dynamic field mappings (accountNumber, paymentTerms, website, barcode, etc.) |
| `components/forms/product-form.tsx` | ~410 | Product creation with category, UOM, pricing |
| `components/access-control/mobile/BulkAssignmentSheet.tsx` | ~387 | Bulk role assignment with add / remove / replace modes + preview |
| `components/forms/service-detail-dialog.tsx` | ~378 | Service detail viewer with edit/delete |
| `components/forms/service-category-detail-dialog.tsx` | ~356 | Service category detail (reads `serviceCategoryConfig`) |
| `components/forms/signup-form.tsx` | ~307 | Onboarding signup form |
| `components/invitations/create-invitation-dialog.tsx` | ~285 | Invitation dialog with role + hierarchy scope |

### Why it matters

- The dashboard doc says "Create/Edit managed through DataTable's built-in sheets" — but these forms encode major business logic (commission, booking rules, scheduling variants) that consumers of the doc cannot discover
- Without enumeration, new engineers or AI agents working on these forms must rediscover fields + validation every time

### Recommended documentation additions

- Per-form: field list, validation rules, server-side effects, which fields are immutable after creation
- Separate subsection in the doc for **Commission & Incentive Configuration** — currently scattered across service-category-form, role-form, and commissionSplits router (which has no page)

---

## 13. Fine-Grained Scope Permission System

The primary doc's RBAC section in Section 20 describes only three roles: Admin, Staff, Trainer. The actual system is much more granular.

### Scope levels (8 total)

Per `apps/web/src/lib/permissions.ts` and `EnhancedPermissionMatrix.tsx`:

```
own → team → organization → country → region → area → branch → null
```

### Resource × Action × Scope

Permissions are a 3-tuple:
- **Resource** (e.g., `user_management`, `service_management`, `purchase_order_management`, `walk_in_customer_management`, `reports`, plus ~20 others)
- **Action** (`read`, `create`, `update`, `delete`, `manage`)
- **Scope** (one of the 8 levels above)

This means a role can have permission to `read` a resource at `branch` scope but not at `organization` scope — the primary doc's simple "admin sees all / staff sees scope" is a simplification.

### Route-to-permission mapping

`apps/web/src/lib/route-config.ts` (~214 lines) maps every dashboard route to required permissions. This file is the **source of truth** for what a user needs to access each page, and it's not referenced in the primary doc.

### Why it matters

- The doc's RBAC section understates the system
- Without knowing the 8 scope levels, engineers writing new procedures cannot pick the correct scope
- The `requirePermission` stub (flagged in Section 8) becomes more dangerous in light of this — the client trusts URL navigation, but scope enforcement happens server-side via `accessibleNodeIds`

### Recommended documentation additions

- Replace the simple "Admin / Staff / Trainer" table in Section 20 with the full Resource × Action × Scope model
- Add a reference to `route-config.ts` as the route-permission source of truth
- Document how `accessibleNodeIds` interacts with scope levels (e.g., `branch` scope ⇒ single node, `area` scope ⇒ descendants of area node)

---

## 14. Billing, Subscription & Onboarding Lifecycle

The primary doc starts at "user lands on /dashboard" — but the path to get there is non-trivial and entirely undocumented.

### The actual lifecycle

```
Signup (/(auth)/signup)
  ↓
Verify Email (/verify-email)
  ↓
Setup Password (/(auth)/setup-password)  [if from invitation]
  ↓
Subscribe (/subscribe)                    [if not already covered by subscription]
  ↓
Onboarding (/_authenticated/onboarding)   [first-time org creation]
  ↓
Dashboard (/dashboard)
```

### The invitation fork

```
Accept Invitation (/accept-invitation) with token + orgId
  ↓
  ├── Logged in AND email matches → auto-accept → /dashboard
  ├── Logged in AND email mismatches → error page
  └── Not logged in → embedded signup form (pre-filled email) → /dashboard
```

### Undocumented pieces

- What happens if a tenant's `organizations.paymentStatus` flips from `active` to something else mid-session
- Whether `/subscribe` is reachable post-dashboard (for upgrade / downgrade / cancel)
- Post-subscription webhook handling — Stripe → server → tenant DB
- Organization switching: the doc mentions `current_organization_id` in localStorage (via memory) but doesn't document the UI for multi-org users

### Recommended documentation additions

- A dedicated lifecycle section in the primary doc (or a sibling doc)
- Flow diagrams for signup, invitation-accept, and billing paths
- Subscription state machine documentation

---

## 15. Hooks Layer — Conditional UI Engine

The primary doc never mentions the custom hooks that power conditional UI across all pages. This is an operational gap.

| Hook | Lines | Role |
|------|-------|------|
| `useAuth.ts` | ~288 | Better-Auth integration, permission checking, organization context, session management |
| `useUserContext.ts` | ~228 | User organizations, hierarchy, current org ID, membership data |
| `usePermissions.ts` | ~134 | Permission list queries + role-permission queries + pre-built checkers (canViewUsers, canEditRoles, etc.) |
| `useRoles.ts` | ~88 | Role list + assignment queries |
| `useCommonPermissions` (in usePermissions.ts) | — | Pre-built checkers for common resources used by nearly every page to show/hide buttons |
| `useIsSystemAdmin` (in usePermissions.ts) | — | System-admin gate |
| `useUserAssignment.ts` | ~42 | User role assignment mutations |
| `useProductForm.ts` / `useProductData.ts` | ~71 / ~26 | Product-specific state |

### Why it matters

- Every "Create" / "Edit" / "Delete" button on every dashboard page is conditionally rendered by one of these hooks. When the doc says "requires `inventory_management:create` permission", the actual enforcement lives in `useCommonPermissions.canCreateInventory()`
- New dashboard pages that forget to call these hooks will show buttons to users who cannot use them (failed API call → toast error UX)
- The "Fixes Applied" table notes "Sidebar shows links to pages user can't access — FIXED (2026-04-16) — permission-based filtering added" — that filtering uses `useCommonPermissions`

### Recommended documentation additions

- Reference the hooks layer in Section 20 Common Patterns
- Per-page: note which hook(s) gate which UI elements
- Convention: "every mutation button MUST be gated by a `useCommon*` checker"

---

## Appendix: Procedure-to-Page Reconciliation

Every router in `packages/api/src/routers/` with its dashboard coverage status.

| Router | Procedures (count) | Dashboard Page | Coverage Status |
|--------|-------------------|----------------|-----------------|
| analytics | 2 | Dashboard Home | Covered |
| announcements | 5 | Announcements view | Covered |
| appointments | 5 | Appointment Calendar | Partial — create missing from doc |
| brands | 5 | Brands view + Inventory Options | Covered |
| cancelled-sales | minimal | Cancelled Sales view | Covered |
| class-slots | 6 | Class Slots view | Covered |
| commission-splits | 3 | — | **No page** |
| customer-profiles | 2 | — | **No page** |
| expenses | 6 | Expenses view | Covered |
| google-calendar | integration | Settings > Google Calendar | Covered |
| hierarchy | 10+ | Branches + Access Control | Covered |
| installments | 6 | Installments view | Covered |
| invitations | 8 | Invitations view | Covered |
| invoices | 4 | Payment view | Partial — create/update flows not detailed |
| member-profiles | 2 | Trainers (edit) | Covered |
| members | 8 | User + Trainers + User Assignment | Covered |
| notification-preferences | 2 | — | **No page** |
| notifications | 4 | Notifications view | Covered |
| organization-settings | 2 | — | **No page** |
| package-instances | 3 (incl. listAll) | Package Instances view | Covered |
| payouts | 1 | Payouts view | Covered |
| permissions | 1 | Access Control > Permissions | Covered |
| preferred-times | 2 | — | **No page** |
| product-categories | 5 | Categories + Inventory Options | Covered |
| products | 6 (incl. getStock, adjustStock) | Products view | Partial — stock procedures unused |
| promotions | 6 | Promotions view | Covered |
| purchase-orders | 5 | Purchase Orders view | Covered |
| registration | 2 | (auth flow, not dashboard) | N/A |
| role-permissions | 3 | Access Control > Roles/Permissions | Covered |
| roles | 4 | Access Control > Roles + Role view | Covered |
| rooms | 4 | (used only inside Add Appointment modal) | **No standalone page** |
| sales-orders | 5 | Sales view + Sales detail | Covered |
| service-categories | 3 | Service Categories view | Covered |
| service-category-config | upsert, getByCategoryId | (used inside Service Categories forms) | **Undocumented usage** |
| service-members | listMine, listForMember, updateBuffer, updateMyBuffer | My Services + Trainers | Covered |
| services | 4 | Services view | Covered |
| stock-requests | 5 (list/create/approve/reject/fulfill/getById) | Stock Requests view | Covered |
| suppliers | 5 | Suppliers + Inventory Options | Covered |
| tax-rates | 5 (list/create/update/setDefault/deactivate) | Settings > Tax Rates | Covered |
| trainer-availability | 4 | (used inside Trainers edit flow) | **Undocumented** (mentioned but not detailed) |
| transfer-orders | 6 (list/create/markInTransit/complete/cancel/getById) | Transfer Orders view | Covered |
| units-of-measure | 5 | UoM view | Covered |
| user-activity-log | 1 | — | **No page** |
| waitlist | 4 | — | **No page** |
| walk-in-customers | 5 (list/create/update/deactivate/getById) | Walk-in Customers view | Covered |
| **admin** (server-side) | 8 | — | **No page** |
