# Project Hub Index

**Last updated:** 2026-05-24

Generated from full hub scan. Contains 105 pages (76 web + 29 native screens) plus shared reference docs. Incremental update 2026-05-24: **Quality-9 Plan D-S7** — split nine tenant mega-routers into folder modules (`*/index.ts` + `*.procedures.ts`), CI router LOC gates (≤400 LOC per module, 0 allowlist), codemod/refine toolchain (`codemod:split-router`, `refine:*-imports`), re-export shims for deep imports, and `assertTenantContext` guard standardization. Updated shared docs: [API Overview](shared/api-overview.md), [Auth Flow](shared/auth-flow.md). Prior update 2026-05-12: web-debt-cleanup refactor (commit `25f6d75b`) — `features/{appointments,customers-detail,installments,purchase-orders,services}/` extraction, route+lazy splits (payouts, notifications, tax-rates, purchase-orders), `useApiMutation` rollout, refunds workflow promoted to first-class, and 2 new routes. Updated pages: sales-detail, sales-view, purchase-orders, refunds(-view), suppliers-view, appointment-view, dashboard-appointment, attendance-view, customer-detail, access-control-{roles,user-assignment,invitations}, accept-invitation, packages-installments(-view), commissions(-view,-my), trainers-tiers, home, payouts-view, notifications-view, settings-tax-rates, branch-view, go-highlevel-integration, subscribe. New: `operations-approvals`, `trainers-availability`.

---

## Shared Reference Docs

| Doc | Purpose |
|-----|---------|
| [Auth Flow](shared/auth-flow.md) | Session pipeline, two-DB architecture, RBAC model, router guard helpers, cookie config |
| [API Overview](shared/api-overview.md) | All tenant oRPC routers with procedure names, auth levels, and split-router module map |

---

## Web Pages

### Public & Auth (11)

| Page | Route | Purpose |
|------|-------|---------|
| [Home / Landing](pages/web-home.md) | `/` | Marketing landing page |
| [About](pages/web-about.md) | `/about` | About page |
| [Features](pages/web-features.md) | `/features` | Feature overview |
| [Contact](pages/web-contact.md) | `/contact` | Contact page |
| [Demo](pages/web-demo.md) | `/demo` | Demo request page |
| [Subscribe](pages/web-subscribe.md) | `/subscribe` | Subscription signup |
| [Login](pages/web-auth-login.md) | `/auth/login` | Email/password sign-in |
| [Signup](pages/web-auth-signup.md) | `/auth/signup` | New account registration |
| [Verify Email](pages/web-verify-email.md) | `/auth/verify-email` | Email OTP verification |
| [Setup Password](pages/web-auth-setup-password.md) | `/auth/setup-password` | Post-invite password setup |
| [Accept Invitation](pages/web-accept-invitation.md) | `/accept-invitation` | Staff invitation acceptance |

### Onboarding & Setup (1)

| Page | Route | Purpose |
|------|-------|---------|
| [Onboarding](pages/web-onboarding.md) | `/onboarding` | First-time org setup wizard |

### Dashboard: Home & Access Control (7)

| Page | Route | Purpose |
|------|-------|---------|
| [Dashboard Home](pages/web-dashboard-home.md) | `/dashboard` | KPI cards, quick-action widgets |
| [Roles](pages/web-dashboard-access-control-roles.md) | `/dashboard/access-control/roles` | Role list, create, delete |
| [Role Detail](pages/web-dashboard-role-view.md) | `/dashboard/access-control/role/$id` | Role permissions editor |
| [User Assignment](pages/web-dashboard-access-control-user-assignment.md) | `/dashboard/access-control/user-assignment` | Staff invite, role change, deactivate |
| [Permissions](pages/web-dashboard-access-control-permissions.md) | `/dashboard/access-control/permissions` | Permission matrix viewer |
| [Invitations](pages/web-dashboard-access-control-invitations.md) | `/dashboard/access-control/invitations` | Pending invite management |
| [User Detail](pages/web-dashboard-user-view.md) | `/dashboard/user/$id` | User profile (legacy exempt) |

