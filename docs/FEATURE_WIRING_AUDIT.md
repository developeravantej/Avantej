# Feature Wiring Audit

**Date**: 2026-04-13  
**Scope**: All tenant schema tables — whether stored data is consumed by business logic

---

## Fully Wired

### Purchase Orders
- Create, approve, receive (with stock updates), cancel
- Full status transition enforcement in service layer
- **Files**: `packages/services/src/purchase-orders.service.ts`, `packages/api/src/routers/purchase-orders.ts`

### Expenses
- Create, approve, reject, mark paid
- Full approval workflow with status guards
- **Files**: `packages/services/src/expenses.service.ts`, `packages/api/src/routers/expenses.ts`

### Promotions
- Validate promo code, apply promotion, track usage via `promotion_usages`
- Note: not auto-called during sales order creation — frontend must explicitly call validate + apply
- **Files**: `packages/services/src/promotions.service.ts`, `packages/api/src/routers/promotions.ts`

### Buffer Time (service_category_config.bufferTimeMinutes)
- Resolution cascade: staff override > category default > 0
- Consumed during appointment booking to check for conflicts
- **Files**: `packages/services/src/buffer-time.service.ts`

---

## Partially Wired

### Trainer Availability
- **What works**: CRUD with overlap validation, time range checks, delete-and-reinsert upsert
- **What's missing**: Not enforced during appointment booking. A trainer can be booked outside their defined availability windows.
- **Files**: `packages/services/src/trainer-availability.service.ts`, `packages/api/src/routers/trainer-availability.ts`

### Waitlist
- **What works**: Add to waitlist, remove, manual promote (updates class slot capacity)
- **What's missing**: No automatic promotion. When someone cancels a booking, the next waitlisted member is not auto-promoted. Requires explicit API call.
- **Files**: `packages/services/src/waitlist.service.ts`, `packages/api/src/routers/waitlist.ts`

### Class Slots
- **What works**: Create, list, update, cancel slots. Capacity fields (`spotsBooked`, `spotsAvailable`) exist.
- **What's missing**: No booking table or service. There's no way to actually book a member into a slot — no `class_slot_bookings` entity, no increment of `spotsBooked`, no decrement of `spotsAvailable`.
- **Files**: `packages/services/src/class-slots.service.ts`, `packages/api/src/routers/class-slots.ts`

---

## CRUD Only (stored + displayed, no business logic consumes it)

### Commission Splits
- **What's stored**: `commission_splits` table with `staffId`, `appointmentId`, `calculatedAmount`
- **What exists**: Read-only queries — `listCommissionSplits`, `getCommissionsByAppointment`, `getMyCommissions`
- **What's missing**: Nothing writes to this table. No calculation engine exists. The `service_category_config` fields (`staffPoolPercentage`, `staffWeightage`, `paymentStructures`, `incentiveType`, `isConditional`, `threshold`, `maxStaff`) are saved via form but never consumed to generate splits.
- **Files**: `packages/services/src/commission-splits.service.ts` (read only)

### Tax Rates
- **What's stored**: Tax rates with `rate` (basis points), `isDefault`, `isActive`
- **What exists**: `listTaxRates`, `getDefaultTaxRate` service functions
- **What's missing**: Never consumed during sales order creation. `salesOrders.taxAmount` is never populated from tax rates. No `calculateTax(orderAmount, taxRateId)` function.
- **Files**: `packages/services/src/tax-rates.service.ts`

### Walk-in Customers
- **What's stored**: Unregistered customer profiles (name, phone, email)
- **What exists**: Create + list
- **What's missing**: Not integrated into sales order flow. `salesOrders.customerType` supports `"walk_in"` but nothing connects a walk-in customer to a transaction.
- **Files**: `packages/services/src/walk-in-customers.service.ts`

### Announcements
- **What's stored**: Title, message, target audience, priority, valid date range
- **What exists**: Create, `listActiveAnnouncements` (filtered by date)
- **What's missing**: No push notification delivery. No role-based visibility enforcement in downstream APIs. Creating an announcement doesn't notify anyone.
- **Files**: `packages/services/src/announcements.service.ts`

### Notifications
- **What's stored**: Type, title, message, related entity references, read status
- **What exists**: `listNotifications`, `getUnreadCount`, `markNotificationRead`, `markAllNotificationsRead`
- **What's missing**: **Nothing writes to this table.** No business event generates a notification — not appointment confirmation, not expense approval, not announcement creation, nothing.
- **Files**: `packages/services/src/notifications.service.ts` (read only)

---

## Not Implemented (schema exists, zero code)

### Dashboard Snapshots
- **What's stored**: `total_sales`, `sales_order_count`, `total_appointments`, `completed_appointments`, `active_members_count`, `period`, `snapshot_date`
- **What exists**: Table schema only
- **What's missing**: No router, no service, no cron job, no background task. Table is never written to. Completely dead.

### Stripe Sync (services table)
- **Fields**: `stripeProductId`, `stripePriceId`, `stripeSyncStatus`, `stripeLastSyncedAt`
- **What exists**: Schema fields only
- **What's missing**: No Stripe API integration. No function creates Stripe Products/Prices when services are created. No webhook handler. No sync job. Fields are always `null` / `"pending"`.

### Partner Stripe Accounts (Stripe Connect)
- **What's stored**: `partnerId`, `stripeAccountId`, `onboardingUrl`, `isOnboardingComplete`
- **What exists**: Table schema only
- **What's missing**: No Connect onboarding flow. No OAuth callback handler. No webhook for account updates. No payout verification. Table is completely disconnected from any workflow.

---

## Summary Table

| Area | Status | Impact |
|---|---|---|
| Purchase Orders | Fully wired | - |
| Expenses | Fully wired | - |
| Promotions | Fully wired | - |
| Buffer Time | Fully wired | - |
| Trainer Availability | Partially wired | Can book outside availability |
| Waitlist | Partially wired | No auto-promote on cancel |
| Class Slots | Partially wired | Can't book into slots |
| Commission Splits | CRUD only | Incentive config does nothing |
| Tax Rates | CRUD only | Orders have no tax |
| Walk-in Customers | CRUD only | Can't sell to walk-ins |
| Announcements | CRUD only | No delivery mechanism |
| Notifications | CRUD only | Nothing generates them |
| Dashboard Snapshots | Not implemented | Dead table |
| Stripe Sync | Not implemented | Fields always null |
| Partner Stripe Connect | Not implemented | Dead table |

## Priority Recommendations

1. **Commission calculation** — the incentive config form is complex and fully built, but produces no output
2. **Tax on orders** — tax rates exist but orders never compute tax amounts
3. **Notifications** — read infrastructure is done, just needs a `createNotification` function called from business events
4. **Trainer availability enforcement** — data is there, just needs a check in appointment creation
5. **Class slot bookings** — slots exist but the booking entity/flow is missing
6. **Dashboard snapshots** — needs a periodic job to aggregate metrics
7. **Stripe integration** — requires Stripe SDK setup, product sync, and Connect onboarding
