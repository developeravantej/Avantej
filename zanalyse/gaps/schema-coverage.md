# Schema & Field Coverage Audit

**Date:** 2026-04-16
**Branch:** Customer-app
**Auditor:** Agent 1 (Schema & Field Coverage)

## Summary

| Category | Count |
|---|---|
| Orphaned Tables (zero service functions) | 9 |
| Partially Covered Tables (service/router/frontend gap) | 8 |
| Orphaned Fields (never read/written) | 16 |
| Write-Only Fields (written but never read/displayed) | 6 |
| Read-Only Fields (read but never written besides defaults) | 2 |
| **Total Findings** | **41** |

---

## Orphaned Tables

Tables defined in the DB schema with zero service functions, API procedures, or meaningful application code touching them.

### [HIGH] `payments` table has no service, no API router, no frontend
- **File:** `packages/db/src/schema/tenant/payments.ts`
- **Status:** NEW
- **What's wrong:** The `payments` table (22 columns including Stripe tracking, amounts, platform fees, refunds) has no service file, no API router, and no frontend page. The `apps/web/src/routes/.../payment/view.tsx` page actually reads from `invoices`, not `payments`. The table is referenced only from `package-instances.ts` schema (FK) and `installment.service.ts` / `invoice.service.ts` for payment-related IDs, but no CRUD operations exist for the table itself.
- **What to do:** Create `packages/services/src/payment.service.ts` with list/create/update functions, a corresponding API router, and wire the payment view page to use it. Alternatively, if payments are always created via Stripe webhooks, create at minimum a service for querying and a router to expose payment data.

### [HIGH] `partner_stripe_accounts` table is completely orphaned
- **File:** `packages/db/src/schema/tenant/partner-stripe-accounts.ts`
- **Status:** NEW
- **What's wrong:** Zero references in any service, API router, or frontend code. The table tracks Stripe Connect accounts for partners (coaches/trainers) but has no CRUD implementation.
- **What to do:** Create service + API router for managing partner Stripe Connect onboarding. Wire to the payout flow which already references `stripeConnectAccountId`.

### [HIGH] `appointment_staff` junction table has no service or API usage
- **File:** `packages/db/src/schema/tenant/appointment-staff.ts`
- **Status:** NEW
- **What's wrong:** The junction table linking staff to appointments is defined but never imported or used in any service or API router. The appointment service creates appointments with a `trainerId` field on the appointments table directly, bypassing this many-to-many table entirely.
- **What to do:** Either integrate `appointment_staff` into the appointment creation/query flow to support multi-staff appointments, or remove the table if single-trainer (via `appointments.trainerId`) is the final design.

### [HIGH] `appointment_clients` junction table has no service or API usage
- **File:** `packages/db/src/schema/tenant/appointment-clients.ts`
- **Status:** NEW
- **What's wrong:** The junction table linking clients to appointments with per-client pricing and attendance tracking is never used in any service or API. The appointment service uses `appointments.userId` directly for client tracking.
- **What to do:** Integrate into appointment service for semi-private/group appointments where multiple clients need per-client tracking (pricing, attendance, package instance). Currently only single-client flow works.

### [HIGH] `recurrence_rules` table has no service or API usage
- **File:** `packages/db/src/schema/tenant/recurrence-rules.ts`
- **Status:** NEW
- **What's wrong:** Complex recurrence configuration (frequency, weekly repeat days, monthly types, end conditions) is defined but never referenced in any service, API router, or frontend. The `appointments` table has `isRecurring`/`recurringFrequency`/`recurringEndDate` fields that are also unused (see Orphaned Fields).
- **What to do:** Implement recurring appointment support in `appointment.service.ts` using this table, or remove both the table and the recurring fields on `appointments` if recurring is descoped.

### [MEDIUM] `dashboard_snapshots` table has no service or API usage
- **File:** `packages/db/src/schema/tenant/dashboard-snapshots.ts`
- **Status:** NEW
- **What's wrong:** Aggregated dashboard metrics (total sales, appointment counts, active members) are defined but never populated or queried. The `analytics.service.ts` computes metrics live rather than from snapshots.
- **What to do:** Either implement a cron job to populate snapshots and read from them in the dashboard, or remove the table if live computation is the chosen approach.

### [MEDIUM] `organization_analytics` (control panel) table has no usage
- **File:** `packages/db/src/schema/control-panel/organization-analytics.ts`
- **Status:** NEW
- **What's wrong:** Superadmin dashboard metrics table (total customers, bookings, revenue per org) has zero references in any service, API, or frontend outside of its own schema and migration files.
- **What to do:** Implement a sync job to populate analytics from tenant DBs and expose via the admin panel, or remove if not needed.

