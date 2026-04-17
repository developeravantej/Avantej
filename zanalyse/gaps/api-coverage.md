# API Coverage Audit

**Date:** 2026-04-16
**Branch:** Customer-app

## Summary

| Category | Count |
|----------|-------|
| Dead Procedures (no frontend usage) | 28 |
| Web-Only Procedures | 60 |
| Native-Only Procedures | 3 |
| Phantom Calls (non-existent procedures) | 1 |
| Installments `as any` Casts (known) | 6 |

---

## Phantom Calls (Frontend calling non-existent procedures)

### [CRITICAL] `orpc.packages.list` called from native app but router does not exist
- **File:** `apps/native/app/(app)/dashboard/buy-package/setup.tsx:135`
- **Status:** KNOWN
- **What's wrong:** Native app calls `orpc.packages.list` but there is no `packages` router registered in `appRouter` or `baseRouter`. Will cause a runtime error.
- **What to do:** Either create a `packages` router with a `list` procedure, or change the call to use an existing router (e.g., query services/serviceCategories for available packages).

### [HIGH] Installments view uses `(client as any)` to bypass missing type registration
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx:138,158,170,196,224,254`
- **Status:** KNOWN
- **What's wrong:** Six installment procedure calls (`adminOverview`, `listByPackageInstance`, `suggestRefund`, `confirmPayment`, `manualUnlock`, `processRefund`) all cast `client as any`. The `installments` router IS registered in `baseRouter` (line 103 of index.ts), so the procedures exist at runtime, but the type inference is broken.
- **What to do:** Investigate why `installmentsRouter` types are not propagating to the client. Likely a missing re-export or circular type issue. Remove `as any` casts once fixed.

---

## Dead Procedures (not called from ANY frontend)

### Hierarchy Router

### [LOW] `hierarchy.getNode` never called
- **File:** `packages/api/src/routers/hierarchy.ts`
- **Status:** NEW
- **What's wrong:** Procedure exists but no frontend code calls `client.hierarchy.getNode` or `orpc.hierarchy.getNode`.
- **What to do:** Keep for now; likely useful for future detail views. Document as intentional.

### [LOW] `hierarchy.getDescendants` never called
- **File:** `packages/api/src/routers/hierarchy.ts`
- **Status:** NEW
- **What's wrong:** Frontend uses `accessibleNodeIds` from context instead of calling this directly.
- **What to do:** Keep; used internally by RBAC. May be useful for admin tools.

### [LOW] `hierarchy.bulkReassignMembers` never called
- **File:** `packages/api/src/routers/hierarchy.ts`
- **Status:** NEW
- **What's wrong:** Only `reassignMember` (single) is used by the web app.
- **What to do:** Wire up in member-reassignment UI or remove if not needed.

### Members Router

### [LOW] `members.getById` never called
- **File:** `packages/api/src/routers/members.ts`
- **Status:** NEW
- **What's wrong:** No frontend fetches a single member by ID.
- **What to do:** Likely needed for future member detail page. Keep.

### [LOW] `members.remove` never called
- **File:** `packages/api/src/routers/members.ts`
- **Status:** NEW
- **What's wrong:** Web uses `deactivate` and `suspend` but never `remove` (hard delete).
- **What to do:** Intentional safety measure. Keep for admin emergency use.

### Invitations Router

### [LOW] `invitations.decline` never called
- **File:** `packages/api/src/routers/invitations.ts`
- **Status:** NEW
- **What's wrong:** Invitation accept flow exists but decline is not wired up.
- **What to do:** Add decline button to `accept-invitation.tsx` page.

### Appointments Router

### [MEDIUM] `appointments.listForUser` not called from web
- **File:** `packages/api/src/routers/appointments.ts`
- **Status:** NEW
- **What's wrong:** Used only from native app (5 call sites). Web uses `appointments.list` with staff filters instead.
- **What to do:** Intentional split -- web is for staff, native is for customers. No action needed.

### Class Slots Router

### [LOW] `classSlots.getById` never called
- **File:** `packages/api/src/routers/class-slots.ts`
- **Status:** NEW
- **What's wrong:** Class slots list view exists but no detail view fetches by ID.
- **What to do:** Keep for future detail/edit sheet.

### [LOW] `classSlots.bookingCounts` never called
- **File:** `packages/api/src/routers/class-slots.ts`
- **Status:** NEW
- **What's wrong:** Booking count data not displayed anywhere.
- **What to do:** Could enhance class slots list view to show booking counts per slot.

### Trainer Availability Router

### [LOW] `trainerAvailability.delete` never called
- **File:** `packages/api/src/routers/trainer-availability.ts`
- **Status:** NEW
- **What's wrong:** Upsert is used to replace all windows; individual delete not needed.
- **What to do:** May be useful for individual slot removal. Keep.

### Package Instances Router

### [LOW] `packageInstances.getById` never called
- **File:** `packages/api/src/routers/package-instances.ts`
- **Status:** NEW
- **What's wrong:** No detail view for individual package instances.
- **What to do:** Useful for future package instance detail page. Keep.

### [MEDIUM] `packageInstances.listForClient` not called from web
- **File:** `packages/api/src/routers/package-instances.ts`
- **Status:** NEW
- **What's wrong:** Only native calls this (for customer view). Web uses `listAll`.
- **What to do:** Intentional -- web is admin view. No action needed.

### [MEDIUM] `packageInstances.getActiveForClient` not called from web
- **File:** `packages/api/src/routers/package-instances.ts`
- **Status:** NEW
- **What's wrong:** Only native calls this (dashboard active package widget).
- **What to do:** Intentional -- customer-facing. No action needed.

### Preferred Times Router

### [MEDIUM] `preferredTimes.list` never called from web, only `upsert` from native
- **File:** `packages/api/src/routers/preferred-times.ts`
- **Status:** NEW
- **What's wrong:** `preferredTimes.list` is not called from any frontend. `preferredTimes.upsert` is called only from native.
- **What to do:** Web admin should have a way to view client preferred times. Consider adding to package instance detail or trainer views.

### Customer Profiles Router

### [MEDIUM] `customerProfiles.get` and `upsert` not called from native
- **File:** `packages/api/src/routers/customer-profiles.ts`
- **Status:** NEW
- **What's wrong:** Only web (`customers.tsx`) calls these. Native profile page uses `notificationPreferences` but not `customerProfiles`.
- **What to do:** Check if native profile page should show customer profile fields.

### Notification Preferences Router

### [LOW] `notificationPreferences.get` and `update` not called from web
- **File:** `packages/api/src/routers/notification-preferences.ts`
- **Status:** NEW
- **What's wrong:** Only native profile page uses these.
- **What to do:** Web admin may want to view/manage notification preferences. Low priority.

### Rooms Router

### [LOW] `rooms.getById`, `rooms.create`, `rooms.update`, `rooms.delete` never called
- **File:** `packages/api/src/routers/rooms.ts`
- **Status:** NEW
- **What's wrong:** Only `rooms.list` is called (from add-appointment-modal). No room management UI exists.
- **What to do:** Build a rooms management page or remove unused CRUD if not planned.

### Sales Orders Router

### [MEDIUM] `salesOrders.create`, `salesOrders.update`, `salesOrders.cancel` never called
- **File:** `packages/api/src/routers/sales-orders.ts`
- **Status:** NEW
- **What's wrong:** Only `list` and `getById` are called. No create/edit/cancel UI for sales orders.
- **What to do:** Sales are likely created through a different flow (POS/checkout). Verify whether these are needed or if the flow is incomplete.

### Invoices Router

### [MEDIUM] `invoices.create`, `invoices.update`, `invoices.getById` never called
- **File:** `packages/api/src/routers/invoices.ts`
- **Status:** NEW
- **What's wrong:** Only `invoices.list` is called (from sales detail and payment view). No invoice creation or editing UI.
- **What to do:** Invoices may be auto-generated server-side. If manual creation is intended, build the UI.

### Cancelled Sales Router

### [LOW] `cancelledSales.getById` never called
- **File:** `packages/api/src/routers/cancelled-sales.ts`
- **Status:** NEW
- **What's wrong:** List view exists but no detail view.
- **What to do:** Add detail sheet/drawer to cancelled sales view.

### Promotions Router

### [MEDIUM] `promotions.validate` and `promotions.apply` never called
- **File:** `packages/api/src/routers/promotions.ts`
- **Status:** NEW
- **What's wrong:** Promotion CRUD exists but the actual validation and application at checkout is not wired up.
- **What to do:** Wire up in the purchase/checkout flow (native buy-package or web POS).

### Tax Rates Router

### [LOW] `taxRates.getById` not called from web (only `getDefault` called from native)
- **File:** `packages/api/src/routers/tax-rates.ts`
- **Status:** NEW
- **What's wrong:** Web uses `list`, `create`, `update`, `setDefault`, `deactivate` but never `getById`. Native only uses `getDefault`.
- **What to do:** Keep; may be needed for detail/edit flows.

### Products Router

### [MEDIUM] `products.getStock` and `products.adjustStock` never called
- **File:** `packages/api/src/routers/products.ts`
- **Status:** NEW
- **What's wrong:** Inventory stock management UI is missing. Products can be created/updated but stock levels cannot be viewed or adjusted.
- **What to do:** Add stock column to products list and stock adjustment action.

### Walk-In Customers Router

### [LOW] `walkInCustomers.getById` never called
- **File:** `packages/api/src/routers/walk-in-customers.ts`
- **Status:** NEW
- **What's wrong:** List/create/update/deactivate are all used, but `getById` is not.
- **What to do:** Keep for detail view needs.

### Organization Settings Router

### [MEDIUM] `organizationSettings.get` and `upsert` never called from any frontend
- **File:** `packages/api/src/routers/organization-settings.ts`
- **Status:** NEW
- **What's wrong:** Settings router is registered but no settings page exists in web or native.
- **What to do:** Build an organization settings page or defer to next sprint.

### User Activity Log Router

### [LOW] `userActivityLog.list` never called from any frontend
- **File:** `packages/api/src/routers/user-activity-log.ts`
- **Status:** NEW
- **What's wrong:** Activity log API exists but no UI page consumes it.
- **What to do:** Build an activity log page in the admin section.

### Commission Splits Router

### [LOW] `commissionSplits.list`, `getByAppointment`, `getMyCommissions` never called
- **File:** `packages/api/src/routers/commission-splits.ts`
- **Status:** NEW
- **What's wrong:** Entire commission splits feature has no frontend consumers.
- **What to do:** Build commission splits UI (staff earnings view, appointment detail commission breakdown).

### Waitlist Router

### [LOW] `waitlist.list`, `add`, `remove`, `promote` never called
- **File:** `packages/api/src/routers/waitlist.ts`
- **Status:** NEW
- **What's wrong:** Entire waitlist feature has no frontend consumers.
- **What to do:** Wire up in class slots detail or booking flow.

### Admin Router

### [LOW] All 8 admin procedures never called from any frontend
- **File:** `apps/server/src/routers/admin.ts`
- **Status:** NEW
- **What's wrong:** `listTenants`, `getTenant`, `suspendTenant`, `unsuspendTenant`, `startImpersonation`, `exitImpersonation`, `getAuditLogs`, `getStats` are all unused.
- **What to do:** Admin panel is likely a separate app or not yet built. These are platform-admin features.

### Registration Router

### [LOW] `registration.listCountries`, `listBranches`, `complete` not called from web
- **File:** `packages/api/src/routers/registration.ts`
- **Status:** NEW
- **What's wrong:** Only native app uses registration procedures.
- **What to do:** Intentional -- registration is a mobile-first flow. No action needed.

---

## Web-Only Procedures (called from web but NOT native)

These are expected for admin/staff features. Flagging only customer-facing ones:

| Router | Procedure | Customer-Facing? | Notes |
|--------|-----------|-------------------|-------|
| `hierarchy.*` | All 10 used procedures | No | Admin-only |
| `members.create` | No | Staff management |
| `members.updateRole` | No | Admin |
| `members.suspend/reactivate/deactivate` | No | Admin |
| `roles.*` | All CRUD | No | Admin |
| `permissions.list` | No | Admin |
| `rolePermissions.*` | All | No | Admin |
| `invitations.*` | All used | No | Admin |
| `services.*` | All CRUD | No | Admin |
| `serviceCategories.*` | All CRUD | No | Admin |
| `serviceCategoryConfig.*` | Both | No | Admin |
| `serviceMembers.listMine/updateMyBuffer` | No | Staff self-service |
| `serviceMembers.listForMember/updateBuffer` | No | Admin |
| `appointments.list/create/update` | No | Staff calendar |
| `classSlots.list/create/update/cancel` | No | Admin |
| `trainerAvailability.list/upsert` | No | Admin |
| `analytics.getDashboardKpis/getStaffPerformance` | No | Admin |
| `googleCalendar.status/disconnect` | No | Admin |
| `salesOrders.list/getById` | No | Admin |
| `invoices.list` | No | Admin |
| `cancelledSales.list` | No | Admin |
| `payouts.list` | No | Admin |
| `promotions.list/create/update/deactivate` | No | Admin |
| `taxRates.list/create/update/setDefault/deactivate` | No | Admin |
| `purchaseOrders.*` | All used | No | Admin |
| `expenses.*` | All used | No | Admin |
| `announcements.*` | All used | No | Admin |
| `walkInCustomers.*` | All used | No | Admin |
| `notifications.list/markRead/markAllRead` | No | Staff |
| `brands.*` | All CRUD | No | Admin |
| `productCategories.*` | All CRUD | No | Admin |
| `suppliers.*` | All used | No | Admin |
| `unitsOfMeasure.*` | All CRUD | No | Admin |
| `products.list/create/update` | No | Admin |
| `stockRequests.*` | All used | No | Admin |
| `transferOrders.*` | All used | No | Admin |
| `memberProfiles.get/upsert` | No | Admin |
| `packageInstances.listAll/create` | No | Admin |
| `customerProfiles.get/upsert` | Partially | Used on web customers page |

No customer-facing web-only procedures were found that should also be in native.

---

## Native-Only Procedures (called from native but NOT web)

### [INFO] `registration.listCountries`, `registration.listBranches`, `registration.complete`
- **File:** `apps/native/components/registration-form.tsx`
- **Status:** NEW
- **What's wrong:** Not wrong -- registration is mobile-only by design.
- **What to do:** No action needed.

### [INFO] `notificationPreferences.get` and `notificationPreferences.update`
- **File:** `apps/native/app/(app)/dashboard/profile.tsx`
- **Status:** NEW
- **What's wrong:** Web has no notification preferences UI. Could be useful for web users too.
- **What to do:** Consider adding notification preferences to web settings page.

### [INFO] `preferredTimes.upsert`
- **File:** `apps/native/app/(app)/dashboard/buy-package/pay.tsx`
- **Status:** NEW
- **What's wrong:** Preferred booking times set during package purchase on native. No web equivalent.
- **What to do:** Consider adding preferred times to admin package instance view.

---

## Installments `as any` Casts (Known Limitation)

### [HIGH] All installment API calls bypass type safety
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx`
- **Status:** KNOWN
- **What's wrong:** Six calls use `(client as any).installments.*` -- `adminOverview` (L138), `listByPackageInstance` (L158), `suggestRefund` (L170), `confirmPayment` (L196), `manualUnlock` (L224), `processRefund` (L254). The router IS registered but types are not reaching the client.
- **What to do:** Debug type inference chain for `installmentsRouter`. Ensure `installments` types propagate through `AppRouter` to client.

---

## Observations

1. **28 dead procedures** is normal for a feature-building phase -- many are CRUD `getById` endpoints awaiting detail views, or features (waitlist, commission splits, admin panel) with backend done but frontend pending.

2. **Highest-priority gaps:**
   - `packages.list` phantom call (CRITICAL, runtime error on native)
   - `installments` type casting (HIGH, no compile-time safety)
   - `promotions.validate/apply` not wired up (MEDIUM, promotions CRUD exists but checkout integration missing)
   - `products.getStock/adjustStock` not wired up (MEDIUM, inventory management incomplete)
   - `salesOrders.create/update/cancel` not wired up (MEDIUM, POS/checkout flow incomplete)
   - `organizationSettings` completely unused (MEDIUM, settings page missing)

3. **No rogue phantom calls found** beyond the known `packages.list`. The comments in `onboarding.tsx` referencing `client.organizations.*` are just TODO comments, not actual calls.
