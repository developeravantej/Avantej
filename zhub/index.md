# Project Hub Index — Avantej Web App

Last updated: 2026-04-15

This hub documents every page in `apps/web` and the server API (`apps/server`).
Each page doc traces the full stack: route → components → hooks → API → service → DB.

**Shared context:**
- [Auth & Session Flow](shared/auth-flow.md) — Cookie config, RBAC model, context pipeline, gotchas
- [API Routers Overview](shared/api-overview.md) — All 47 routers with procedure names and auth levels

---

## Auth Pages (3)

| Page | Route | Purpose |
|------|-------|---------|
| [Login](pages/web-auth-login.md) | `/login` | Better-Auth email/password sign-in with org selector |
| [Sign Up](pages/web-auth-signup.md) | `/signup` | New account creation (control-panel user) |
| [Setup Password](pages/web-auth-setup-password.md) | `/setup-password` | Token-gated password setup for invited users — **note: calls non-existent REST endpoints** |

---

## Public Pages (8)

| Page | Route | Purpose |
|------|-------|---------|
| [Home](pages/web-home.md) | `/` | Static marketing landing page |
| [About](pages/web-about.md) | `/about` | Static marketing about page |
| [Features](pages/web-features.md) | `/features` | Feature showcase grid |
| [Contact](pages/web-contact.md) | `/contact` | Mailto-based contact form (no server) |
| [Demo](pages/web-demo.md) | `/demo` | Mailto-based demo request form (no server) |
| [Subscribe](pages/web-subscribe.md) | `/subscribe` | Dual checkout flow (authenticated + guest) via legacy REST apiClient |
| [Accept Invitation](pages/web-accept-invitation.md) | `/accept-invitation` | 5-state invitation acceptance; dual-writes control-panel + tenant DB |
| [Verify Email](pages/web-verify-email.md) | `/verify-email` | Consumes Better-Auth email token; 1.2 s delay before redirect |

---

## Authenticated (Non-Dashboard) Pages (6)

| Page | Route | Purpose |
|------|-------|---------|
| [Onboarding](pages/web-onboarding.md) | `/onboarding` | Org creation wizard — **both core actions are mocked (setTimeout)** |
| [Appointment View](pages/web-appointment-view.md) | `/appointment/view` | RBAC-gated calendar; clientName/service display truncated UUIDs (known limitation) |
| [Customers](pages/web-customers.md) | `/customers` | User's own profile + client member list; create requires email to pre-exist |
| [Service View](pages/web-service-view.md) | `/service/view` | RBAC-gated service list — **`id: Number(uuid)` bug in edit prefill** |
| [Service Category View](pages/web-service-category-view.md) | `/service-category/view` | Legacy route; duplicate of dashboard version |
| [User View](pages/web-user-view.md) | `/user/view` | Legacy route; duplicate of dashboard version |
| [GoHighLevel Integration](pages/web-go-highlevel-integration.md) | `/go-highlevel-integration` | Raw fetch calls (not oRPC); complex untested normalization logic |

---

## Dashboard Pages (41)

### Home & Navigation

| Page | Route | Purpose |
|------|-------|---------|
| [Dashboard Home](pages/web-dashboard-home.md) | `/dashboard` | KPI analytics + staff performance; QuickInsight is hardcoded |
| [Inventory Options](pages/web-dashboard-inventory-options.md) | `/dashboard/inventory-options` | Hub for brands, product categories, suppliers |

### Appointments

| Page | Route | Purpose |
|------|-------|---------|
| [Appointment View](pages/web-dashboard-appointment-view.md) | `/dashboard/appointment/view` | Calendar with role-aware trainer filtering |
| [Class Slots View](pages/web-dashboard-appointment-class-slots-view.md) | `/dashboard/appointment/class-slots/view` | Class slot grid; branch ID is raw UUID text input |

### Branch / Hierarchy