### Dashboard: Operations (9)

| Page | Route | Purpose |
|------|-------|---------|
| [Appointments](pages/web-dashboard-appointment-view.md) | `/dashboard/appointment/view` | Booking calendar by date/branch |
| [Class Slots](pages/web-dashboard-appointment-class-slots-view.md) | `/dashboard/appointment/class-slots/view` | Class slot scheduling |
| [Rooms](pages/web-dashboard-rooms-view.md) | `/dashboard/rooms/view` | Room list and management |
| [Attendance Today](pages/web-dashboard-attendance-view.md) | `/dashboard/attendance/view` | Today bookings + drop-in check-in |
| [Pending Approvals](pages/web-dashboard-operations-approvals.md) | `/dashboard/operations/approvals` | Package-purchase approval queue + trainer assignment |
| [Audit Log](pages/web-dashboard-audit-view.md) | `/dashboard/audit/view` | System audit trail |
| [Announcements](pages/web-dashboard-announcements-view.md) | `/dashboard/announcements/view` | Org announcements CRUD |
| [Notifications](pages/web-dashboard-notifications-view.md) | `/dashboard/notifications/view` | Notification history |
| [My Services](pages/web-dashboard-my-services-view.md) | `/dashboard/my-services/view` | Staff personal service assignments |

### Dashboard: Customers (5)

| Page | Route | Purpose |
|------|-------|---------|
| [Customers](pages/web-dashboard-customers-view.md) | `/dashboard/customers/view` | Registered member directory |
| [Walk-in Customers](pages/web-dashboard-customers-walk-in-view.md) | `/dashboard/customers/walk-in/view` | Walk-in customer log |
| [Customer 360](pages/web-dashboard-customers-360.md) | `/dashboard/customers/$id` | Customer detail sheet |
| [Trainers](pages/web-dashboard-trainers-view.md) | `/dashboard/trainers/view` | Trainer directory |
| [Trainer Tiers](pages/web-dashboard-trainers-tiers.md) | `/dashboard/trainers/tiers` | Trainer tier configuration (redirect → trainers/view?tab=tiers) |
| [Trainer Availability](pages/web-dashboard-trainers-availability.md) | `/dashboard/trainers/availability` | Trainer + coach-intake availability scheduling |

### Dashboard: Branch & Hierarchy (2)

| Page | Route | Purpose |
|------|-------|---------|
| [Branch Create](pages/web-dashboard-branch-create.md) | `/dashboard/branch/create` | 4-step new branch wizard |
| [Branch Detail](pages/web-dashboard-branch-view.md) | `/dashboard/branch/$id` | Branch settings and info |

### Dashboard: Sales & Finance (12)

| Page | Route | Purpose |
|------|-------|---------|
| [Sales](pages/web-dashboard-sales-view.md) | `/dashboard/sales/view` | Sales order list with stats |
| [New Sale (POS)](pages/web-dashboard-sales-create.md) | `/dashboard/sales/create` | 4-step POS checkout flow |
| [Sale Detail](pages/web-dashboard-sales-detail.md) | `/dashboard/sales/$id` | Order details and items |
| [Refunds](pages/web-dashboard-refunds-view.md) | `/dashboard/refunds/view` | Refund requests list |
| [Cancelled Sales](pages/web-dashboard-cancelled-sales-view.md) | `/dashboard/cancelled-sales/view` | Cancelled order history |
| [Commissions](pages/web-dashboard-commissions-view.md) | `/dashboard/commissions/view` | Commission splits management |
| [My Commissions](pages/web-dashboard-commissions-my.md) | `/dashboard/commissions/my` | Staff personal commissions |
| [Payouts](pages/web-dashboard-payouts-view.md) | `/dashboard/payouts/view` | Payout records |
| [Expenses](pages/web-dashboard-expenses-view.md) | `/dashboard/expenses/view` | Expense submit and approval |
| [Payments](pages/web-dashboard-payment-view.md) | `/dashboard/payment/view` | Payment transaction log |
| [Promotions](pages/web-dashboard-promotions-view.md) | `/dashboard/promotions/view` | Promo code management |
| [Purchase Orders](pages/web-dashboard-purchase-orders-view.md) | `/dashboard/purchase-orders/view` | Supplier PO management |

