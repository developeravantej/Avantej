# Project Hub Index — Avantej

Last updated: 2026-04-20 (Pipeline Audit B/C/D)

Covers all pages in `apps/web` (TanStack Router) and all screens in `apps/native` (Expo Router).
Each page doc traces the full stack: route → components → hooks → API → service → DB.

**Shared context:**
- [Auth & Session Flow](shared/auth-flow.md) — Cookie config, RBAC model, context pipeline, gotchas
- [API Routers Overview](shared/api-overview.md) — ~210 procedures across 52 routers with auth levels

---

## Web — Public Pages (8)

| Page | Route | Purpose |
|------|-------|---------|
| [Landing](pages/web-landing.md) | `/` | Static marketing landing; passes `invitationToken`+`orgId` through all CTAs |
| [About](pages/web-about.md) | `/about` | Static about page — not linked from nav (stub) |
| [Features](pages/web-features.md) | `/features` | Feature showcase grid; 15 tiles; no API |
| [Contact](pages/web-contact.md) | `/contact` | Mailto-based form — no server call |
| [Demo](pages/web-demo.md) | `/demo` | Mailto-based demo request — no server call |
| [Subscribe](pages/web-subscribe.md) | `/subscribe` | Stripe subscription; authenticated + guest checkout |
| [Accept Invitation](pages/web-accept-invitation.md) | `/accept-invitation` | 5-state invite flow; dual-writes control-panel + tenant DB |
| [Verify Email](pages/web-verify-email.md) | `/verify-email` | Consumes Better-Auth email token; 1.2 s delay before redirect |

---

## Web — Authenticated (Non-Dashboard) Pages (7)

| Page | Route | Purpose |
|------|-------|---------|
| [Onboarding](pages/web-onboarding.md) | `/onboarding` | Org creation wizard — **both core actions are mocked (setTimeout)** |
| [Appointment View](pages/web-appointment-view.md) | `/appointment/view` | RBAC-gated calendar; clientName/service display raw UUIDs |
| [Service View](pages/web-service-view.md) | `/service/view` | RBAC-gated service list (legacy route, duplicate of dashboard) |
| [Service Category View](pages/web-service-category-view.md) | `/service-category/view` | Legacy route; duplicate of dashboard version |
| [User View](pages/web-user-view.md) | `/user/view` | Read-only member list (legacy route, duplicate of dashboard) |
| [Customers](pages/web-customers.md) | `/customers` | Own profile + client member list; `requirePermission` string/object mismatch |
| [GoHighLevel Integration](pages/web-go-highlevel-integration.md) | `/go-highlevel-integration` | CRM sync diagnostic; raw fetch (not oRPC); **platform-admin only** as of 2026-04-17; self-described as demo |

---

## Web — Dashboard Pages (51)

### Home & Navigation

| Page | Route | Purpose |
|------|-------|---------|
| [Dashboard Home](pages/web-dashboard-home.md) | `/dashboard` | KPI analytics + staff performance |
| [Inventory Options](pages/web-dashboard-inventory-options.md) | `/dashboard/inventory-options` | Hub for brands, product categories, suppliers |

### Appointments

| Page | Route | Purpose |
|------|-------|---------|
| [Appointment View](pages/web-dashboard-appointment-view.md) | `/dashboard/appointment/view` | Calendar with role-aware trainer filtering |
| [Class Slots View](pages/web-dashboard-appointment-class-slots-view.md) | `/dashboard/appointment/class-slots/view` | Class slot grid; branch ID is raw UUID text input |
| [Rooms](pages/web-dashboard-rooms-view.md) | `/dashboard/rooms/view` | Room CRUD with Active/All/Inactive tabs and branch combobox; gated by `appointment_management` permissions |

### Branch / Hierarchy

| Page | Route | Purpose |
|------|-------|---------|
| [Branch Create](pages/web-dashboard-branch-create.md) | `/dashboard/branch/create` | 4-step wizard (country → region → area → branch) |
| [Branch View](pages/web-dashboard-branch-view.md) | `/dashboard/branch/view` | List + edit branches; debug console.log remains |