| Page | Route | Purpose |
|------|-------|---------|
| [Branch Create](pages/web-dashboard-branch-create.md) | `/dashboard/branch/create` | 4-step wizard (country → region → area → branch) |
| [Branch View](pages/web-dashboard-branch-view.md) | `/dashboard/branch/view` | List + edit branches; 30s localStorage cache; debug console.log remains |

### Members & Access Control

| Page | Route | Purpose |
|------|-------|---------|
| [User Management](pages/web-dashboard-user-view.md) | `/dashboard/user/view` | Read-only member list; cross-DB name join; sorting flags have no effect |
| [Trainers](pages/web-dashboard-trainers-view.md) | `/dashboard/trainers/view` | Most complex page: parallel profile fetches + availability + buffer times |
| [Access Control – Invitations](pages/web-dashboard-access-control-invitations.md) | `/dashboard/access-control/invitations` | Send/resend/revoke invitations |
| [Access Control – Permissions](pages/web-dashboard-access-control-permissions.md) | `/dashboard/access-control/permissions` | View resource/action permission matrix |
| [Access Control – Roles](pages/web-dashboard-access-control-roles.md) | `/dashboard/access-control/roles` | Roles list with wizard — **wizard permissions not carried into RoleEditor** |
| [Access Control – User Assignment](pages/web-dashboard-access-control-user-assignment.md) | `/dashboard/access-control/user-assignment` | Assign roles to members — **role badges never render (known bug); bulk actions are no-ops** |
| [Role View](pages/web-dashboard-role-view.md) | `/dashboard/role/view` | Read-only role list (duplicate route exists at `/access-control/roles`) |

### Services & Packages

| Page | Route | Purpose |
|------|-------|---------|
| [Service](pages/web-dashboard-service-view.md) | `/dashboard/service/view` | Service CRUD — **price formatted as USD instead of MYR (bug)** |
| [Service Category](pages/web-dashboard-service-category-view.md) | `/dashboard/service-category/view` | Service category CRUD; DataTable self-fetches edit data |
| [My Services](pages/web-dashboard-my-services-view.md) | `/dashboard/my-services/view` | Staff buffer-time overrides per category |
| [Package Instances](pages/web-dashboard-packages-instances-view.md) | `/dashboard/packages/instances/view` | Package instance management; service name resolved via second always-on query |
| [Package Installments](pages/web-dashboard-packages-installments-view.md) | `/dashboard/packages/installments/view` | Admin installment management; all calls cast as `any` |

### Customers

| Page | Route | Purpose |
|------|-------|---------|
| [Walk-in Customers](pages/web-dashboard-customers-walk-in-view.md) | `/dashboard/customers/walk-in/view` | Full CRUD for unregistered customers; 11 fields; branch is raw UUID input |

### Sales & Finance

| Page | Route | Purpose |
|------|-------|---------|
| [Sales View](pages/web-dashboard-sales-view.md) | `/dashboard/sales/view` | Read-only sales list; View/Edit buttons are stubs |
| [Sales Detail](pages/web-dashboard-sales-detail.md) | `/dashboard/sales/$id` | Single order detail + invoices — **navigate-here action is unimplemented** |
| [Cancelled Sales](pages/web-dashboard-cancelled-sales-view.md) | `/dashboard/cancelled-sales/view` | Read-only cancelled sales list; errors silently return `[]` |
| [Payment](pages/web-dashboard-payment-view.md) | `/dashboard/payment/view` | Read-only invoice list; View/Edit are stubs; defines its own CopyableCell |
| [Payouts](pages/web-dashboard-payouts-view.md) | `/dashboard/payouts/view` | Read-only; requires `user_management:read`; cross-DB name enrichment |
| [Expenses](pages/web-dashboard-expenses-view.md) | `/dashboard/expenses/view` | Claim lifecycle (submit → approve/reject → paid); currency stored as `"usd"` but shown as MYR |
| [Promotions](pages/web-dashboard-promotions-view.md) | `/dashboard/promotions/view` | Promo CRUD; code/type immutable after creation; values in basis points |
| [Purchase Orders](pages/web-dashboard-purchase-orders-view.md) | `/dashboard/purchase-orders/view` | PO workflow (draft → approved → received); branch is raw UUID input |

