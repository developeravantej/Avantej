# RBAC Audit

**Date:** 2026-04-16
**Branch:** Customer-app
**Auditor:** Agent 4 (automated)

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| BUG | 3 |
| GAP | 10 |
| INFO | 2 |
| KNOWN | 1 |
| **Total** | **17** |

---

## Unguarded Mutations

### [CRITICAL] customerProfiles.upsert accepts creditPoints from any authenticated user
- **File:** `packages/api/src/routers/customer-profiles.ts:50`
- **Status:** NEW
- **What's wrong:** The `upsert` procedure accepts `creditPoints` in the input schema and writes it directly to the database. Any authenticated user can call this API directly (e.g. via curl) and set their own credit balance to any non-negative integer. The procedure has no role check or permission gate beyond session auth. Neither the web nor native app UI currently passes `creditPoints`, but the API endpoint is exploitable.
- **What to do:** Remove `creditPoints` from the client-facing input schema. Create a separate admin-only procedure (with `requirePermission`) for adjusting customer credits.

### [BUG] trainerAvailability.list has no permission check
- **File:** `packages/api/src/routers/trainer-availability.ts:22-36`
- **Status:** NEW
- **What's wrong:** The `list` procedure requires only a valid session and an `organizationId`/`trainerId`. Any authenticated member (including clients) can view any trainer's full weekly availability schedule by supplying any trainerId. The `upsert` and `delete` procedures correctly require `appointment_management:update`, but `list` does not.
- **What to do:** Add a permission check: allow the trainer themselves (self-service), staff with `appointment_management:read`, or clients who need it for booking flows. If intentionally public for booking, document that decision with a code comment.

### [BUG] organizationSettings.get has no role or permission check
- **File:** `packages/api/src/routers/organization-settings.ts:14-21`
- **Status:** NEW
- **What's wrong:** The `get` procedure returns any organization setting key-value pair to any authenticated member (the code comment says "Get is available to all authenticated members"). The `upsert` correctly requires `member.role === "admin"`. If settings contain only non-sensitive data (business hours, timezone), this is a design choice. If they could contain API keys or internal config, this is a data leak.
- **What to do:** Audit what setting keys are stored. If any are sensitive, add a permission check or split into public/private setting categories. If all are non-sensitive, add a code comment confirming this is intentional.

---

## Unguarded Reads (Missing accessibleNodeIds Filtering)

These routers check `requirePermission` but do not filter list results by `accessibleNodeIds`. A staff member with the required permission scoped to one branch can see data from all branches.

### [GAP] payouts.list -- no branch scoping
- **File:** `packages/api/src/routers/payouts.ts`
- **Status:** NEW
- **What's wrong:** Checks `requirePermission("financial_management:read")` but returns all payouts across the organization regardless of the caller's hierarchy scope.
- **What to do:** Add `accessibleNodeIds` filtering to the query.

### [GAP] commissionSplits.list / getByAppointment -- no branch scoping
- **File:** `packages/api/src/routers/commission-splits.ts`
- **Status:** NEW
- **What's wrong:** All three procedures check `requirePermission` but do not filter by `accessibleNodeIds`. Staff can see commission splits for appointments in branches outside their scope.
- **What to do:** Join with appointments or members table to filter by accessible branch nodes.

### [GAP] salesOrders.list -- no branch scoping
- **File:** `packages/api/src/routers/sales-orders.ts`
- **Status:** NEW
- **What's wrong:** Permission checked, but list query does not filter by caller's `accessibleNodeIds`.
- **What to do:** Add branch-scoped filtering.

### [GAP] invoices.list -- no branch scoping
- **File:** `packages/api/src/routers/invoices.ts`
- **Status:** NEW
- **What's wrong:** Permission checked, but results not scoped to `accessibleNodeIds`.
- **What to do:** Add branch-scoped filtering.

### [GAP] cancelledSales.list -- no branch scoping
- **File:** `packages/api/src/routers/cancelled-sales.ts`
- **Status:** NEW
- **What's wrong:** Permission checked, but results not scoped to `accessibleNodeIds`.
- **What to do:** Add branch-scoped filtering.

### [GAP] stockRequests / transferOrders / purchaseOrders list -- no branch scoping
- **File:** `packages/api/src/routers/stock-requests.ts`, `transfer-orders.ts`, `purchase-orders.ts`
- **Status:** NEW
- **What's wrong:** All three routers check permissions but do not scope list results by `accessibleNodeIds`. Staff at Branch A can see inventory data from Branch B.
- **What to do:** Add branch-scoped filtering to all list procedures.

### [GAP] products / brands / suppliers list -- no branch scoping (may be intentional)
- **File:** `packages/api/src/routers/products.ts`, `brands.ts`, `suppliers.ts`
- **Status:** NEW
- **What's wrong:** These may be intentionally org-wide resources (not branch-scoped by nature), but the lack of hierarchy filtering is undocumented. Inconsistent with how appointments/expenses/hierarchy handle scoping.
- **What to do:** Confirm whether these should be org-wide or branch-scoped. Document the decision with code comments.

