# API Routers Overview

**Last updated:** 2026-04-20 (Pipeline Audit B/C/D)

All procedures use **oRPC**. POST to `/rpc/{router}/{procedure}` with body `{"json": {input}}`.

Two procedure types exist:
- `public` — no session required
- `protected` — valid Better-Auth session cookie required; throws `UNAUTHORIZED` otherwise

The router is defined in two layers:
- **Shared (`packages/api/src/routers/`)** — all domain routers
- **Server-only (`apps/server/src/routers/`)** — auth, admin, invitation email (require server-only deps like Resend)

---

## Root Procedures (`packages/api/src/routers/index.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `healthCheck` | public | Returns `"OK"` — liveness probe |
| `privateData` | protected | Returns session user info — dev smoke test |

---

## Auth (`apps/server/src/routers/auth.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `auth.login` | public | Sign in with email/password. Calls Better-Auth sign-in, copies Set-Cookie to response. Returns user info + organizations list. |
| `auth.userContext` | protected | Returns full user context: user fields, all orgs with hierarchy nodes + member record + flat permissions array. Used by web on load. Role-to-permission lookup uses case-insensitive matching (`LOWER(roles.name) = LOWER(member.role)`); warns on missing role or empty permissions for admin roles. |
| `auth.verifyEmail` | public | Verify email address using a token from the verification link. |

---

## Hierarchy (`packages/api/src/routers/hierarchy.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `hierarchy.createNode` | protected | Create a new hierarchy node (org/region/district/area/branch). |
| `hierarchy.listNodes` | protected | List all hierarchy nodes for the org. Filtered by `accessibleNodeIds` for staff. |
| `hierarchy.updateNode` | protected | Update name, address, or picUserId of a node. Enforces unique branch names. |
| `hierarchy.getNode` | protected | Get a single node by ID. |
| `hierarchy.getDescendants` | protected | Get all descendant node IDs of a given node (recursive CTE). |
| `hierarchy.deleteNode` | protected | Hard-delete a node; auto-deletes children and reassigns members to parent. |
| `hierarchy.moveNode` | protected | Move a node to a new parent; validates type compatibility and circular refs. |
| `hierarchy.listMembers` | protected | List members scoped to a specific node. |
| `hierarchy.reassignMember` | protected | Reassign a single member to a different node. |
| `hierarchy.bulkReassignMembers` | protected | Bulk reassign members to a node. |
| `hierarchy.listAllMembers` | protected | List all members across accessible nodes. |

---

## Members (`packages/api/src/routers/members.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `members.list` | protected | List members. |
| `members.create` | protected | Create a new member record. |
| `members.getById` | protected | Get member by ID. |
| `members.updateRole` | protected | Update a member's role. |
| `members.suspend` | protected | Suspend a member (blocks login for tenant). |
| `members.reactivate` | protected | Reactivate a suspended member. |
| `members.remove` | protected | Remove a member from the org. |
| `members.deactivate` | protected | Soft-deactivate a member. |

---

## Invitations (`packages/api/src/routers/invitations.ts` + `apps/server/src/routers/invitations.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `invitations.create` | protected | Create an invitation. |
| `invitations.accept` | public | Accept an invitation by token (new user flow). |
| `invitations.verifyEmailByToken` | public | Verify invitation email token without session. |
| `invitations.decline` | public | Decline an invitation. |
| `invitations.getByToken` | public | Look up invitation details by token (for registration UI). |
| `invitations.list` | protected | List pending invitations for an org. |
| `invitations.revoke` | protected | Revoke a pending invitation. |
| `invitations.resend` | protected | Resend invitation email. |
| `invitations.sendEmail` | protected | (Server-only) Send invitation email via Resend. |

---

## Services (`packages/api/src/routers/services.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `services.list` | protected | List services with optional filters. |
| `services.getById` | protected | Get service by ID. |
| `services.create` | protected | Create a new service. Accepts `commissionPercentage` (integer basis points, e.g. 500 = 5%); default 0. |
| `services.update` | protected | Update a service. Accepts `commissionPercentage`; used by appointment and POS commission triggers. |

---

## Service Categories (`packages/api/src/routers/service-categories.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `serviceCategories.list` | protected | List service categories. |
| `serviceCategories.getById` | protected | Get category by ID. |
| `serviceCategories.create` | protected | Create a service category. |
| `serviceCategories.update` | protected | Update a service category. |