### Inventory

| Page | Route | Purpose |
|------|-------|---------|
| [Products](pages/web-dashboard-products-view.md) | `/dashboard/products/view` | Product CRUD; 4 concurrent queries for form dropdowns |
| [Brands](pages/web-dashboard-brands-view.md) | `/dashboard/brands/view` | Brand CRUD with product-count join |
| [Categories](pages/web-dashboard-categories-view.md) | `/dashboard/categories/view` | Product category CRUD with product-count join |
| [Suppliers](pages/web-dashboard-suppliers-view.md) | `/dashboard/suppliers/view` | Supplier CRUD with Active/All/Inactive tabs |
| [Stock Requests](pages/web-dashboard-stock-requests-view.md) | `/dashboard/stock-requests/view` | Pending → approved → fulfilled lifecycle |
| [Transfer Orders](pages/web-dashboard-transfer-orders-view.md) | `/dashboard/transfer-orders/view` | Pending → in_transit → completed lifecycle |
| [Units of Measure](pages/web-dashboard-uom-view.md) | `/dashboard/uom/view` | Base UoM CRUD; hard delete; filters child UoMs client-side |
| [UoM Conversions](pages/web-dashboard-uom-conversions-view.md) | `/dashboard/uom-conversions/view` | Conversion factor CRUD; deleting a base UoM with children fails at DB level |

### Comms & Notifications

| Page | Route | Purpose |
|------|-------|---------|
| [Announcements](pages/web-dashboard-announcements-view.md) | `/dashboard/announcements/view` | Announcement CRUD; no client-side route guard |
| [Notifications](pages/web-dashboard-notifications-view.md) | `/dashboard/notifications/view` | Three-tab (All/Unread/Read) notification list |

### Settings

| Page | Route | Purpose |
|------|-------|---------|
| [Payment Settings](pages/web-dashboard-settings-payment-view.md) | `/dashboard/settings/payment/view` | Single-field form: installment grace period (0–90 days) |
| [Tax Rates](pages/web-dashboard-settings-tax-rates.md) | `/dashboard/settings/tax-rates` | Tax rate CRUD; rates in basis points; 8 test scenarios |

---

## Known Issues Surfaced During Documentation

| Severity | Page | Issue |
|----------|------|-------|
| 🔴 Critical | Setup Password | Calls `/api/v1/auth-setup/*` endpoints that do not exist in the server |
| 🔴 Critical | Onboarding | Org creation is mocked with `setTimeout`; slug generation not implemented |
| 🟠 Bug | Service View | Price formatted as USD (should be MYR) |
| 🟠 Bug | Service View | `id: Number(uuid) || 0` — edit prefill always sends `id: 0` |
| 🟠 Bug | User Assignment | Role badges never render (`members.list` doesn't return role ID arrays) |
| 🟠 Bug | Sales View | "View" button navigates nowhere (`console.log` only) |
| 🟡 Limitation | Branch View | Debug `console.log` statements remain in production code |
| 🟡 Limitation | Appointment View | `clientName`/`service` display raw UUIDs (no name join) |
| 🟡 Limitation | Access Control – Roles | Wizard-selected permissions not carried into RoleEditor |
| 🟡 Limitation | Access Control – User Assignment | Bulk actions (Bulk Assign Role, Deactivate Selected) are UI-only no-ops |
| 🟡 Limitation | Package Installments | All installment API calls cast as `any` (router not typed) |
| 🟡 Limitation | Expenses | `currency` column defaults to `"usd"` but UI shows MYR |
| 🟡 Limitation | Purchase Orders / Walk-in / Class Slots | Branch picker is raw UUID text input |