### Members & Access Control

| Page | Route | Purpose |
|------|-------|---------|
| [User Management](pages/web-dashboard-user-view.md) | `/dashboard/user/view` | Read-only member list; cross-DB name join |
| [Trainers](pages/web-dashboard-trainers-view.md) | `/dashboard/trainers/view` | Parallel profile fetches + availability editor + buffer times + Commissions section (lazy-loads listLedger) |
| [Access Control – Invitations](pages/web-dashboard-access-control-invitations.md) | `/dashboard/access-control/invitations` | Send/resend/revoke; list is org-wide for any caller with `user_management:read` (fixed 2026-04-17) |
| [Access Control – Permissions](pages/web-dashboard-access-control-permissions.md) | `/dashboard/access-control/permissions` | Read-only resource/action permission matrix |
| [Access Control – Roles](pages/web-dashboard-access-control-roles.md) | `/dashboard/access-control/roles` | Roles CRUD with wizard — **wizard permissions not carried into RoleEditor** |
| [Access Control – User Assignment](pages/web-dashboard-access-control-user-assignment.md) | `/dashboard/access-control/user-assignment` | Assign roles — **role badges never render; bulk actions are no-ops** |
| [Role View](pages/web-dashboard-role-view.md) | `/dashboard/role/view` | Read-only role list (overlaps `/access-control/roles`) |

### Services & Packages

| Page | Route | Purpose |
|------|-------|---------|
| [Service](pages/web-dashboard-service-view.md) | `/dashboard/service/view` | Service CRUD with Commission % field (basis points); price formatted as MYR (fixed 2026-04-16) |
| [Service Category](pages/web-dashboard-service-category-view.md) | `/dashboard/service-category/view` | Service category CRUD; DataTable self-fetches edit data |
| [My Services](pages/web-dashboard-my-services-view.md) | `/dashboard/my-services/view` | Staff buffer-time overrides per **service** (not category — prior docs were wrong) |
| [Package Instances](pages/web-dashboard-packages-instances-view.md) | `/dashboard/packages/instances/view` | Package instance management; create form exposes 9 of 15 API fields |
| [Package Installments](pages/web-dashboard-packages-installments-view.md) | `/dashboard/packages/installments/view` | Installment management; search + date-range + plan-code filters; Plan Type label via `plansMap`; `installments.*` calls cast as `any`; refund flow rewired through P5 `RequestRefundDialog` |
| [Active Memberships](pages/web-dashboard-memberships-view.md) | `/dashboard/memberships/view` | Filter tabs (Active / Expiring 7d/30d / Frozen / Expired); row click opens P1 CustomerDetailSheet drawer |

### Customers

| Page | Route | Purpose |
|------|-------|---------|
| [Customer Directory](pages/web-dashboard-customers-view.md) | `/dashboard/customers/view` | Registered customers with LTV, outstanding, active packages; drawer with profile edit + packages + payments + stats |
| [Walk-in Customers](pages/web-dashboard-customers-walk-in-view.md) | `/dashboard/customers/walk-in/view` | Full CRUD for unregistered customers; branch is raw UUID input |

### Sales & Finance