---

## Service Category Config (`packages/api/src/routers/service-category-config.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `serviceCategoryConfig.upsert` | protected | Create or update config for a service category. |
| `serviceCategoryConfig.getByCategoryId` | protected | Get config for a specific category. |

---

## Service Members (`packages/api/src/routers/service-members.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `serviceMembers.listMine` | protected | List services assigned to the current member. |
| `serviceMembers.updateMyBuffer` | protected | Update buffer time for own service assignment. |
| `serviceMembers.listForMember` | protected | List services for a specific member. |
| `serviceMembers.updateBuffer` | protected | Update buffer time for a member's service assignment. |

---

## Appointments (`packages/api/src/routers/appointments.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `appointments.list` | protected | List appointments with filters (date range, status, member, etc.). RBAC filter uses SQL `inArray(branchId, accessibleNodeIds)` (not JS post-filter). Response enriched with `serviceName`, `trainerName`, `clientName` via 3 parallel batch joins. Falls back to truncated UUID if record not found. |
| `appointments.listForUser` | protected | List appointments for the currently authenticated user/customer. |
| `appointments.getById` | protected | Get appointment by ID. |
| `appointments.create` | protected | Create an appointment. |
| `appointments.update` | protected | Update an appointment. Enforces status machine transitions (`assertValidTransition`); restores package credits on cancellation (FOR UPDATE); creates commission splits on completion (non-fatal). |

---

## Class Slots (`packages/api/src/routers/class-slots.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `classSlots.list` | protected | List class slots with filters. |
| `classSlots.getById` | protected | Get class slot by ID. |
| `classSlots.create` | protected | Create a class slot. |
| `classSlots.update` | protected | Update a class slot. |
| `classSlots.cancel` | protected | Cancel a class slot. |
| `classSlots.bookingCounts` | protected | Get booking counts for class slots. |

---

## Trainer Availability (`packages/api/src/routers/trainer-availability.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `trainerAvailability.list` | protected | List availability windows for a trainer. |
| `trainerAvailability.upsert` | protected | Create or replace trainer availability windows. |
| `trainerAvailability.delete` | protected | Delete a trainer's availability window. |

---

## Package Instances (`packages/api/src/routers/package-instances.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `packageInstances.listForClient` | protected | List package instances for a specific client. |
| `packageInstances.getActiveForClient` | protected | Get the active package instance for the current user/client. |
| `packageInstances.getById` | protected | Get package instance by ID. |
| `packageInstances.create` | protected | Create a package instance. Accepts `walkInCustomerId` XOR `clientId` (walk-in customer support; migration 0027). If `paymentPlanType` resolves to a plan with `pricePremiumBps > 0`, scales `totalPrice` by `(10000 + bps) / 10000`; installment schedule splits the scaled total when `numInstallments > 1`. |
| `packageInstances.listAll` | protected | List all package instances for the org. |

---

## Installments (`packages/api/src/routers/installments.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `installments.confirmPayment` | protected | Confirm an installment payment. |
| `installments.listByPackageInstance` | protected | List installments for a package instance. |
| `installments.manualUnlock` | protected | Admin: manually unlock an installment. |
| `installments.processRefund` | protected | Process a refund for an installment. |
| `installments.adminOverview` | protected | Get installments overview for admin dashboard. Accepts filters: `status`, `search` (clientId prefix OR exact purchaseNumber), `dueBefore` / `dueAfter` (ISO datetime), `paymentPlanCode`. |
| `installments.getEvents` | protected | Get installment event history. |
| `installments.suggestRefund` | protected | Calculate suggested refund amount for a package instance. |

---

## Installment Plans (`packages/api/src/routers/installment-plans.ts`)

