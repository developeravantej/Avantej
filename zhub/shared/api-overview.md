# API Overview

**Last updated:** 2026-05-09

All oRPC procedures available in the Avantej platform. Client: `client.routerName.procedureName(input)` from `@/utils/orpc`.

Auth levels: **public** = no session required, **protected** = session + tenant context required.

Total routers: 52

---

## New in this update

- **`categoryBufferOverrides`** — new router: listForMember, upsert, listMine, updateMine
- **`packageInstanceStaff`** — new router: list, assign, remove, replace
- **`appointments`** — added: materializeOccurrence, splitSeries, cancelSeries, cancelFuture; create now accepts recurrence; list uses virtual occurrences
- **`announcements`** — create/update now accept `scopedBranchIds`; list accepts `isAdmin` param
- **`services`** — added: expireBranchPrice, deleteBranchPrice
- **`products`** — added: expireBranchPrice, deleteBranchPrice
- **`goodsReceipts`** — added: disputeInvoice, markInvoicePaid, getInvoicePreview; listInvoices updated
- **`invoices`** — added: paymentStatusHistory (cursor-paginated)
- **`salesOrders`** — added: statusHistory (cursor-paginated)
- **`packageInstances`** — added: statusHistory (cursor-paginated), assignTrainer, reject, listPending
- **`serviceMembers`** — added: listForService

---

## admin
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getImpersonationStatus` | protected | Return current impersonation session status |
| `impersonateUser` | protected | Start impersonating a user (super_admin / support only) |
| `me` | protected | Return platform admin status for current caller |
| `stopImpersonating` | protected | End active impersonation session |

## analytics
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getDashboardKpis` | protected | Returns KPI metrics for dashboard home |
| `getStaffPerformance` | protected | Staff performance summary for date range |

## announcements
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new announcement; accepts optional `scopedBranchIds` array |
| `delete` | protected | Delete announcement by id |
| `list` | protected | List announcements; accepts `isAdmin` param to include all org announcements |
| `listActive` | protected | List active announcements visible to user |
| `update` | protected | Update announcement details; accepts optional `scopedBranchIds` array |

## appointments
| Procedure | Auth | Description |
|-----------|------|-------------|
| `cancelFuture` | protected | Cancel all future occurrences of a recurring series from a given date |
| `cancelSeries` | protected | Cancel all occurrences of a recurring appointment series |
| `create` | protected | Create new appointment (staff); accepts recurrence rule input |
| `getById` | protected | Get appointment details (staff or client owner) |
| `list` | protected | List appointments by branch/date; returns virtual occurrences via listAppointmentsWithRecurrence |
| `listForUser` | protected | List appointments for current user (client view) |
| `materializeOccurrence` | protected | Persist a virtual recurrence occurrence as a concrete row |
| `splitSeries` | protected | Split a recurring series at a given date, materializing the target occurrence |
| `update` | protected | Update appointment status/details |

## audit-logs
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List audit logs with optional entity/action filters |

## auth
| Procedure | Auth | Description |
|-----------|------|-------------|
| `login` | public | Authenticate user and return access tokens |
| `userContext` | protected | Get current user context with organizations and hierarchy |
| `verifyEmail` | public | Verify user email with token |

## brands
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new brand |
| `delete` | protected | Delete brand by id |
| `getById` | protected | Get brand details by id |
| `list` | protected | List brands with optional search |
| `update` | protected | Update brand details |