### [MEDIUM] `payment_items` table has no service or API usage
- **File:** `packages/db/src/schema/tenant/payment-items.ts`
- **Status:** NEW
- **What's wrong:** Line items for payment breakdowns (type, quantity, unit price, promotion link) have no service functions and no API router. Since the parent `payments` table is also orphaned, no payment line items can be created or read.
- **What to do:** Create as part of the `payment.service.ts` implementation -- line items should be created atomically with payments.

### [MEDIUM] `member_category_buffer_overrides` table has no service usage
- **File:** `packages/db/src/schema/tenant/member-category-buffer-overrides.ts`
- **Status:** NEW
- **What's wrong:** Per-member category-level buffer time overrides are defined but never referenced in any service. The `buffer-time.service.ts` only uses `member_service_buffer_overrides` and `service_category_config`, skipping the category-level override entirely.
- **What to do:** Add category-level buffer override lookup to `resolveBufferTime()` in `buffer-time.service.ts`, falling back from service-level to category-level to config-level.

---

## Partially Covered Tables

Tables with a service or API router but missing coverage at another layer.

### [MEDIUM] `service_members` has API router but no service file
- **File:** `packages/api/src/routers/service-members.ts`
- **Status:** NEW
- **What's wrong:** The `serviceMembersRouter` has full CRUD operations with direct DB queries inside the router handlers. No corresponding `service-members.service.ts` exists in the services package. This breaks the architecture pattern where business logic lives in services.
- **What to do:** Extract DB operations from the router into `packages/services/src/service-members.service.ts`.

### [MEDIUM] `payouts` has API router but no service file
- **File:** `packages/api/src/routers/payouts.ts`
- **Status:** NEW
- **What's wrong:** The `payoutsRouter` queries the `payouts` table directly in the router handler. No `payout.service.ts` exists. Additionally, only a `list` procedure exists -- no create/update/delete.
- **What to do:** Create `packages/services/src/payout.service.ts` with list/create/complete functions. Add create/update procedures to the router.

### [MEDIUM] `notifications` service has read-only functions -- no create/insert
- **File:** `packages/services/src/notification.service.ts`
- **Status:** NEW
- **What's wrong:** The notification service can list and mark-as-read, but has no `createNotification()` function. No code anywhere creates notification records except `seed-app-data.ts`. The notification system is read-only with no write path in production.
- **What to do:** Add `createNotification()` to the service and call it from appointment creation, package purchase, payment events, etc.

### [MEDIUM] `user_activity_log` service has read-only functions -- no create/insert
- **File:** `packages/services/src/user-activity-log.service.ts`
- **Status:** NEW
- **What's wrong:** Only `listUserActivityLog()` exists. No code creates activity log entries except seeds. The "Recent Activity" widget will always be empty in production.
- **What to do:** Add `createActivityLogEntry()` and call it from appointment, package, and payment workflows.

### [MEDIUM] `notification_preferences` has service but no frontend page
- **File:** `packages/services/src/notification-preference.service.ts`
- **Status:** NEW
- **What's wrong:** Service and API router exist for notification preferences, but no frontend settings page allows users to configure their email/SMS/push notification preferences.
- **What to do:** Add a notification preferences section to the user settings page.

### [MEDIUM] `rooms` has service and API router but no management page
- **File:** `packages/services/src/rooms.service.ts`
- **Status:** NEW
- **What's wrong:** Full CRUD service and API router exist for rooms, but there's no dedicated room management page in the web app. Rooms are only referenced indirectly in the add-appointment modal (as "Area" dropdown), but the `roomId` value is never actually sent to the appointment API.
- **What to do:** Create a rooms management page under settings. Also wire the `roomId` from the appointment modal through to the API.

### [LOW] `preferred_times` has service and API router but no frontend
- **File:** `packages/services/src/preferred-time.service.ts`
- **Status:** NEW
- **What's wrong:** Scheduling preferences for package instances have full backend support but no frontend UI for setting preferred times.
- **What to do:** Add preferred time selection to the package instance detail/setup flow.

### [LOW] `waitlist_entries` has service and API router but no frontend
- **File:** `packages/services/src/waitlist.service.ts`
- **Status:** NEW
- **What's wrong:** Waitlist for full class slots has backend support but no frontend UI for joining/viewing waitlists.
- **What to do:** Add waitlist UI to the class slot booking flow.

---

## Orphaned Fields

Columns defined in schema but never read, written, or referenced in any service, API, or frontend code.

### [HIGH] `appointments.isRecurring` -- never read or written
- **File:** `packages/db/src/schema/tenant/appointments.ts:40`
- **Status:** NEW
- **What's wrong:** Boolean field `isRecurring` is defined with a default of `false` but never referenced in any service, API, or frontend code. Part of the unimplemented recurring appointments feature.
- **What to do:** Implement recurring appointment support or remove this field and related fields.