Tenant-configurable installment plan definitions. Replaces the hardcoded `full | half | quarterly` enum.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `installmentPlans.list` | protected | List plans for the tenant. `activeOnly?: boolean` filters by `isActive = true`. Ordered by `sortOrder` asc, then `code`. |
| `installmentPlans.getById` | protected | Get a plan by UUID. |
| `installmentPlans.getByCode` | protected | Get a plan by its `code` (used by native app for code→numInstallments resolution). Returns `null` if not found. |
| `installmentPlans.create` | protected | Create a plan. Rejects `numInstallments < 1`, `pricePremiumBps` outside `[0, 10000]`, or duplicate `code` (BAD_REQUEST). `isDefault=true` clears other defaults in a single transaction. |
| `installmentPlans.update` | protected | Update `name / numInstallments / defaultIntervalDays / pricePremiumBps / description / isActive / sortOrder`. `code` is immutable — attempts are silently ignored. `pricePremiumBps` same range check as create. |
| `installmentPlans.setDefault` | protected | Mark a plan as default; clears other defaults in a single transaction. |
| `installmentPlans.deactivate` | protected | Set `isActive = false`. Silently clears `isDefault` if it was set. Referenced by `services.availablePaymentPlans` arrays and historical `package_instances.paymentPlanType` — both render by raw-code fallback for orphan codes. |

All procedures use `service_management` as the permission resource (list/getById/getByCode → read; create/update/setDefault → update; deactivate → delete).

---

## Preferred Times (`packages/api/src/routers/preferred-times.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `preferredTimes.list` | protected | List preferred booking times for a member/client. |
| `preferredTimes.upsert` | protected | Create or replace preferred times. |

---

## Customer Profiles (`packages/api/src/routers/customer-profiles.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `customerProfiles.get` | protected | Get the current user's customer profile. |
| `customerProfiles.upsert` | protected | Create or update the current user's customer profile. |

---

## Member Profiles (`packages/api/src/routers/member-profiles.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `memberProfiles.get` | protected | Get a member's profile (bio, specialization, imageUrl, etc.). |
| `memberProfiles.upsert` | protected | Create or update a member's profile. |

---

## Roles (`packages/api/src/routers/roles.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `roles.list` | protected | List all roles for the org. |
| `roles.create` | protected | Create a custom role. |
| `roles.update` | protected | Update a role's name/description. |
| `roles.delete` | protected | Delete a role. |

---

## Permissions (`packages/api/src/routers/permissions.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `permissions.list` | protected | List all available permissions (resource:action pairs). |

---

## Role Permissions (`packages/api/src/routers/role-permissions.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `rolePermissions.list` | protected | List permissions assigned to a role. |
| `rolePermissions.add` | protected | Assign a permission to a role. |
| `rolePermissions.remove` | protected | Remove a permission from a role. |

---

## Notifications (`packages/api/src/routers/notifications.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `notifications.list` | protected | List notifications for the current user. |
| `notifications.getUnreadCount` | protected | Get count of unread notifications. |
| `notifications.markRead` | protected | Mark specific notification(s) as read. |
| `notifications.markAllRead` | protected | Mark all notifications as read. |

---

## Notification Preferences (`packages/api/src/routers/notification-preferences.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `notificationPreferences.get` | protected | Get notification preferences for current user. |
| `notificationPreferences.update` | protected | Update notification preferences. |

---

## User Activity Log (`packages/api/src/routers/user-activity-log.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `userActivityLog.list` | protected | List activity log entries. |

---

## Sales Orders (`packages/api/src/routers/sales-orders.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `salesOrders.list` | protected | List sales orders with filters. |
| `salesOrders.getById` | protected | Get a sales order by ID. |
| `salesOrders.create` | protected | Create a sales order. |
| `salesOrders.update` | protected | Update a sales order. |
| `salesOrders.cancel` | protected | Cancel a sales order. |

---

## Invoices (`packages/api/src/routers/invoices.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `invoices.list` | protected | List invoices. |
| `invoices.getById` | protected | Get invoice by ID. |
| `invoices.create` | protected | Create an invoice. |
| `invoices.update` | protected | Update an invoice. |

---

## Cancelled Sales (`packages/api/src/routers/cancelled-sales.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `cancelledSales.list` | protected | List cancelled sale records. |
| `cancelledSales.getById` | protected | Get a cancelled sale by ID. |

---

## Payouts (`packages/api/src/routers/payouts.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `payouts.list` | protected | List payout records. |

---

## Promotions (`packages/api/src/routers/promotions.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `promotions.list` | protected | List promotions with filters. |
| `promotions.validate` | protected | Validate a promo code for a given customer/order amount. |
| `promotions.apply` | protected | Apply a promotion to an order. |
| `promotions.create` | protected | Create a promotion. |
| `promotions.update` | protected | Update promotion metadata (name/description/isActive/dates). |
| `promotions.deactivate` | protected | Deactivate a promotion. |

---