## cancelled-sales
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getById` | protected | Get cancelled sale details |
| `list` | protected | List cancelled sales with optional filters |

## category-buffer-overrides
| Procedure | Auth | Description |
|-----------|------|-------------|
| `listForMember` | protected | List category buffer overrides for a specific member (requires user_management or service_management read) |
| `listMine` | protected | List category buffer overrides for the calling member (no permission gate) |
| `updateMine` | protected | Set/clear calling member's category buffer override; validates member has services in category |
| `upsert` | protected | Set/clear category buffer override for a specific member (requires user_management or service_management update) |

## category-commission
| Procedure | Auth | Description |
|-----------|------|-------------|
| `delete` | protected | Delete commission config for category |
| `getByCategory` | protected | Get commission config for a product category |
| `upsert` | protected | Create/update commission config with slots and conditional rates |

## check-ins
| Procedure | Auth | Description |
|-----------|------|-------------|
| `deleteCheckIn` | protected | Delete check-in record (reverts credits) |
| `getActivePackageForMember` | protected | Get earliest-expiring active package for member |
| `list` | protected | List check-ins with optional filters |
| `listTodaysBookings` | protected | List today's bookings annotated with check-in status |
| `recordBulkCheckIn` | protected | Record check-ins for multiple bookings |
| `recordCheckIn` | protected | Record check-in for member or walk-in |

## class-slots
| Procedure | Auth | Description |
|-----------|------|-------------|
| `bookingCounts` | protected | Get booking count summary for date range |
| `cancel` | protected | Cancel a class slot |
| `create` | protected | Create new class slot |
| `getById` | protected | Get class slot details |
| `getSignups` | protected | Get attendee list for class slot |
| `list` | protected | List class slots with optional filters |
| `update` | protected | Update class slot details |

## commission-splits
| Procedure | Auth | Description |
|-----------|------|-------------|
| `approve` | protected | Bulk approve pending commission splits |
| `createManualAdjustment` | protected | Create manual commission bonus/clawback |
| `getByAppointment` | protected | Get commission splits for an appointment |
| `getMyCommissions` | protected | Get commissions for current staff member |
| `liabilitySummary` | protected | Aggregate commission liability for date range |
| `list` | protected | List commission splits |
| `markPaid` | protected | Bulk mark approved splits as paid |
| `markPaidBatch` | protected | Batch mark approved splits as paid by member/date |
| `void` | protected | Void a commission split with reason |

## customer-directory
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getById` | protected | Get full customer detail (for drawer view) |
| `list` | protected | List customers with aggregated metrics |

## customer-profiles
| Procedure | Auth | Description |
|-----------|------|-------------|
| `get` | protected | Get current user customer profile |
| `upsert` | protected | Update customer profile (self-scoped) |
| `upsertForCustomer` | protected | Update customer profile (admin-scoped by id) |

## expenses
| Procedure | Auth | Description |
|-----------|------|-------------|
| `approve` | protected | Approve expense submission |
| `create` | protected | Create expense submission |
| `getById` | protected | Get expense details |
| `list` | protected | List expenses with optional filters |
| `markPaid` | protected | Mark expense as paid |
| `reject` | protected | Reject expense with reason |

## goods-receipts
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create goods receipt |
| `disputeInvoice` | protected | Raise a dispute on a goods receipt invoice |
| `getById` | protected | Get goods receipt details |
| `getInvoicePreview` | protected | Get invoice preview for a goods receipt |
| `list` | protected | List goods receipts |
| `listInvoices` | protected | List invoices with optional purchaseOrderId filter and pagination |
| `markInvoicePaid` | protected | Mark a goods receipt invoice as paid |
| `update` | protected | Update goods receipt details |

## google-calendar
| Procedure | Auth | Description |
|-----------|------|-------------|
| `disconnect` | protected | Revoke Google Calendar connection |
| `status` | protected | Get Google Calendar connection status |

## hierarchy
| Procedure | Auth | Description |
|-----------|------|-------------|
| `bulkReassignMembers` | protected | Reassign multiple members to new hierarchy scope |
| `createNode` | protected | Create hierarchy node (country/region/area/branch) |
| `deleteNode` | protected | Delete hierarchy node |
| `getDescendants` | protected | Get descendant nodes for a hierarchy node |
| `getNode` | protected | Get hierarchy node details |
| `listAllMembers` | protected | List all members across entire organization |
| `listMembers` | protected | List members within hierarchy scope |
| `listNodes` | protected | List hierarchy nodes |
| `moveNode` | protected | Move node to different parent |
| `reassignMember` | protected | Reassign member to new hierarchy scope |
| `updateNode` | protected | Update hierarchy node details |

## installment-plans
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new installment plan |
| `deactivate` | protected | Deactivate installment plan |
| `getByCode` | protected | Get installment plan by code |
| `getById` | protected | Get installment plan by id |
| `list` | protected | List installment plans |
| `setDefault` | protected | Set default installment plan |
| `update` | protected | Update installment plan details |

## installments
| Procedure | Auth | Description |
|-----------|------|-------------|
| `adjustCredits` | protected | Adjust package credits for installment |
| `confirmPayment` | protected | Confirm installment payment received |
| `processRefund` | protected | Process refund for installment |

## invitations
| Procedure | Auth | Description |
|-----------|------|-------------|
| `accept` | public | Accept invitation by token |
| `create` | protected | Create new member invitation |
| `decline` | public | Decline invitation by token |
| `getByToken` | public | Get invitation details by token |
| `list` | protected | List pending invitations |
| `resend` | protected | Resend invitation email |
| `revoke` | protected | Revoke pending invitation |
| `verifyEmailByToken` | public | Verify email during signup |

## invoices
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new invoice |
| `getById` | protected | Get invoice details |
| `list` | protected | List invoices with optional filters |
| `paymentStatusHistory` | protected | Cursor-paginated payment status transition log for an invoice |
| `update` | protected | Update invoice details |