---

## Unguarded Pages (Missing beforeLoad Guards)

28 out of 39 dashboard pages have no `beforeLoad` route guard. The `_authenticated` parent route ensures a valid session, but does not enforce RBAC. Any authenticated user (including clients) can navigate to these pages.

**Note:** The `route-guards.ts` file is fully implemented (not a stub as previously documented in MEMORY.md). The issue is that most pages don't use the guards.

### [GAP] 25 admin/staff pages accessible to all authenticated users
- **Status:** NEW
- **What's wrong:** These pages have no `beforeLoad` guard. Server-side API checks prevent mutation execution, but the pages are accessible and may show error states or partial data to unauthorized users. This is a UX issue and defense-in-depth gap, not a direct security vulnerability since the API layer is protected.
- **What to do:** Add `beforeLoad` guards to each page. Recommended guards:

| Page | File | Recommended Guard |
|------|------|-------------------|
| Tax Rates | `settings/tax-rates.tsx` | `tax_configuration:read` |
| Expenses | `expenses/view.tsx` | `expense_management:read` |
| Promotions | `promotions/view.tsx` | `promotion_management:read` |
| Announcements | `announcements/view.tsx` | `announcement_management:read` |
| Branch View | `branch/view.tsx` | `hierarchy_management:read` |
| Brands | `brands/view.tsx` | `inventory_management:read` |
| Cancelled Sales | `cancelled-sales/view.tsx` | `sales_management:read` |
| Categories | `categories/view.tsx` | `inventory_management:read` |
| Google Calendar | `settings/google-calendar.tsx` | Member check (self-service) |
| Inventory Options | `inventory-options.tsx` | `inventory_management:read` |
| Payment | `payment/view.tsx` | `financial_management:read` |
| Payouts | `payouts/view.tsx` | `financial_management:read` |
| Products | `products/view.tsx` | `inventory_management:read` |
| Purchase Orders | `purchase-orders/view.tsx` | `purchase_order_management:read` |
| Role | `role/view.tsx` | `role_management:read` |
| Sales (list) | `sales/view.tsx` | `sales_management:read` |
| Sales (detail) | `sales/$id.tsx` | `sales_management:read` |
| Service | `service/view.tsx` | `service_management:read` |
| Service Category | `service-category/view.tsx` | `service_management:read` |
| Stock Requests | `stock-requests/view.tsx` | `inventory_management:read` |
| Suppliers | `suppliers/view.tsx` | `inventory_management:read` |
| Transfer Orders | `transfer-orders/view.tsx` | `inventory_management:read` |
| UoM | `uom/view.tsx` | `inventory_management:read` |
| UoM Conversions | `uom-conversions/view.tsx` | `inventory_management:read` |
| User | `user/view.tsx` | `user_management:read` |

Pages that do NOT need guards (correctly unguarded):
- `index.tsx` -- dashboard home, appropriate for all roles
- `notifications/view.tsx` -- user-scoped data
- `my-services/view.tsx` -- self-service, scoped to current member

---

## Known Issues (Confirmed)

### [KNOWN] classSlots.list requires class_slot_management permission -- customers cannot book classes
- **File:** `packages/api/src/routers/class-slots.ts:35-54`
- **Status:** KNOWN (documented in issue tracker)
- **What's wrong:** The `list` procedure requires `class_slot_management:read` permission. Customers trying to browse available classes for booking are blocked.
- **What to do:** Allow authenticated clients to read class slots (at least for their branch). Add a bypass for client role on the `list` procedure, or create a separate `listAvailable` procedure without permission requirements.

---

## Informational

### [INFO] route-guards.ts is fully implemented (not a stub)
- **File:** `apps/web/src/lib/route-guards.ts`
- **Status:** INFO
- **What's wrong:** Project memory (MEMORY.md) states "`requirePermission` in route-guards.ts is a STUB". This is incorrect -- the file contains full implementations of `requirePermission`, `requireAnyPermission`, `requireRole`, and `requireSystemAdmin` that read from TanStack Query cache and redirect unauthorized users. The guards work correctly; they are simply not applied on 28 of 39 pages.
- **What to do:** Update MEMORY.md to correct this documentation.

### [INFO] Notification and user-scoped routers are correctly scoped
- **File:** `packages/api/src/routers/notifications.ts`, `notification-preferences.ts`, `user-activity-log.ts`, `customer-profiles.ts` (except creditPoints)
- **Status:** INFO
- **What's wrong:** Nothing. These routers correctly scope all operations to `context.session.user.id`. No cross-user access is possible. Good pattern to replicate.
- **What to do:** No action needed.