## Tax Rates (`packages/api/src/routers/tax-rates.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `taxRates.list` | protected | List tax rates. |
| `taxRates.getById` | protected | Get a tax rate by ID. |
| `taxRates.getDefault` | protected | Get the current default tax rate. |
| `taxRates.create` | protected | Create a tax rate (amount in basis points, e.g. 800 = 8%). |
| `taxRates.update` | protected | Update a tax rate. |
| `taxRates.setDefault` | protected | Set a tax rate as the default. |
| `taxRates.deactivate` | protected | Deactivate a tax rate. |

---

## Purchase Orders (`packages/api/src/routers/purchase-orders.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `purchaseOrders.list` | protected | List purchase orders with filters. |
| `purchaseOrders.getById` | protected | Get a purchase order by ID. |
| `purchaseOrders.create` | protected | Create a purchase order. |
| `purchaseOrders.approve` | protected | Approve a purchase order. |
| `purchaseOrders.receiveItems` | protected | Mark items as received on a purchase order. |
| `purchaseOrders.cancel` | protected | Cancel a purchase order. |

---

## Expenses (`packages/api/src/routers/expenses.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `expenses.list` | protected | List expenses with optional status filter. |
| `expenses.getById` | protected | Get an expense by ID. |
| `expenses.create` | protected | Create an expense record. |
| `expenses.approve` | protected | Approve an expense. |
| `expenses.reject` | protected | Reject an expense. |
| `expenses.markPaid` | protected | Mark an expense as paid. |

---

## Announcements (`packages/api/src/routers/announcements.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `announcements.list` | protected | List announcements with filters. |
| `announcements.listActive` | protected | List currently active announcements. |
| `announcements.create` | protected | Create an announcement. |
| `announcements.update` | protected | Update an announcement. |
| `announcements.delete` | protected | Delete an announcement. |

---

## Commission Splits (`packages/api/src/routers/commission-splits.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `commissionSplits.list` | protected | List commission split records with filters. |
| `commissionSplits.getByAppointment` | protected | Get commission splits for a specific appointment. |
| `commissionSplits.getMyCommissions` | protected | Get commission records for the current authenticated member. |
| `commissionSplits.listLedger` | protected (`commission_management:read`) | Enriched ledger with totals (pending/approved/paid). New in P6. |
| `commissionSplits.approve` | protected (`commission_management:approve`) | Bulk approve pending splits. |
| `commissionSplits.markPaid` | protected (`commission_management:process`) | Bulk mark approved splits as paid with payout method/reference/payoutId. |
| `commissionSplits.void` | protected (`commission_management:approve`) | Void a single split from any status with a required reason. |

---

## Customer Directory (`packages/api/src/routers/customer-directory.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `customerDirectory.list` | protected (`customer_management:read`) | Paginated registered-customer list with LTV, outstanding, active package count, last visit; server-side search + branch filter. |
| `customerDirectory.getById` | protected (`customer_management:read` + hierarchy scope check) | Full detail for drawer: member + user + profile + packages + recent payments + stats. |

---

## Audit Logs (`packages/api/src/routers/audit-logs.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `auditLogs.list` | protected (`audit_log:read`) | Filtered + paginated audit trail; cross-DB actor name enrichment. Filters: actor, action, entityType, date range. |

---

## POS (`packages/api/src/routers/pos.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `pos.recordSale` | protected (`pos_management:create` + branch scope) | Atomic tenantDb transaction: sales_orders + items + payments (`currency='myr'`) + payment_items + invoice + optional package_instance (accepts `walkInCustomerId`) + installments + commission splits per line item (non-fatal) + audit row. Validates: `unitPriceCents >= 0`, `quantity >= 1`, `discountCents <= subtotalCents`. |
| `pos.searchCustomers` | protected (`pos:create`) | Cross-DB member search + walk_in_customers ILIKE; up to 10 results; RBAC-filtered. |
| `pos.getReceiptData` | protected (`pos:create`) | Joined sale + items + payment + invoice + optional package + installments + customer name; for Print Receipt. |

---

