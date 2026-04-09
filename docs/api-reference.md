# Avantej API Reference

All API endpoints are served via **oRPC** at `POST /rpc/{router}/{procedure}`.

- **Public procedures** require no authentication
- **Protected procedures** require an authenticated session (cookie-based)
- Most protected procedures also check RBAC permissions and hierarchy scoping

---

## Table of Contents

1. [Auth](#auth)
2. [Registration](#registration)
3. [Admin](#admin)
4. [Members](#members)
5. [Member Profiles](#member-profiles)
6. [Hierarchy](#hierarchy)
7. [Invitations](#invitations)
8. [Roles](#roles)
9. [Permissions](#permissions)
10. [Role Permissions](#role-permissions)
11. [Appointments](#appointments)
12. [Class Slots](#class-slots)
13. [Waitlist](#waitlist)
14. [Services](#services)
15. [Service Categories](#service-categories)
16. [Service Commission Config](#service-commission-config)
17. [Service Rules](#service-rules)
18. [Packages](#packages)
19. [Package Instances](#package-instances)
20. [Preferred Times](#preferred-times)
21. [Customer Profiles](#customer-profiles)
22. [Walk-In Customers](#walk-in-customers)
23. [Sales Orders](#sales-orders)
24. [Cancelled Sales](#cancelled-sales)
25. [Invoices](#invoices)
26. [Promotions](#promotions)
27. [Tax Rates](#tax-rates)
28. [Purchase Orders](#purchase-orders)
29. [Expenses](#expenses)
30. [Commission Splits](#commission-splits)
31. [Payouts](#payouts)
32. [Products](#products)
33. [Brands](#brands)
34. [Product Categories](#product-categories)
35. [Suppliers](#suppliers)
36. [Units of Measure](#units-of-measure)
37. [Stock Requests](#stock-requests)
38. [Transfer Orders](#transfer-orders)
39. [Rooms](#rooms)
40. [Notifications](#notifications)
41. [Notification Preferences](#notification-preferences)
42. [Announcements](#announcements)
43. [User Activity Log](#user-activity-log)
44. [Analytics](#analytics)

---

## Auth

Server-specific router handling authentication and user context.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `auth.login` | Public | Sign in with email/password. Returns user context and organizations. |
| `auth.userContext` | Protected | Gets current user's complete context (user info, organizations with hierarchy). |
| `auth.verifyEmail` | Public | Verifies email address via token. |

---

## Registration

Handles new user registration flow.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `registration.listCountries` | Public | Lists countries that have registered branches. |
| `registration.listBranches` | Public | Lists branches available in a given country. |
| `registration.complete` | Protected | Completes user registration (requires logged-in user with null role). |

---

## Admin

Platform administration (requires admin privileges).

| Procedure | Auth | Description |
|-----------|------|-------------|
| `admin.listTenants` | Protected (admin) | Lists organizations with pagination and filters (status, search). |
| `admin.getTenant` | Protected (admin) | Gets tenant details with subscription info and member count. |
| `admin.suspendTenant` | Protected (admin) | Suspends an organization. |
| `admin.unsuspendTenant` | Protected (admin) | Restores a suspended organization. |
| `admin.startImpersonation` | Protected (admin) | Starts admin impersonation session (1-hour token). |
| `admin.exitImpersonation` | Protected (admin) | Ends impersonation session. |
| `admin.getAuditLogs` | Protected (admin) | Gets platform audit logs. |
| `admin.getStats` | Protected (admin) | Gets platform statistics (org counts, users, members, subscriptions). |

---

## Members

Manage organization members with dual-write to control panel and tenant databases.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `members.list` | Protected | Lists members with filters (role, status, hierarchyScopeId). RBAC-aware. |
| `members.create` | Protected | Creates a member. Dual-writes to control panel + tenant DB. |
| `members.getById` | Protected | Gets member details with accessible node IDs. |
| `members.updateRole` | Protected | Updates a member's role. |
| `members.suspend` | Protected | Suspends a member in both databases. |
| `members.reactivate` | Protected | Reactivates a suspended member. |
| `members.remove` | Protected | Removes a member (validates last-admin check). |
| `members.deactivate` | Protected | Sets member status to inactive in tenant DB only. |

---

## Member Profiles

Staff member profiles (display name, bio, specialization, etc.).

| Procedure | Auth | Description |
|-----------|------|-------------|
| `memberProfiles.get` | Protected | Gets member profile (displayName, bio, specialization, image, phone, certifications). |
| `memberProfiles.upsert` | Protected | Creates or updates member profile. |

---

## Hierarchy

Tree-based organization hierarchy (country > region > area > branch).

| Procedure | Auth | Description |
|-----------|------|-------------|
| `hierarchy.createNode` | Protected | Creates a hierarchy node with depth validation. |
| `hierarchy.listNodes` | Protected | Lists accessible hierarchy nodes ordered by depth and name. |
| `hierarchy.updateNode` | Protected | Updates node (name, address, picUserId). |
| `hierarchy.getNode` | Protected | Gets a single hierarchy node by ID. |
| `hierarchy.getDescendants` | Protected | Gets all descendant nodes of a given node. |
| `hierarchy.deleteNode` | Protected | Soft-deletes node; auto-deletes children and reassigns members. |
| `hierarchy.moveNode` | Protected | Moves a node to a new parent with validation. |
| `hierarchy.listMembers` | Protected | Lists members assigned to a hierarchy node. |
| `hierarchy.reassignMember` | Protected | Reassigns a single member to a new hierarchy scope. |
| `hierarchy.bulkReassignMembers` | Protected | Bulk reassigns members to a new hierarchy scope. |
| `hierarchy.listAllMembers` | Protected | Lists all members with user details (name, email). |

---

## Invitations

Invitation management with email sending capability.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `invitations.create` | Protected | Creates invitation with token; validates scope access. |
| `invitations.accept` | Public | Accepts invitation (user must be logged in with matching email). |
| `invitations.verifyEmailByToken` | Public | Pre-verifies invited email in control-panel DB. |
| `invitations.decline` | Public | Declines/revokes an invitation. |
| `invitations.getByToken` | Public | Gets invitation details by token. |
| `invitations.list` | Protected | Lists invitations with optional filters (status, email). |
| `invitations.revoke` | Protected | Marks invitation as declined/revoked. |
| `invitations.resend` | Protected | Extends expiration and returns invitation for resending. |
| `invitations.sendEmail` | Protected | Sends invitation email via Resend (server-only). |

---

## Roles

Custom role management (system roles are immutable).

| Procedure | Auth | Description |
|-----------|------|-------------|
| `roles.list` | Protected | Lists all roles ordered by priority (highest first). |
| `roles.create` | Protected | Creates a custom role (priority 1-99; admin=100 reserved). |
| `roles.update` | Protected | Updates a custom role (cannot modify system roles). |
| `roles.delete` | Protected | Deletes a custom role (cannot delete system roles). |

---

## Permissions

Permission definitions.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `permissions.list` | Protected | Lists permissions, optionally filtered by resource type. |

---

## Role Permissions

Role-to-permission assignments.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `rolePermissions.list` | Protected | Lists role-permission assignments with permission details. |
| `rolePermissions.add` | Protected | Adds a permission to a role with scope (organization, team, own, branch). |
| `rolePermissions.remove` | Protected | Removes a permission from a role (cannot modify system roles). |

---

## Appointments

Appointment scheduling and management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `appointments.list` | Protected | Lists appointments by branch/date range. Filters by status; hierarchy-scoped for staff. |
| `appointments.listForUser` | Protected | Lists appointments for current user (client view). |
| `appointments.getById` | Protected | Gets appointment details (clients see own; staff see accessible). |
| `appointments.create` | Protected | Creates appointment with duration, pricing, and service binding. |
| `appointments.update` | Protected | Updates appointment (staff can edit details; clients can only cancel). |

---

## Class Slots

Group class scheduling and capacity management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `classSlots.list` | Protected | Lists class slots with filters (serviceId, branchId, date range, availability). |
| `classSlots.getById` | Protected | Gets class slot details. |
| `classSlots.create` | Protected | Creates a class slot with capacity and instructor assignment. |
| `classSlots.update` | Protected | Updates class slot details. |
| `classSlots.cancel` | Protected | Cancels a class slot with reason. |
| `classSlots.bookingCounts` | Protected | Gets booking counts for multiple slots. |

---

## Waitlist

Waitlist management for full class slots.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `waitlist.list` | Protected | Lists waitlist entries with optional filters (classSlotId, memberId). |
| `waitlist.add` | Protected | Adds a member to the waitlist. |
| `waitlist.remove` | Protected | Removes an entry from the waitlist. |
| `waitlist.promote` | Protected | Promotes the first waitlist member to a booking. |

---

## Services

Service definitions (private sessions, group classes, etc.).

| Procedure | Auth | Description |
|-----------|------|-------------|
| `services.list` | Protected | Lists services with filters (categoryId, branchId, isActive, type, schedulingType). |
| `services.getById` | Protected | Gets service details. |
| `services.create` | Protected | Creates a service with pricing, duration, type (private/semi-private), and features. |
| `services.update` | Protected | Updates service details. |

---

## Service Categories

Grouping for services.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `serviceCategories.list` | Protected | Lists categories with filters (branchId, isActive). |
| `serviceCategories.getById` | Protected | Gets category details. |
| `serviceCategories.create` | Protected | Creates a category (name, description, display order). |
| `serviceCategories.update` | Protected | Updates category details. |

---

## Service Commission Config

Commission configuration per service.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `serviceCommissionConfig.upsert` | Protected | Upserts commission config (fixed/percentage/position_based, staff pool %, max staff). |

---

## Service Rules

Booking and cancellation rules per service.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `serviceRules.upsert` | Protected | Upserts booking/cancellation rules (min advance booking, cancellation cutoff). |

---

## Packages

Package templates (session bundles with pricing and expiry).

| Procedure | Auth | Description |
|-----------|------|-------------|
| `packages.list` | Protected | Lists packages with filters (branchId, appointmentType, isArchived). |
| `packages.getById` | Protected | Gets package details. |
| `packages.create` | Protected | Creates a package with sessions, pricing, expiry, and auto-invoice flag. |
| `packages.update` | Protected | Updates package details. |
| `packages.archive` | Protected | Archives a package (soft delete). |

---

## Package Instances

Assigned/purchased package instances for clients.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `packageInstances.listForClient` | Protected | Lists package instances for current user (client). Filters by status/source. |
| `packageInstances.getActiveForClient` | Protected | Gets the active package instance for a client (dashboard fitness plan). |
| `packageInstances.getById` | Protected | Gets package instance details (client or staff with permission). |
| `packageInstances.create` | Protected | Creates a package instance (assignment or purchase) with credits and expiry. |
| `packageInstances.listAll` | Protected | Lists all package instances with optional filters (clientId, status, source). |

---

## Preferred Times

Client preferred appointment times for package instances.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `preferredTimes.list` | Protected | Lists preferred times for a package instance (client or staff access). |
| `preferredTimes.upsert` | Protected | Upserts preferred times (max 4 per instance); includes day, time, and priority. |

---

## Customer Profiles

Client-facing customer profile management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `customerProfiles.get` | Protected | Gets customer profile for session user. |
| `customerProfiles.upsert` | Protected | Creates/updates profile (phone, DOB, gender, address, emergency contact, fitness goals, credit points). |

---

## Walk-In Customers

Unregistered customer management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `walkInCustomers.list` | Protected | Lists walk-in customers with filters (branchId, search, isActive, pagination). |
| `walkInCustomers.getById` | Protected | Gets walk-in customer details. |
| `walkInCustomers.create` | Protected | Creates a walk-in customer with emergency contact info. |
| `walkInCustomers.update` | Protected | Updates customer details. |
| `walkInCustomers.deactivate` | Protected | Deactivates a walk-in customer. |

---

## Sales Orders

Sales order management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `salesOrders.list` | Protected | Lists sales orders with filters (branchId, status, customerId, date range). |
| `salesOrders.getById` | Protected | Gets sales order details. |
| `salesOrders.create` | Protected | Creates a sales order with date, customer, items, and total. |
| `salesOrders.update` | Protected | Updates sales order details. |
| `salesOrders.cancel` | Protected | Cancels a sales order with refund amount and reason. |

---

## Cancelled Sales

View cancelled sales records.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `cancelledSales.list` | Protected | Lists cancelled sales with filters (customerId, date range). |
| `cancelledSales.getById` | Protected | Gets cancelled sale details. |

---

## Invoices

Invoice management with e-invoice support.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `invoices.list` | Protected | Lists invoices with filters (status, customerId, salesOrderId, date range). |
| `invoices.getById` | Protected | Gets invoice details. |
| `invoices.create` | Protected | Creates an invoice with payment info and e-invoice fields. |
| `invoices.update` | Protected | Updates invoice details. |

---

## Promotions

Promotion and discount management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `promotions.list` | Protected | Lists promotions with filters (isActive, type, branchId, pagination). |
| `promotions.validate` | Protected | Validates a promo code for a given order. |
| `promotions.apply` | Protected | Applies a promotion to a sales order. |
| `promotions.create` | Protected | Creates a promotion (percentage/fixed/free_item/buy_x_get_y, usage limits). |
| `promotions.update` | Protected | Updates promotion details. |
| `promotions.deactivate` | Protected | Deactivates a promotion. |

---

## Tax Rates

Tax rate configuration (stored in basis points, e.g., 800 = 8.00%).

| Procedure | Auth | Description |
|-----------|------|-------------|
| `taxRates.list` | Protected | Lists tax rates with filters (isActive, category). |
| `taxRates.getById` | Protected | Gets tax rate details. |
| `taxRates.getDefault` | Protected | Gets the default tax rate. |
| `taxRates.create` | Protected | Creates a tax rate (basis points, category, effective dates). |
| `taxRates.update` | Protected | Updates a tax rate. |
| `taxRates.setDefault` | Protected | Sets a tax rate as the default. |
| `taxRates.deactivate` | Protected | Deactivates a tax rate. |

---

## Purchase Orders

Purchase order management for inventory procurement.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `purchaseOrders.list` | Protected | Lists POs with filters (supplierId, branchId, status, date range, pagination). |
| `purchaseOrders.getById` | Protected | Gets PO details. |
| `purchaseOrders.create` | Protected | Creates a PO with items and expected delivery date. |
| `purchaseOrders.approve` | Protected | Approves a PO. |
| `purchaseOrders.receiveItems` | Protected | Receives items for a PO. |
| `purchaseOrders.cancel` | Protected | Cancels a PO. |

---

## Expenses

Expense tracking and approval workflow.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `expenses.list` | Protected | Lists expenses with filters (branchId, status, submittedBy, date range). |
| `expenses.getById` | Protected | Gets expense details. |
| `expenses.create` | Protected | Creates an expense (category: travel/equipment/supplies/training/other). |
| `expenses.approve` | Protected | Approves an expense. |
| `expenses.reject` | Protected | Rejects an expense with reason. |
| `expenses.markPaid` | Protected | Marks an expense as paid. |

---

## Commission Splits

Staff commission tracking.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `commissionSplits.list` | Protected | Lists commission splits with filters (memberId, appointmentId, date range). |
| `commissionSplits.getByAppointment` | Protected | Gets all commissions for a specific appointment. |
| `commissionSplits.getMyCommissions` | Protected | Gets current member's own commissions. |

---

## Payouts

Staff payout management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `payouts.list` | Protected | Lists payouts with optional filters (status, recipientId). Enriched with recipient names. |

---

## Products

Product catalog and stock management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `products.list` | Protected | Lists products with filters (brandId, categoryId, supplierId, status, search). |
| `products.getById` | Protected | Gets product details. |
| `products.create` | Protected | Creates a product (SKU, barcode, type, UOM, pricing). |
| `products.update` | Protected | Updates product details. |
| `products.getStock` | Protected | Gets product stock for a branch. |
| `products.adjustStock` | Protected | Adjusts product stock (delta). |

---

## Brands

Product brand management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `brands.list` | Protected | Lists brands with optional search. |
| `brands.getById` | Protected | Gets brand details. |
| `brands.create` | Protected | Creates a brand. |
| `brands.update` | Protected | Updates a brand. |
| `brands.delete` | Protected | Deletes a brand. |

---

## Product Categories

Product category management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `productCategories.list` | Protected | Lists categories with optional search. |
| `productCategories.getById` | Protected | Gets category details. |
| `productCategories.create` | Protected | Creates a category with external code. |
| `productCategories.update` | Protected | Updates a category. |
| `productCategories.delete` | Protected | Deletes a category. |

---

## Suppliers

Supplier management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `suppliers.list` | Protected | Lists suppliers with filters (isActive, search). |
| `suppliers.getById` | Protected | Gets supplier details. |
| `suppliers.create` | Protected | Creates a supplier with contact info and payment terms. |
| `suppliers.update` | Protected | Updates supplier details. |
| `suppliers.deactivate` | Protected | Deactivates a supplier. |

---

## Units of Measure

UOM definitions for products.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `unitsOfMeasure.list` | Protected | Lists UOMs with optional search. |
| `unitsOfMeasure.getById` | Protected | Gets UOM details. |
| `unitsOfMeasure.create` | Protected | Creates a UOM with conversion factor. |
| `unitsOfMeasure.update` | Protected | Updates a UOM. |
| `unitsOfMeasure.delete` | Protected | Deletes a UOM. |

---

## Stock Requests

Inter-branch stock request workflow.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `stockRequests.list` | Protected | Lists stock requests with filters (status, fromBranch, toBranch). |
| `stockRequests.getById` | Protected | Gets stock request details. |
| `stockRequests.create` | Protected | Creates a stock request with items. |
| `stockRequests.approve` | Protected | Approves a stock request. |
| `stockRequests.reject` | Protected | Rejects a stock request. |
| `stockRequests.fulfill` | Protected | Fulfills a stock request with item quantities. |

---

## Transfer Orders

Inventory transfer between branches.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `transferOrders.list` | Protected | Lists transfer orders with filters (status, fromBranch, toBranch). |
| `transferOrders.getById` | Protected | Gets transfer order details. |
| `transferOrders.create` | Protected | Creates a transfer order with items and issuer. |
| `transferOrders.markInTransit` | Protected | Marks transfer as in transit. |
| `transferOrders.complete` | Protected | Completes transfer with received quantities. |
| `transferOrders.cancel` | Protected | Cancels a transfer order. |

---

## Rooms

Room/facility management per branch.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `rooms.list` | Protected | Lists rooms with filters (branchId, isActive). |
| `rooms.getById` | Protected | Gets room details. |
| `rooms.create` | Protected | Creates a room (consultation, group_session, private, training, individual). |
| `rooms.update` | Protected | Updates room details. |
| `rooms.delete` | Protected | Deletes a room. |

---

## Notifications

User notification management.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `notifications.list` | Protected | Lists notifications for session user with optional filters (isRead, type, limit). |
| `notifications.getUnreadCount` | Protected | Gets unread notification count for session user. |
| `notifications.markRead` | Protected | Marks a single notification as read. |
| `notifications.markAllRead` | Protected | Marks all notifications as read for session user. |

---

## Notification Preferences

Per-user notification settings.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `notificationPreferences.get` | Protected | Gets notification preferences for session user. |
| `notificationPreferences.update` | Protected | Updates preferences (email, SMS, push, booking reminders, promotions, expiry alerts). |

---

## Announcements

Organization-wide announcements.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `announcements.list` | Protected | Lists announcements with filters (branchId, isActive). |
| `announcements.listActive` | Protected | Lists currently active announcements. |
| `announcements.create` | Protected | Creates announcement (priority, targetAudience, pinned, date range). |
| `announcements.update` | Protected | Updates an announcement. |
| `announcements.delete` | Protected | Deletes an announcement. |

---

## User Activity Log

User activity tracking.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `userActivityLog.list` | Protected | Lists recent activity for session user with optional filters. |

---

## Analytics

Dashboard KPIs and performance metrics.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `analytics.getDashboardKpis` | Protected | Gets dashboard KPIs (period: today/week/month/year/custom; optional branchId). |
| `analytics.getStaffPerformance` | Protected | Gets staff performance metrics. |

---

## Utility Endpoints

| Procedure | Auth | Description |
|-----------|------|-------------|
| `healthCheck` | Public | Health check endpoint. |
| `privateData` | Protected | Protected test endpoint. |

---

## Summary

| Category | Routers | Procedures |
|----------|---------|------------|
| Auth & Registration | 2 | 6 |
| Admin | 1 | 8 |
| Members & Profiles | 2 | 10 |
| Hierarchy | 1 | 11 |
| Invitations | 1 | 9 |
| RBAC (Roles, Permissions) | 3 | 8 |
| Appointments & Scheduling | 3 | 16 |
| Services & Config | 4 | 10 |
| Packages | 3 | 12 |
| Customer Management | 2 | 7 |
| Sales & Invoicing | 3 | 11 |
| Promotions & Tax | 2 | 13 |
| Purchase Orders | 1 | 6 |
| Expenses & Commissions | 2 | 9 |
| Payouts | 1 | 1 |
| Inventory (Products, Stock) | 5 | 22 |
| Rooms | 1 | 5 |
| Notifications | 2 | 6 |
| Announcements | 1 | 5 |
| Activity & Analytics | 2 | 3 |
| Utility | - | 2 |
| **Total** | **~45** | **~180** |