### [HIGH] `appointments.recurringParentId` -- never read or written
- **File:** `packages/db/src/schema/tenant/appointments.ts:41`
- **Status:** NEW
- **What's wrong:** Self-referential FK for recurring series is defined but never used anywhere.
- **What to do:** Same as above -- implement or remove.

### [HIGH] `appointments.recurringFrequency` -- never read or written
- **File:** `packages/db/src/schema/tenant/appointments.ts:42`
- **Status:** NEW
- **What's wrong:** Recurring frequency field (daily/weekly/custom) never used.
- **What to do:** Same as above.

### [HIGH] `appointments.recurringEndDate` -- never read or written
- **File:** `packages/db/src/schema/tenant/appointments.ts:43`
- **Status:** NEW
- **What's wrong:** Recurring end date field never used.
- **What to do:** Same as above.

### [HIGH] `appointments.conflictResolved` -- never read or written
- **File:** `packages/db/src/schema/tenant/appointments.ts:46`
- **Status:** NEW
- **What's wrong:** Conflict resolution boolean is defined but never referenced in any service, API, or frontend. No conflict detection logic exists.
- **What to do:** Implement booking conflict detection and resolution, or remove these fields.

### [HIGH] `appointments.conflictReason` -- never read or written
- **File:** `packages/db/src/schema/tenant/appointments.ts:47`
- **Status:** NEW
- **What's wrong:** Conflict reason text field never used anywhere.
- **What to do:** Same as above.

### [HIGH] `appointments.roomId` -- written by frontend but never persisted
- **File:** `packages/db/src/schema/tenant/appointments.ts:92`
- **Status:** NEW
- **What's wrong:** The add-appointment modal collects `roomId` (labeled "Area") and validates it as required, but the value is never sent to the appointment API. The `CreateAppointmentParams` type in `appointment.service.ts` does not include `roomId`. The field exists in the schema but is always NULL.
- **What to do:** Add `roomId` to `CreateAppointmentParams` and the appointment API input schema. Pass the value from the frontend.

### [HIGH] `appointments.googleCalendarEventId` -- never read or written
- **File:** `packages/db/src/schema/tenant/appointments.ts:95`
- **Status:** NEW
- **What's wrong:** The Google Calendar sync service uses `google_calendar_event_mappings` table instead. This denormalized field on appointments is never used.
- **What to do:** Remove this field since the separate `google_calendar_event_mappings` table handles the relationship.

### [MEDIUM] `payments` -- all Stripe-specific columns are orphaned
- **File:** `packages/db/src/schema/tenant/payments.ts`
- **Status:** NEW
- **What's wrong:** The entire `payments` table is orphaned (see above), but specifically `stripePaymentIntentId`, `stripeChargeId`, `stripeCustomerId`, `platformFeeAmount`, `platformFeePercentage`, `franchiserAmount` are never referenced in any code. These represent critical Stripe integration that's entirely unimplemented.
- **What to do:** Implement as part of the payments service/router.

### [MEDIUM] `organizations.stripeConnectAccountId` and related fields -- unused
- **File:** `packages/db/src/schema/control-panel/organizations.ts:28-31`
- **Status:** NEW
- **What's wrong:** `stripeConnectAccountId`, `stripeConnectStatus`, `stripeConnectAccountType`, `stripeConnectOnboardingCompletedAt` are defined but never read or written in any service, API, or frontend code. Stripe Connect for franchisers is unimplemented.
- **What to do:** Implement Stripe Connect onboarding flow for franchisers, or defer and document as future work.

### [MEDIUM] `services.stripeProductId`, `stripePriceId`, `stripeSyncStatus`, `stripeLastSyncedAt` -- unused
- **File:** `packages/db/src/schema/tenant/services.ts:33-36`
- **Status:** NEW
- **What's wrong:** Four Stripe integration columns on the services table are never referenced in any service, API router, or frontend code. Services have local pricing but no Stripe product/price sync.
- **What to do:** Implement Stripe product sync or remove these columns if pricing is handled locally.

### [LOW] `notifications.icon` and `notifications.color` -- never referenced
- **File:** `packages/db/src/schema/tenant/notifications.ts:20-21`
- **Status:** NEW
- **What's wrong:** Visual customization fields for notifications (`icon`, `color`) are defined but never read in any API or frontend, and never written (since no `createNotification` exists).
- **What to do:** Include in notification creation once that's implemented, and render in the notification list UI.