## Refunds (`packages/api/src/routers/refunds.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `refunds.list` | protected (`refund_management:read`) | Paginated + cross-DB enriched ledger; filter by status, target, customer, branch, date. |
| `refunds.getById` | protected (`refund_management:read`) | Single refund with full metadata. |
| `refunds.request` | protected (`refund_management:create`) | Create pending refund; at least one of salesOrderId/paymentId/packageInstanceId; caps amount at remaining refundable; audit `sale.refund.request`. |
| `refunds.approve` | protected (`refund_management:approve`) | Move status pending → approved; audit `sale.refund.approve`. |
| `refunds.reject` | protected (`refund_management:approve`) | Move status pending → rejected (notes required); audit `sale.refund.reject`. |
| `refunds.process` | protected (`refund_management:process`) | Atomic: update refund + sales_orders.cancelledAmount + payments.refundAmount + package_instances.paymentStatus; SELECT FOR UPDATE locks; audit `sale.refund.process`. |

---

## Check-ins (`packages/api/src/routers/check-ins.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `checkIns.recordCheckIn` | protected (`attendance_management:create` + branch scope) | Insert check-in; 30-min anti-duplicate for drop-ins without appointmentClientId; reverts to `ALREADY_CHECKED_IN` error with `minutesAgo`; audit `checkin.create`. |
| `checkIns.listTodaysBookings` | protected (`attendance_management:read` + branch scope) | Today's appointments for a branch with check-in status annotations. |
| `checkIns.list` | protected (`attendance_management:read`) | Filtered check-in log with cross-DB name enrichment; date filter accepts both naive `YYYY-MM-DDTHH:mm:ss` and strict ISO. |
| `checkIns.deleteCheckIn` | protected (`attendance_management:delete`) | Revert attendance: delete row + uncheck appointment_clients.attended + restore package credit; audit `checkin.delete`. |

---

## Customer Profiles (`packages/api/src/routers/customer-profiles.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `customerProfiles.upsertForCustomer` | protected (`customer_management:update` + scope check) | Admin-scoped profile upsert from CustomerDetailSheet drawer. New in P1. |

---

## Package Instances — new procedure

| Procedure | Auth | Description |
|-----------|------|-------------|
| `packageInstances.listMemberships` | protected (`customer_management:read`) | Filter switch (active / expiring_7d / expiring_30d / expired / frozen / all). New in P2. |

---

## Waitlist (`packages/api/src/routers/waitlist.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `waitlist.list` | protected | List waitlist entries for a class slot. |
| `waitlist.add` | protected | Add a customer to the waitlist. |
| `waitlist.remove` | protected | Remove a customer from the waitlist. |
| `waitlist.promote` | protected | Promote a waitlisted customer to a confirmed booking. |

---

## Walk-In Customers (`packages/api/src/routers/walk-in-customers.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `walkInCustomers.list` | protected | List walk-in customer records. |
| `walkInCustomers.getById` | protected | Get a walk-in customer by ID. |
| `walkInCustomers.create` | protected | Create a walk-in customer record. |
| `walkInCustomers.update` | protected | Update a walk-in customer record. |
| `walkInCustomers.deactivate` | protected | Soft-deactivate a walk-in customer. |

---

## Rooms (`packages/api/src/routers/rooms.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `rooms.list` | protected | List rooms. |
| `rooms.getById` | protected | Get a room by ID. |
| `rooms.create` | protected | Create a room. |
| `rooms.update` | protected | Update a room. |
| `rooms.delete` | protected | Delete a room. |

---

## Brands (`packages/api/src/routers/brands.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `brands.list` | protected | List brands. |
| `brands.getById` | protected | Get a brand by ID. |
| `brands.create` | protected | Create a brand. |
| `brands.update` | protected | Update a brand. |
| `brands.delete` | protected | Delete a brand. |

---

## Product Categories (`packages/api/src/routers/product-categories.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `productCategories.list` | protected | List product categories. |
| `productCategories.getById` | protected | Get a product category by ID. |
| `productCategories.create` | protected | Create a product category. |
| `productCategories.update` | protected | Update a product category. |
| `productCategories.delete` | protected | Delete a product category. |

---

## Products (`packages/api/src/routers/products.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `products.list` | protected | List products with optional filters. |
| `products.getById` | protected | Get a product by ID. |
| `products.create` | protected | Create a product. |
| `products.update` | protected | Update a product. |
| `products.getStock` | protected | Get current stock level for a product. |
| `products.adjustStock` | protected | Manually adjust stock for a product. |

---