## member-profiles
| Procedure | Auth | Description |
|-----------|------|-------------|
| `get` | protected | Get member profile details |
| `upsert` | protected | Create/update member profile |

## members
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new organization member |
| `deactivate` | protected | Deactivate member account |
| `getById` | protected | Get member details by id |
| `list` | protected | List members with optional filters |
| `reactivate` | protected | Reactivate deactivated member |
| `remove` | protected | Remove member from organization |
| `suspend` | protected | Suspend member account |
| `updateRole` | protected | Update member role |

## notification-preferences
| Procedure | Auth | Description |
|-----------|------|-------------|
| `get` | protected | Get user notification preferences |
| `update` | protected | Update notification preference settings |

## notifications
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getUnreadCount` | protected | Get unread notification count |
| `list` | protected | List notifications with optional filters |
| `markAllRead` | protected | Mark all notifications as read |
| `markRead` | protected | Mark notification as read |

## organization-settings
| Procedure | Auth | Description |
|-----------|------|-------------|
| `get` | protected | Get organization settings |
| `upsert` | protected | Update organization settings |

## package-instance-staff
| Procedure | Auth | Description |
|-----------|------|-------------|
| `assign` | protected | Assign (or UPSERT) a staff member to a slot on a package instance (package_management:update) |
| `list` | protected | List all staff assignments for a package instance (package_management:read) |
| `remove` | protected | Remove a staff member from a package instance by staffId (package_management:update) |
| `replace` | protected | Atomically replace ALL staff assignments for a package instance (package_management:update) |

## package-instances
| Procedure | Auth | Description |
|-----------|------|-------------|
| `assignTrainer` | protected | Assign a trainer to a pending package, transitioning it to active (admin or trainer self-assign) |
| `create` | protected | Create new package instance; approval gate: purchased packages start pending when org setting enabled |
| `getActiveForClient` | protected | Get active packages for client (session user; native app) |
| `getById` | protected | Get package instance details (enriched with assignedTrainerName, preferredTrainerName) |
| `listAll` | protected | List all package instances for org (service_management:read); returns clientName |
| `listExpiring` | protected | List packages expiring soon (reports:read) |
| `listForClient` | protected | List packages for specific client (session user; native app) |
| `listMemberships` | protected | List membership packages with RBAC scope (service_management:read) |
| `listPending` | protected | List packages awaiting trainer assignment (admin or trainer; enriched with customerName, preferredTrainerName) |
| `reject` | protected | Reject a pending package — admin only; sets status cancelled and notifies customer |
| `statusHistory` | protected | Cursor-paginated status transition log (package_management:read) |

## payouts
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List payouts to staff/suppliers |

## permissions
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List available permissions |

## pos
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getReceiptData` | protected | Get receipt data for printing |
| `recordSale` | protected | Record point-of-sale transaction |
| `searchCustomers` | protected | Search customers for POS transaction |

## preferred-times
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List preferred times for package instance |
| `upsert` | protected | Set preferred appointment times (up to 4 slots: dayOfWeek + time + priority) |

## product-categories
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create product category |
| `delete` | protected | Delete product category |
| `getById` | protected | Get product category details |
| `list` | protected | List product categories |
| `update` | protected | Update product category |

## products
| Procedure | Auth | Description |
|-----------|------|-------------|
| `adjustStock` | protected | Adjust product stock levels |
| `create` | protected | Create new product |
| `deleteBranchPrice` | protected | Delete a branch-specific price override for a product |
| `expireBranchPrice` | protected | Expire a branch-specific price override for a product |
| `getById` | protected | Get product details |
| `getStock` | protected | Get product stock level |
| `list` | protected | List products with optional filters |
| `update` | protected | Update product details |

## promotions
| Procedure | Auth | Description |
|-----------|------|-------------|
| `apply` | protected | Apply promotion code to order |
| `create` | protected | Create new promotion |
| `deactivate` | protected | Deactivate promotion |
| `list` | protected | List promotions |
| `update` | protected | Update promotion details |
| `validate` | protected | Validate promotion code |

## purchase-orders
| Procedure | Auth | Description |
|-----------|------|-------------|
| `approve` | protected | Approve pending purchase order |
| `cancel` | protected | Cancel purchase order |
| `create` | protected | Create new purchase order |
| `getById` | protected | Get purchase order details |
| `list` | protected | List purchase orders |
| `receiveItems` | protected | Mark PO items as received |