| Page | Route | Purpose |
|------|-------|---------|
| [Sales View](pages/web-dashboard-sales-view.md) | `/dashboard/sales/view` | Read-only sales list + "+ New Sale" button → POS; View/Edit buttons still console.log stubs |
| [Sales Create (POS)](pages/web-dashboard-sales-create.md) | `/dashboard/sales/create` | Atomic POS flow with Member/Walk-in toggle; commission splits per line item (non-fatal); validation guards |
| [Sales Detail](pages/web-dashboard-sales-detail.md) | `/dashboard/sales/$id` | Single order detail + invoices + "Print Receipt" + "Request Refund" buttons |
| [Refunds Ledger](pages/web-dashboard-refunds-view.md) | `/dashboard/refunds/view` | Unified refund workflow (request → approve → process); atomic tx writes to payments + sales_orders + package_instances |
| [Commissions Ledger](pages/web-dashboard-commissions-view.md) | `/dashboard/commissions/view` | Status workflow (pending → approved → paid); bulk actions; KPI strip. Auto-populated from appointment completions + POS sales |
| [My Commissions](pages/web-dashboard-commissions-my.md) | `/dashboard/commissions/my` | Per-staff own commissions; no permission gate |
| [Cancelled Sales](pages/web-dashboard-cancelled-sales-view.md) | `/dashboard/cancelled-sales/view` | Read-only cancelled list; errors silently return `[]` |
| [Payment](pages/web-dashboard-payment-view.md) | `/dashboard/payment/view` | Read-only invoice ledger; View/Edit are stubs |
| [Payouts](pages/web-dashboard-payouts-view.md) | `/dashboard/payouts/view` | Cross-DB enrichment; hard 50-record limit, no pagination |
| [Expenses](pages/web-dashboard-expenses-view.md) | `/dashboard/expenses/view` | Claim lifecycle (submit → approve/reject → paid); currency stored as `"usd"` |
| [Promotions](pages/web-dashboard-promotions-view.md) | `/dashboard/promotions/view` | Promo CRUD; code/type immutable after creation; values in basis points |
| [Purchase Orders](pages/web-dashboard-purchase-orders-view.md) | `/dashboard/purchase-orders/view` | PO lifecycle (draft → approved → received); branch is raw UUID input |

### Inventory

| Page | Route | Purpose |
|------|-------|---------|
| [Products](pages/web-dashboard-products-view.md) | `/dashboard/products/view` | Product CRUD; 4 concurrent queries for form dropdowns |
| [Brands](pages/web-dashboard-brands-view.md) | `/dashboard/brands/view` | Brand CRUD; `_editTarget`/`_deleteTarget` are dead state |
| [Categories](pages/web-dashboard-categories-view.md) | `/dashboard/categories/view` | Product category CRUD; router named `productCategories` |
| [Suppliers](pages/web-dashboard-suppliers-view.md) | `/dashboard/suppliers/view` | Supplier CRUD with Active/All/Inactive tabs |
| [Stock Requests](pages/web-dashboard-stock-requests-view.md) | `/dashboard/stock-requests/view` | Pending → approved → fulfilled lifecycle |
| [Transfer Orders](pages/web-dashboard-transfer-orders-view.md) | `/dashboard/transfer-orders/view` | Pending → in_transit → completed lifecycle |
| [Units of Measure](pages/web-dashboard-uom-view.md) | `/dashboard/uom/view` | Base UoM CRUD; hard delete; shared cache with conversions page |
| [UoM Conversions](pages/web-dashboard-uom-conversions-view.md) | `/dashboard/uom-conversions/view` | Conversion factor CRUD; deleting base UoM with children fails at DB |

### Operations

| Page | Route | Purpose |
|------|-------|---------|
| [Attendance / Check-ins](pages/web-dashboard-attendance-view.md) | `/dashboard/attendance/view` | Today's bookings + drop-in check-in + log; polymorphic clientType (member / walk_in); 30-min anti-duplicate window |
| [Audit Log](pages/web-dashboard-audit-view.md) | `/dashboard/audit/view` | Cross-phase audit trail (sale/refund/checkin/commission/member actions); JSON delta expand |

### Comms & Notifications

| Page | Route | Purpose |
|------|-------|---------|
| [Announcements](pages/web-dashboard-announcements-view.md) | `/dashboard/announcements/view` | Announcement CRUD; audience filter is client-side only |
| [Notifications](pages/web-dashboard-notifications-view.md) | `/dashboard/notifications/view` | Three-tab (All/Unread/Read) notification list |

### Settings