### [LOW] `user_activity_log.creditsChange` and `user_activity_log.icon` -- never written
- **File:** `packages/db/src/schema/tenant/user-activity-log.ts:26-27`
- **Status:** NEW
- **What's wrong:** `creditsChange` (integer tracking credit deltas) and `icon` are defined but never written since no `createActivityLogEntry()` function exists.
- **What to do:** Include when implementing the activity log write path.

### [LOW] `customer_profiles.isDeleted`, `deletedAt`, `deletedSource` -- never used
- **File:** `packages/db/src/schema/tenant/customer-profiles.ts:45-47`
- **Status:** NEW
- **What's wrong:** Soft-delete fields for GHL sync integration are defined but never referenced in any service or API code. The `customer-profile.service.ts` does not implement soft deletion.
- **What to do:** Implement soft-delete in the customer profile service if needed for GHL sync, or remove these fields.

### [LOW] `user.lastLoginAt` -- only written by GHL service, never displayed
- **File:** `packages/db/src/schema/auth.ts:29`
- **Status:** NEW
- **What's wrong:** `lastLoginAt` is defined on the auth `user` table. It's written by `gohighlevel.service.ts` during contact sync but never displayed in any frontend or admin panel.
- **What to do:** Display last login time in user management or admin panel views.

---

## Write-Only Fields

Fields that are written by services but never read or displayed in any frontend or API response.

### [MEDIUM] `appointments.paymentStatus` -- written but never displayed
- **File:** `packages/db/src/schema/tenant/appointments.ts:50`
- **Status:** NEW
- **What's wrong:** The payment status field on appointments (`pending`, `paid`, `partial`, `refunded`) has a default value and is in the schema, but since `select *` returns it implicitly, it may appear in API responses. However, no frontend component references or displays it. The appointment card/detail views don't show payment status.
- **What to do:** Display payment status in the appointment detail view and use it for filtering.

### [MEDIUM] `appointments.stripePaymentIntentId` -- never used
- **File:** `packages/db/src/schema/tenant/appointments.ts:51`
- **Status:** NEW
- **What's wrong:** Stripe PaymentIntent ID for per-appointment payment tracking is never written or read. Since the `payments` table is also orphaned, there's no payment tracking at all.
- **What to do:** Implement as part of the Stripe payment integration.

### [LOW] `appointments.sessionTotal` -- written by service but not displayed in web
- **File:** `packages/db/src/schema/tenant/appointments.ts:36`
- **Status:** NEW
- **What's wrong:** `sessionTotal` (pre-tax revenue) is written during appointment creation but is not displayed in any web frontend appointment view. It is used in the native app.
- **What to do:** Display in the web appointment detail/calendar views for revenue tracking.

### [LOW] `appointments.pricePerClient` -- written by service but not displayed in web
- **File:** `packages/db/src/schema/tenant/appointments.ts:37`
- **Status:** NEW
- **What's wrong:** Similar to `sessionTotal`, this field is written but not rendered in web UI.
- **What to do:** Display in appointment detail views.

### [LOW] `services.priceUnit` -- written but never displayed in any frontend
- **File:** `packages/db/src/schema/tenant/services.ts:58`
- **Status:** NEW
- **What's wrong:** `priceUnit` ("session" | "class" | "package") is written via service and API but never rendered in any web or native frontend component.
- **What to do:** Display alongside price in service listings and detail views.

### [LOW] `appointments.bookingNumber` -- written but never displayed in web frontend
- **File:** `packages/db/src/schema/tenant/appointments.ts:62`
- **Status:** NEW
- **What's wrong:** `bookingNumber` is generated and used in the native app's booking flow but has zero references in the web frontend. Web users cannot see or search by booking number.
- **What to do:** Display booking number in the web appointment detail and calendar views.

---

## Read-Only Fields

Fields that are read in frontend/API but never written programmatically (relying solely on database defaults).

### [MEDIUM] `expenses.currency` -- defaults to "usd", never updated
- **File:** `packages/db/src/schema/tenant/expenses.ts:22`
- **Status:** KNOWN
- **What's wrong:** Currency defaults to `"usd"` at the schema level. The expense service and API never accept or write a currency value. Malaysian platform should use MYR.
- **What to do:** Change the default to `"myr"` and add currency to the expense creation/update params. (Tagged as KNOWN limitation: "Expenses currency defaults to usd")

### [MEDIUM] `payouts.currency` -- defaults to "usd", never updated
- **File:** `packages/db/src/schema/tenant/payouts.ts:38`
- **Status:** NEW
- **What's wrong:** Same issue as expenses -- currency hardcoded to USD default, never set programmatically. Malaysian platform should use MYR.
- **What to do:** Change default to `"myr"` and accept currency parameter in payout creation.