### Dashboard: Packages & Memberships (6)

| Page | Route | Purpose |
|------|-------|---------|
| [Services](pages/web-dashboard-service-view.md) | `/dashboard/service/view` | Service catalog (legacy exempt) |
| [Service Categories](pages/web-dashboard-service-category-view.md) | `/dashboard/service-category/view` | Service category list (legacy exempt) |
| [Packages / Memberships](pages/web-dashboard-packages-instances-view.md) | `/dashboard/packages/instances/view` | Package instances with tabs |
| [Memberships](pages/web-dashboard-memberships-view.md) | `/dashboard/memberships/view` | Active membership list |
| [Package Installments](pages/web-dashboard-packages-installments-view.md) | `/dashboard/packages/installments/view` | Installment plan tracking |
| [Category Commission](pages/web-dashboard-category-commission.md) | `/dashboard/category-commission` | Commission rate configuration |

### Dashboard: Inventory (9)

| Page | Route | Purpose |
|------|-------|---------|
| [Products](pages/web-dashboard-products-view.md) | `/dashboard/products/view` | Product catalog |
| [Brands](pages/web-dashboard-brands-view.md) | `/dashboard/brands/view` | Brand management |
| [Categories](pages/web-dashboard-categories-view.md) | `/dashboard/categories/view` | Product category management |
| [Suppliers](pages/web-dashboard-suppliers-view.md) | `/dashboard/suppliers/view` | Supplier directory |
| [Stock Requests](pages/web-dashboard-stock-requests-view.md) | `/dashboard/stock-requests/view` | Internal stock transfer requests |
| [Transfer Orders](pages/web-dashboard-transfer-orders-view.md) | `/dashboard/transfer-orders/view` | Cross-branch transfer orders |
| [Units of Measure](pages/web-dashboard-uom-view.md) | `/dashboard/uom/view` | Unit of measure list |
| [UoM Conversions](pages/web-dashboard-uom-conversions-view.md) | `/dashboard/uom-conversions/view` | Unit conversion rules |
| [Inventory Options](pages/web-dashboard-inventory-options.md) | `/dashboard/inventory-options` | Brands/Categories/Suppliers tab wrapper |

### Dashboard: Settings (6)

| Page | Route | Purpose |
|------|-------|---------|
| [Organization Settings](pages/web-dashboard-settings-organization.md) | `/dashboard/settings/organization` | Org name, logo, timezone |
| [Notification Prefs](pages/web-dashboard-settings-notifications.md) | `/dashboard/settings/notifications` | Notification preferences |
| [Google Calendar](pages/web-dashboard-settings-google-calendar.md) | `/dashboard/settings/google-calendar` | Google Calendar OAuth sync |
| [Tax Rates](pages/web-dashboard-settings-tax-rates.md) | `/dashboard/settings/tax-rates` | GST/SST rate configuration |
| [Installment Plans](pages/web-dashboard-settings-installment-plans.md) | `/dashboard/settings/installment-plans` | Installment plan setup |
| [Payment Settings](pages/web-dashboard-settings-payment-view.md) | `/dashboard/settings/payment` | Payment gateway config |

### Platform Admin & Legacy (4)

| Page | Route | Purpose |
|------|-------|---------|
| [Platform Admins](pages/web-dashboard-platform-admin-admins.md) | `/dashboard/platform-admin/admins` | Control panel admin management |
| [Platform Users](pages/web-dashboard-platform-admin-users.md) | `/dashboard/platform-admin/users` | All-user lookup (super admin only) |
| [GoHighLevel Integration](pages/web-go-highlevel-integration.md) | `/go-highlevel-integration` | CRM integration callback |
| [Customer Redirect](pages/web-customers-redirect.md) | `/customers` | Redirect stub |

---

## Native Screens

### Auth Flow (4)