## refunds
| Procedure | Auth | Description |
|-----------|------|-------------|
| `approve` | protected | Approve refund request |
| `getById` | protected | Get refund details |
| `list` | protected | List refund requests |
| `process` | protected | Process approved refund |
| `reject` | protected | Reject refund request |
| `request` | protected | Request refund for sale order |

## registration
| Procedure | Auth | Description |
|-----------|------|-------------|
| `complete` | protected | Complete organization registration |
| `listBranches` | public | List organization branches for registration |
| `listCountries` | public | List countries for registration |

## role-permissions
| Procedure | Auth | Description |
|-----------|------|-------------|
| `add` | protected | Add permission to role |
| `list` | protected | List role permissions |
| `remove` | protected | Remove permission from role |

## roles
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new custom role |
| `delete` | protected | Delete custom role |
| `list` | protected | List available roles |
| `update` | protected | Update role details |

## rooms
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new room |
| `delete` | protected | Delete room |
| `getById` | protected | Get room details |
| `list` | protected | List rooms |
| `update` | protected | Update room details |

## sales-orders
| Procedure | Auth | Description |
|-----------|------|-------------|
| `cancel` | protected | Cancel sales order |
| `create` | protected | Create new sales order |
| `getById` | protected | Get sales order details |
| `list` | protected | List sales orders |
| `statusHistory` | protected | Cursor-paginated status transition log for a sales order |
| `update` | protected | Update sales order details |

## service-categories
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create service category |
| `getById` | protected | Get service category details |
| `list` | protected | List service categories |
| `update` | protected | Update service category |

## service-category-config
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getByCategoryId` | protected | Get service category booking config |
| `upsert` | protected | Update service category config (duration, capacity, booking rules) |

## service-members
| Procedure | Auth | Description |
|-----------|------|-------------|
| `assign` | protected | Assign member to service |
| `listForMember` | protected | List services for a specific member (admin view) |
| `listForService` | protected | List members assigned to a specific service |
| `listMine` | protected | List services for current member (self-scoped) |
| `remove` | protected | Remove member from service |
| `updateBuffer` | protected | Update service buffer time for a specific member (admin) |
| `updateMyBuffer` | protected | Update buffer time for own service assignment (self-scoped) |

## services
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new service |
| `deleteBranchPrice` | protected | Delete a branch-specific price override for a service |
| `expireBranchPrice` | protected | Expire a branch-specific price override for a service |
| `getById` | protected | Get service details |
| `list` | protected | List services with optional filters |
| `update` | protected | Update service details |

## stock-requests
| Procedure | Auth | Description |
|-----------|------|-------------|
| `approve` | protected | Approve stock transfer request |
| `create` | protected | Create stock transfer request |
| `fulfill` | protected | Complete stock transfer |
| `getById` | protected | Get stock request details |
| `list` | protected | List stock requests |
| `reject` | protected | Reject stock request |

## suppliers
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new supplier |
| `deactivate` | protected | Deactivate supplier |
| `getById` | protected | Get supplier details |
| `list` | protected | List suppliers |
| `update` | protected | Update supplier details |

## tax-rates
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create tax rate |
| `deactivate` | protected | Deactivate tax rate |
| `getById` | protected | Get tax rate details |
| `getDefault` | protected | Get default tax rate |
| `list` | protected | List tax rates |
| `setDefault` | protected | Set default tax rate |
| `update` | protected | Update tax rate details |

## tenant-admin
| Procedure | Auth | Description |
|-----------|------|-------------|
| `impersonateMember` | protected | Impersonate staff member in own organization |
| `stopImpersonating` | protected | End tenant-admin impersonation session |

## trainer-availability
| Procedure | Auth | Description |
|-----------|------|-------------|
| `delete` | protected | Delete trainer availability slot |
| `list` | protected | List trainer availability |
| `upsert` | protected | Set trainer availability schedule |

## trainer-tiers
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create trainer tier |
| `delete` | protected | Delete trainer tier |
| `list` | protected | List trainer tiers |
| `update` | protected | Update trainer tier |

## transfer-orders
| Procedure | Auth | Description |
|-----------|------|-------------|
| `cancel` | protected | Cancel transfer order |
| `complete` | protected | Complete transfer order |
| `create` | protected | Create inventory transfer order |
| `getById` | protected | Get transfer order details |
| `list` | protected | List transfer orders |
| `markInTransit` | protected | Mark transfer as in transit |

## units-of-measure
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create unit of measure |
| `delete` | protected | Delete unit of measure |
| `getById` | protected | Get unit of measure details |
| `list` | protected | List units of measure |
| `update` | protected | Update unit of measure |

## user-activity-log
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List user activity with optional activity type filter |

## walk-in-customers
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List walk-in customers |