| Page | Route | Purpose |
|------|-------|---------|
| [Google Calendar](pages/web-dashboard-settings-google-calendar.md) | `/dashboard/settings/google-calendar` | OAuth flow; syncScope derived from member role; token revocation is best-effort |
| [Tax Rates](pages/web-dashboard-settings-tax-rates.md) | `/dashboard/settings/tax-rates` | Tax rate CRUD; rates in basis points; 8 test scenarios |
| [Installment Plans](pages/web-dashboard-settings-installment-plans.md) | `/dashboard/settings/installment-plans` | Admin-configurable installment plans; replaces hardcoded `full\|half\|quarterly`; seed rows + `code` immutable + deactivate warns on service references |

---

## Native — Auth Screens (4)

| Screen | Path | Purpose |
|--------|------|---------|
| [Login](pages/native-auth-login.md) | `/(auth)/login` | Email/password sign-in; no email format validation |
| [Sign Up](pages/native-auth-sign-up.md) | `/(auth)/sign-up` | 5-field registration; duplicate email shows Alert with sign-in shortcut |
| [Forgot Password](pages/native-auth-forgot-password.md) | `/(auth)/forgot-password` | Always shows success (enumeration prevention); `redirectTo` is Expo path |
| [Verify Email](pages/native-auth-verify-email.md) | `/(auth)/verify-email` | 30-second resend cooldown; no back button |

---

## Native — Dashboard Screens (23)

### Main Tabs

| Screen | Path | Purpose |
|--------|------|---------|
| [Dashboard Home](pages/native-dashboard-home.md) | `/(app)/dashboard` | Home tab; quick actions, active packages, upcoming appointments; activity items have no onPress |
| [Calendar](pages/native-calendar-index.md) | `/(app)/dashboard/calendar` | Month calendar; `listForUser` per month; no error UI |
| [Notifications](pages/native-notifications-index.md) | `/(app)/dashboard/notifications` | Notification list with deep-links; `invalidateQueries` key may not match oRPC internal key |
| [My Packages](pages/native-packages-index.md) | `/(app)/dashboard/packages` | Package instance list with credits; "View Details" navigates to bookings (possible mismatch) |
| [Profile](pages/native-dashboard-profile.md) | `/(app)/dashboard/profile` | Profile + notification prefs; phone sync runs in render body (not useEffect) |
| [Modal](pages/native-modal.md) | `/(app)/modal` | Stub placeholder — no functionality |

### Explore

| Screen | Path | Purpose |
|--------|------|---------|
| [Explore](pages/native-explore-index.md) | `/(app)/dashboard/explore` | Service browser; search is client-side only; filter button non-functional |
| [Service Detail](pages/native-explore-id.md) | `/(app)/dashboard/explore/[id]` | Service detail + CTAs for Buy Package and Book Workout |

### Bookings

| Screen | Path | Purpose |
|--------|------|---------|
| [My Bookings](pages/native-bookings-index.md) | `/(app)/dashboard/bookings` | Upcoming/Past tabs; Reschedule button is a non-functional placeholder |
| [Booking Detail](pages/native-bookings-id.md) | `/(app)/dashboard/bookings/[id]` | Detail + cancel; tab bar hidden via navigator tree traversal |

### Book Workout Flow (4 steps)

| Screen | Path | Step |
|--------|------|------|
| [Setup](pages/native-book-workout.md) | `/(app)/dashboard/book-workout/book-workout` | 1/4 — Select package + trainer; **`branchId` is null throughout** |
| [Schedule](pages/native-book-workout-schedule.md) | `/(app)/dashboard/book-workout/schedule` | 2/4 — Date/time; **class path requires staff permission customers won't have** |
| [Review](pages/native-book-workout-review.md) | `/(app)/dashboard/book-workout/review` | 3/4 — Calls `appointments.create`; **`branchId: null` → UUID validation failure** |
| [Done](pages/native-book-workout-done.md) | `/(app)/dashboard/book-workout/done` | 4/4 — Success; resets context; `router.replace` prevents back |

### Buy Package Flow (7 steps + terms)