| Screen | Path | Purpose |
|--------|------|---------|
| [Login](pages/native-auth-login.md) | `(auth)/login` | Email/password sign-in |
| [Sign Up](pages/native-auth-sign-up.md) | `(auth)/sign-up` | New account registration |
| [Forgot Password](pages/native-auth-forgot-password.md) | `(auth)/forgot-password` | Password reset request |
| [Verify Email](pages/native-auth-verify-email.md) | `(auth)/verify-email` | OTP verification |

### Dashboard Home (5)

| Screen | Path | Purpose |
|--------|------|---------|
| [Home](pages/native-dashboard-home.md) | `(app)/dashboard` | Upcoming bookings + quick actions |
| [Bookings](pages/native-dashboard-bookings.md) | `(app)/dashboard/bookings` | Full booking history list |
| [Booking Detail](pages/native-dashboard-booking-detail.md) | `(app)/dashboard/booking/$id` | Single booking detail and actions |
| [Calendar](pages/native-dashboard-calendar.md) | `(app)/dashboard/calendar` | Month view calendar of bookings |
| [Notifications](pages/native-dashboard-notifications.md) | `(app)/dashboard/notifications` | Push notification history |

### Profile & Packages (2)

| Screen | Path | Purpose |
|--------|------|---------|
| [Profile](pages/native-dashboard-profile.md) | `(app)/dashboard/profile` | User profile and settings |
| [Packages](pages/native-dashboard-packages.md) | `(app)/dashboard/packages` | Active package credits summary |

### Explore (2)

| Screen | Path | Purpose |
|--------|------|---------|
| [Explore](pages/native-dashboard-explore.md) | `(app)/dashboard/explore` | Browse available classes/services |
| [Explore Detail](pages/native-dashboard-explore-detail.md) | `(app)/dashboard/explore/$id` | Class or service detail view |

### Buy Package Flow (10 steps)

| Screen | Path | Purpose |
|--------|------|---------|
| [Select Package](pages/native-buy-package-index.md) | `(app)/dashboard/buy-package` | Browse available packages |
| [Package Info](pages/native-buy-package-info.md) | `(app)/dashboard/buy-package/info` | Package detail before purchase |
| [Package Plan](pages/native-buy-package-plan.md) | `(app)/dashboard/buy-package/plan` | Payment plan selection |
| [Schedule](pages/native-buy-package-schedule.md) | `(app)/dashboard/buy-package/schedule` | Preferred session scheduling |
| [Setup](pages/native-buy-package-setup.md) | `(app)/dashboard/buy-package/setup` | Trainer assignment step |
| [Terms](pages/native-buy-package-terms.md) | `(app)/dashboard/buy-package/terms` | Terms and conditions accept |
| [Sign](pages/native-buy-package-sign.md) | `(app)/dashboard/buy-package/sign` | Digital signature step |
| [Review & Pay](pages/native-buy-package-review.md) | `(app)/dashboard/buy-package/review` | Order summary before payment |
| [Payment](pages/native-buy-package-pay.md) | `(app)/dashboard/buy-package/pay` | Stripe payment sheet |
| [Done](pages/native-buy-package-done.md) | `(app)/dashboard/buy-package/done` | Purchase confirmation |

### Book Workout Flow (4 steps)

| Screen | Path | Purpose |
|--------|------|---------|
| [Setup](pages/native-book-workout-start.md) | `(app)/dashboard/book-workout/book-workout` | Select package and trainer |
| [Schedule](pages/native-book-workout-schedule.md) | `(app)/dashboard/book-workout/schedule` | Pick date and time slot |
| [Review](pages/native-book-workout-review.md) | `(app)/dashboard/book-workout/review` | Confirm booking details |
| [Done](pages/native-book-workout-done.md) | `(app)/dashboard/book-workout/done` | Booking confirmation |

---

## Notes

- Duplicate page docs may exist for some routes (e.g. both `-view.md` and without suffix) — the `-view.md` variant is canonical for routes with `/view` suffix.
- Legacy pages (service, service-category, user detail) are marked LEGACY EXEMPT in their files — do not extend these.
- Run `/hub-update` after feature branches to keep this index current.