## Stock Requests (`packages/api/src/routers/stock-requests.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `stockRequests.list` | protected | List stock requests. |
| `stockRequests.getById` | protected | Get a stock request by ID. |
| `stockRequests.create` | protected | Create a stock request. |
| `stockRequests.approve` | protected | Approve a stock request. |
| `stockRequests.reject` | protected | Reject a stock request. |
| `stockRequests.fulfill` | protected | Mark a stock request as fulfilled. |

---

## Transfer Orders (`packages/api/src/routers/transfer-orders.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `transferOrders.list` | protected | List transfer orders. |
| `transferOrders.getById` | protected | Get a transfer order by ID. |
| `transferOrders.create` | protected | Create a transfer order. |
| `transferOrders.markInTransit` | protected | Mark a transfer order as in transit. |
| `transferOrders.complete` | protected | Mark a transfer order as completed. |
| `transferOrders.cancel` | protected | Cancel a transfer order. |

---

## Suppliers (`packages/api/src/routers/suppliers.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `suppliers.list` | protected | List suppliers. |
| `suppliers.getById` | protected | Get a supplier by ID. |
| `suppliers.create` | protected | Create a supplier. |
| `suppliers.update` | protected | Update a supplier. |
| `suppliers.deactivate` | protected | Deactivate a supplier. |

---

## Units of Measure (`packages/api/src/routers/units-of-measure.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `unitsOfMeasure.list` | protected | List units of measure. |
| `unitsOfMeasure.getById` | protected | Get a unit by ID. |
| `unitsOfMeasure.create` | protected | Create a unit of measure. |
| `unitsOfMeasure.update` | protected | Update a unit of measure. |
| `unitsOfMeasure.delete` | protected | Delete a unit of measure. |

---

## Analytics (`packages/api/src/routers/analytics.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `analytics.getDashboardKpis` | protected | Get dashboard KPI metrics (appointments, revenue, members). |
| `analytics.getStaffPerformance` | protected | Get staff performance data. |

---

## Google Calendar (`packages/api/src/routers/google-calendar.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `googleCalendar.status` | protected | Get Google Calendar integration status for the org. |
| `googleCalendar.disconnect` | protected | Disconnect Google Calendar integration. |

---

## Organization Settings (`packages/api/src/routers/organization-settings.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `organizationSettings.get` | protected | Get settings for the current organization. |
| `organizationSettings.upsert` | protected | Create or update organization settings. |

---

## Registration (`packages/api/src/routers/registration.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `registration.listCountries` | public | List countries for registration form. |
| `registration.listBranches` | public | List available branches for an organization (for registration). |
| `registration.complete` | protected | Complete member registration (fill in profile details). |

---

## Server-Only Routers (`apps/server/src/routers/`)

### Admin (`apps/server/src/routers/admin.ts`)

All admin procedures require `platformAdmins` table entry in addition to a valid session.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `admin.listTenants` | protected + platform admin | List all tenant organizations with pagination/filter. |
| `admin.getTenant` | protected + platform admin | Get full details of one tenant. |
| `admin.suspendTenant` | protected + platform admin | Suspend a tenant organization. |
| `admin.unsuspendTenant` | protected + platform admin | Unsuspend a tenant organization. |
| `admin.startImpersonation` | protected + platform admin | Start user impersonation session (1-hour expiry). |
| `admin.exitImpersonation` | protected + platform admin | End an impersonation session. |
| `admin.getAuditLogs` | protected + platform admin | Query audit log with filters. |
| `admin.getStats` | protected + platform admin | Get platform-wide statistics. |

### Auth (`apps/server/src/routers/auth.ts`)

See the [Auth section](#auth-appsserversrcroutersauthts) above — this router is server-only because it uses Resend for email and calls Better-Auth internals directly.

### Invitations (server extension) (`apps/server/src/routers/invitations.ts`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `invitations.sendEmail` | protected | Send invitation email via Resend. Server-only extension of the shared invitations router. |

---

## Notes

- **Amount fields:** monetary values are stored as integer cents in the database (e.g. `800` = 8.00 MYR).
- **`organizationId`** must be included in every request body for any procedure that accesses tenant data.
- **oRPC error codes** used: `UNAUTHORIZED` (no session), `FORBIDDEN` (wrong role/permission), `NOT_FOUND`, `BAD_REQUEST`, `INTERNAL_SERVER_ERROR`.
- **Type inference:** The full `appRouter` type (including server-only procedures) is exported from `packages/api/src/routers/index.ts` as `AppRouter` for end-to-end type safety on the client.