| Screen | Path | Step |
|--------|------|------|
| [Setup](pages/native-buy-package-setup.md) | `/(app)/dashboard/buy-package/setup` | 1/7 — Select package; **`orpc.packages.list` router not registered → runtime error** |
| [Schedule](pages/native-buy-package-schedule.md) | `/(app)/dashboard/buy-package/schedule` | 2/7 — Date/time; iOS DateTimePicker vs Android scroll wheel |
| [Info](pages/native-buy-package-info.md) | `/(app)/dashboard/buy-package/info` | 3/7 — Optional remark; `totalSteps=8` here vs `7` elsewhere |
| [Plan](pages/native-buy-package-plan.md) | `/(app)/dashboard/buy-package/plan` | 4/7 — Payment plan; auto-skips when only "full" available |
| [Review](pages/native-buy-package-review.md) | `/(app)/dashboard/buy-package/review` | 4/7 — Read-only summary; no mutations |
| [Sign](pages/native-buy-package-sign.md) | `/(app)/dashboard/buy-package/sign` | 5/7 — E-signature (landscape); all 3 terms docs must be viewed |
| [Pay](pages/native-buy-package-pay.md) | `/(app)/dashboard/buy-package/pay` | 6/7 — Creates `packageInstances`; **sends `packageId` but schema expects `serviceId`** |
| [Done](pages/native-buy-package-done.md) | `/(app)/dashboard/buy-package/done` | 7/7 — Success; **tax display uses `price * 1.1` not actual rate**; resets context |
| [Terms](pages/native-buy-package-terms.md) | `/(app)/dashboard/buy-package/terms` | Offline PDF viewer; opens system viewer + immediate `router.back()` |

---

## Known Issues Surfaced During Documentation

### Critical

| Page | Issue |
|------|-------|
| Onboarding (web) | Org creation is mocked with `setTimeout`; slug generation not implemented |
| Buy Package – Setup (native) | `orpc.packages.list` is not registered in `appRouter` — runtime error on load |
| Buy Package – Pay (native) | Screen sends `packageId` but `packageInstances.create` schema requires `serviceId` — will fail |
| Book Workout – Review (native) | `branchId: null` flows into `appointments.create` — fails UUID validation at API |

### Bugs

| Page | Issue |
|------|-------|
| ~~Service View (web)~~ | ~~Price formatted as USD (should be MYR)~~ — **FIXED** |
| My Services (web) | Old docs said overrides were per category — actually per `serviceId` in `member_service_buffer_overrides` |
| Sales View (web) | "View" button is a `console.log` stub — sales detail only reachable by direct URL |
| User Assignment (web) | Role badges never render (`members.list` doesn't return role ID arrays) |
| Invitations (web) | `list` filtered by `invitedBy: current member` — admins can't see each other's invites |
| Book Workout – Schedule (native) | `classSlots.list` requires `class_slot_management` permission — customers can't book classes |
| Buy Package – Done (native) | Tax display uses `price * 1.1` hardcoded approximation, not actual tax rate |

### Limitations / Gotchas

| Page | Issue |
|------|-------|
| Payouts (web) | Hard 50-record limit, no pagination |
| Package Installments (web) | All API calls cast as `any` (router not typed) |
| Expenses (web) | `currency` column defaults to `"usd"` but UI shows MYR |
| ~~Branch View (web)~~ | ~~Debug `console.log` statements remain in production code~~ — **FIXED** |
| Access Control – Roles (web) | Wizard-selected permissions not carried into RoleEditor |
| Access Control – User Assignment (web) | Bulk actions are UI-only no-ops |
| My Bookings (native) | Reschedule button is a non-functional placeholder |
| My Packages (native) | "View Details" navigates to bookings route using package instance ID — possible routing mismatch |
| Notifications (native) | `invalidateQueries(["notifications"])` may not match oRPC's internal query key |
| Profile (native) | Phone sync runs in render body, not `useEffect` |
| Buy Package – Info (native) | `totalSteps=8` in this screen, `7` in all others |
| Book Workout / Booking Detail (native) | Tab bar hide/show uses fragile navigator tree traversal |
