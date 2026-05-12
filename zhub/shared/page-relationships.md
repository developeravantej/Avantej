# Dashboard Page Relationships

**Last updated:** 2026-05-07 (audit pass 3 — source-code verified)  
Complete map of inter-page relationships: navigation flows, data dependencies, reference data, entity lifecycles, and permission gating.

---

## Table of Contents

1. [Navigation Flows](#1-navigation-flows)
2. [Data Write → Read Dependencies](#2-data-write--read-dependencies)
3. [Reference Data Consumption](#3-reference-data-consumption)
4. [Status Lifecycles & Workflows](#4-status-lifecycles--workflows)
5. [Shared Entities](#5-shared-entities)
6. [Permission Gating](#6-permission-gating)
7. [Redirect Stubs](#7-redirect-stubs)
8. [Home Dashboard Aggregations](#8-home-dashboard-aggregations)
9. [Full Dependency Chain Diagrams](#9-full-dependency-chain-diagrams)
10. [Schema-Level Entities With No Confirmed Page Coverage](#10-schema-level-entities-with-no-confirmed-page-coverage)

---

## 1. Navigation Flows

### Confirmed implemented links

| From | To | Trigger |
|------|----|---------|
| Sales View | Sale Detail `$id` | Row click |
| Sale Detail | Sales View | Back button |
| Sale Detail | Refunds | "Request Refund" action → opens refund create flow |
| Payment View | Sale Detail `$id` | `salesOrderId` link in invoice row |
| Cancelled Sales | Sale Detail `$id` | Row click (link back to original order) |
| Customers View | Customer 360 `$id` | "View 360°" button |
| Customer 360 | Customers View | Back button |
| Customer 360 (Packages tab) | Package Installments | Expandable installment rows |
| Refunds | Sale Detail | `salesOrderId` link in table |
| Commissions View | Sale Detail `$id` | Commission row → originating sale |
| Roles | Roles (sheet/modal) | Row click — no separate `$id` route exists |
| Home (KPI card) | Sales View | Total Sales card |
| Home (KPI card) | Appointments | Appointments card |
| Home (KPI card) | Packages / Memberships View (via `/dashboard/memberships/view` redirect) | Active Members card — **note:** links to memberships redirect, NOT `/dashboard/customers/view` |
| Sales Create (on success) | Sale Detail | Auto-navigate after `pos.recordSale` |
| Service View (Categories tab) | Category Commission Config | "Commission Config" button (opens Sheet modal) |
| Sales View | Customer 360 `$id` | Customer name cell link (`?customerId=...`) in sale row |
| Audit Log | (read-only, no outbound nav) | — |

### Aspirational / not yet implemented

The following flows are logically expected but have no `Link` or `navigate` call in the current source:

| From | To | Why expected |
|------|----|---------|
| Customer 360 (Payments tab) | Payment View | Drill into invoice from payment row |
| Payouts View | Commissions View | Drill into underlying splits |
| Commissions View | Payouts View | See when split gets paid |
| Trainers View | Commissions View | Trainer's commission history (filtered) |
| Appointments Calendar | Customer 360 | Attending member link on appointment |
| Attendance | Customer 360 | Member link on check-in row |
| Class Slots (signups list) | Customer 360 | View enrolled customer |
| Notifications page | Source entity | Notification → appointment/sale/package that triggered it |
| Package Instances | Customer 360 | Customer name link on package row |
| Package Instances | Sale Detail | Source sale link on package row |
| User Assignment | Audit Log | "View audit trail" for access control changes |
| Expenses | Audit Log | Approval/rejection entries in audit trail |
| Purchase Orders | Audit Log | PO lifecycle changes in audit trail |

> **Note:** "Customer 360 (Sales tab)" removed — no Sales tab exists. Customer 360 tabs are: Overview, Packages, Payments, Appointments.  
> **Note:** "Stock Requests → Purchase Orders" removed — fulfillment does not auto-create a PO; these are separate independent flows.  
> **Note:** "Roles → Role Detail $id" removed — no dynamic `$id` route; role editing is a sheet within the Roles page.  
> **Bug:** Customer 360 back button links to `/dashboard/customers/view?tab=registered` but the Customers View route does NOT accept a `tab` query parameter — the tab param is silently ignored.

---

## 2. Data Write → Read Dependencies

### Sales Chain

| Producer Page | Writes | Consumer Page |
|---|---|---|
| Sales Create (POS) | `sales_orders`, `sales_order_items`, staff assignments | Sale Detail |
| Sales Create (POS) | `invoices` (auto-created) | Payment View, Sale Detail |
| Sales Create (POS, package sold) | creates `package_instances` (creditsUsed=0, status=pending) — does **NOT** decrement credits; credit consumption happens at attendance/appointment completion | Package Instances |
| Sales Create (POS, promo applied) | `promotion_usages` | Promotions View (usage count) |
| Sales Create (POS, tax applied) | `payment_items` (type=tax), snapshots rate on `sales_order_items` | Sale Detail, Payment View |
| Sales Create (POS, trainer assigned) | `commission_splits` — **conditional**: only when `itemTrainerAssignments` provided; failures silently swallowed outside transaction | Commissions View |
| Refunds (create) | `refunds` (status=pending) | Refunds View |
| Refunds (approve + process) | updates `refunds.status`, restores `package_instance` credits | Package Instances, Customer 360 Packages tab |
| Cancelled Sales View | read-only, no writes | — |

### Appointment Chain

| Producer Page | Writes | Consumer Page |
|---|---|---|
| Appointments Calendar (create) | `appointments`, `appointment_clients` | Appointments Calendar, Customer 360 Appointments tab |
| Appointments Calendar (status → completed) | triggers `calculateCommissionForAppointment` → `commission_splits` (mandatory) | Commissions View |
| Appointments Calendar (cancel) | restores credits on `package_instances` | Package Instances, Customer 360 Packages tab |
| Class Slots (create/update) | `class_slots` | Class Slots list |
| Class Slots (enrollClient) | `appointments` (confirmed), `appointment_clients`, increments `class_slots.spotsBooked`, sets `isFull` if capacity reached | Appointments Calendar, Customer 360 Appointments tab, Class Slots (availability) |
| Class Slots (cancelEnrollment) | cancels `appointment_clients`, decrements `class_slots.spotsBooked`, clears `isFull` | Class Slots list, Customer 360 |
| Class Slots (cancel slot) | sets `class_slots.isCancelled = true` only — does **not** bulk-cancel enrolled appointments | Class Slots list |
| Waitlist (add) | `waitlist_entries` (status=waiting) | Class Slots (queue display) |
| Waitlist (promote) | `waitlist_entries.status = promoted`, increments `class_slots.spotsBooked` — **note:** member must still call `enrollClient` separately | Class Slots (availability) |
| Waitlist (remove) | `waitlist_entries.status = cancelled` | Class Slots (queue display) |
| Attendance (recordCheckIn) | `check_ins`, updates `package_instance.creditsUsed`, `appointment_clients.attended` | Attendance log, Customer 360 |
| Attendance (deleteCheckIn) | reverses `check_ins`, restores `package_instances.creditsUsed`, reverts `appointment_clients.attended` | Package Instances, Customer 360, Attendance log |

### Commission & Payout Chain

| Producer Page | Writes | Consumer Page |
|---|---|---|
| Appointments Calendar (status → completed) | `commission_splits` created (mandatory path) | Commissions View (All tab, Liability tab) |
| Commissions View (approve) | `commission_splits.status = approved` | Commissions View (status reflects) |
| Commissions View (markPaid) | `commission_splits.status = paid` | Commissions View (status reflects) |
| Commissions View (void) | `commission_splits.status = void` — only from `pending` or `approved` (not from `paid`) | Commissions View (status reflects) |
| Commissions View (manualAdjustment) | new `commission_splits` row (type=manual, status=pending) → appears in Liability tab `netPayableCents` | Commissions View (Liability tab) |
| Payouts (create batch) | `payouts` rows (separate from commission_splits) | Payouts View |
| Category Commission Config sheet | `category_commission_configs`, `commission_coach_slots`, `commission_tier_rates`, `commission_conditions` | Rate applied by `calculateCommissionForAppointment` on appointment completion |

> **Key distinction:** Appointment completion creates splits *mandatorily*. POS creates splits *conditionally* (trainer assigned + non-fatal). `manualAdjustment` reaches Payouts View only *after* a payout batch is created — not automatically.

### Package & Installment Chain

| Producer Page | Writes | Consumer Page |
|---|---|---|
| Package Instances (create) | `package_instances` (status=pending), installment schedule rows auto-created if multi-installment plan | Package Installments |
| Package Instances (approve) | `package_instances.status = active`, `notifications` (customer + staff notified) | Customer 360 Packages tab, Appointments (credit available), Notifications page |
| Package Instances (reject) | `package_instances.status = cancelled`, `notifications` | Customer 360, Notifications page |
| Package Installments (confirmPayment) | unlocks next credit batch on `package_instances` | Customer 360 Packages tab, Appointments (available credits) |
| Package Installments (manualUnlock) | unlocks credits early — admin-role-gated | Appointments |
| Package Installments (processRefund) | triggers refund workflow → `refunds` (pending) | Refunds View |
| Sales Create (POS) | `package_instances` when package product sold | Package Instances |
| Membership hold (apply) | `membership_holds` row created — **package_instances.status stays `active`**; hold presence blocks booking | Customer 360, Appointments (blocks booking) |
| Membership hold (release) | `membership_holds.status = completed/cancelled` — package instance status unchanged | Customer 360, Appointments |

### Inventory & Stock Chain

| Producer Page | Writes | Consumer Page |
|---|---|---|
| Products (create/update) | `products` | Sales Create (POS product selector), Purchase Orders (item selector) |
| Brands (create/update) | `brands` | Products form (brand selector), Sales Create (POS product display) |
| Inventory Categories (create/update) | `product_categories` | Products form (category selector) |
| Purchase Orders (receiveItems) | updates `purchaseOrderItems.receivedQty` + PO status only — does **NOT** create goods_receipts directly | Purchase Orders (status reflects) |
| Goods Receipts (createReceipt — separate action) | `goods_receipts`, `goods_receipt_items`, updates `product_stock` via `adjustStock` | Products (stock level), Audit Log |
| Goods Receipts (cancel) | reverses `product_stock` delta (gated on `purchase_order_management:update`) | Products (stock level) |
| Stock Requests (fulfill) | updates `product_stock` at destination branch via `adjustStock` | Products |
| Transfer Orders (markInTransit / completeTransfer) | `transfer_orders`, `transfer_order_items`, updates `product_stock` at source + destination via `adjustStock` on `completeTransfer` | Products |
| Suppliers (create/update) | `suppliers` | Purchase Orders (supplier selector), Products form |
| Units of Measure (create/update) | `units_of_measure` | Products form (UOM selector) |

> **Note:** Stock Requests and Transfer Orders are **parallel independent** stock movement mechanisms — both call `adjustStock` directly. Stock Request fulfillment does **not** create a Transfer Order.

### Access Control Chain

| Producer Page | Writes | Consumer Page |
|---|---|---|
| Roles (create, add/remove permissions) | `roles`, `role_permissions` | User Assignment (role selector) |
| User Assignment (updateRole) | `members.roleId` | All pages (RBAC scope changes) |
| User Assignment (reassignMember) | `members.hierarchyScopeId` | All pages (accessibleNodeIds recalculated), User Assignment (branch selector) |
| User Assignment (invite) | `invitations` | Invitations tab |
| Invitations (accept) | `members` row (tenant DB) + `organizationMembers` row (control panel DB) | All RBAC-gated pages (member can now log in) |
| Trainer Tiers (create/update/deactivate/reactivate) | `trainer_tiers` | Members form (tier selector), Commission calculator (rate lookup) |
| Trainer Tiers (assignToMember) | `members.trainerTierId` | Commission calculator reads tier at appointment completion → `commission_splits` |
| Branch View (create/update/move) | `hierarchy_nodes` | Stock Requests, Purchase Orders, Attendance (branch filter), User Assignment (branch selector), RBAC (accessibleNodeIds) |

### Announcements Chain

| Producer Page | Writes | Consumer Page |
|---|---|---|
| Announcements (create/update) | `announcements` | Home AnnouncementsWidget, Announcements list |
| Announcements (delete) | hard-deletes `announcements` row | Removed from AnnouncementsWidget immediately |

### Notifications Chain

| Producer / Trigger | Writes | Consumer Page |
|---|---|---|
| Package Instance → pending (on create) | `notifications` → staff notified of pending approval | Notifications page, bell widget |
| Package Instance → active (on approve/assign) | `notifications` → customer notified of package assigned | Notifications page, bell widget |
| Package Instance → cancelled (on reject) | `notifications` → customer notified of package rejected | Notifications page, bell widget |
| Notifications (markRead / markAllRead) | `notifications.isRead` | Bell widget (unread count) |
| Notification Preferences (update) | `notification_preferences` | Notifications dispatcher (gates email/SMS/push per event type) |

### Expenses Chain

| Producer Page | Writes | Consumer Page |
|---|---|---|
| Expenses (create) | `expenses.status = pending` | Expenses (pending tab), Home ClaimsWidget |
| Expenses (approve) | `expenses.status = approved` | Expenses (approved tab) |
| Expenses (reject) | `expenses.status = rejected` [terminal] | Expenses (rejected tab) |
| Expenses (markPaid) | `expenses.status = paid` [terminal] | Expenses (paid tab) |

---

## 3. Reference Data Consumption

### Settings → Transactional Pages

| Settings Page | Config | Consumed By | How |
|---|---|---|---|
| Tax Rates | `tax_rates` (default + active list) | Sales Create (POS) | Tax dropdown; auto-applied default |
| Installment Plans | `installment_plans` (premiums, numInstallments) | Sales Create (POS) | Payment plan selector |
| Installment Plans | `installment_plans` | Package Instances (create) | Plan selector; drives installment schedule rows |
| Payment Settings | gateway config | Sales Create (POS) | Payment processing |
| Organization Settings | `gracePeriodDays` | Package Instances | Late payment grace window; affects `isLocked` |
| Organization Settings | `commissionPct` | Commission split calculation | Fallback rate when no category config exists |
| Notification Preferences | `emailEnabled`, `smsEnabled`, `pushEnabled`, per-event flags | Notifications dispatcher | Gates whether appointment confirmations, payment reminders, package expiry alerts are sent |
| Google Calendar Settings | `calendarId`, `syncScope` | Appointments Calendar | Event **create** on booking, **update** on status change (including completion), **delete** on cancellation — "complete" maps to "update" sync action |

### Services / Products → Transactional Pages

| Catalog Page | Consumed By | How |
|---|---|---|
| Services | Appointments Calendar | Service selector when creating booking |
| Services | Class Slots | Service selector when creating class |
| Services | Package Instances (create) | Service selector |
| Services | Sales Create (POS) | Service line items in cart |
| Service Categories | Category Commission Config | Groups for commission rates |
| Rooms | Appointments Calendar | Room selector when creating/editing booking (`appointments.roomId`) |
| Products | Sales Create (POS) | Product line items in cart |
| Products | Purchase Orders | Line items in PO |
| Brands | Products form | Brand selector |
| Brands | Sales Create (POS) | Product display (brand label) |
| Inventory Categories | Products form | Category selector |
| Suppliers | Products form | Supplier selector |
| Suppliers | Purchase Orders | Supplier on PO header |
| UOM | Products form | Unit of measure selector |

### Customers / Members → Transactional Pages

| Page | Consumed By | How |
|---|---|---|
| Customers View | Sales Create (POS) | Customer selector (`customerType = member`) |
| Walk-in Customers | Sales Create (POS) | Customer selector (`customerType = walk_in`) — anonymous name input only; walk-in CRUD is deprecated |
| Walk-in Customers | Attendance | Drop-in combobox (`clientType = walk_in`, synthesized UUID) |
| Customers View | Appointments Calendar | Client selector |
| Customers View | Attendance | Drop-in member combobox (`clientType = member`) |
| Customers View | Class Slots (signups) | Signup list references member records |
| Trainers View | Appointments Calendar | Trainer selector per booking |
| Trainers View | Sales Create (POS) | Trainer assignment step (optional) |
| Trainer Tiers | Category Commission Config | Tier-based rate rows in commission config |
| Trainer Tiers | Members form | Tier selector when assigning trainer tier to member |

> **Walk-in Customers note:** Walk-in entity CRUD (create/update/deactivate) is deprecated — router throws `BAD_REQUEST`. Only active operation is `convertToPackage`. Walk-in data flows via `salesOrders.customerType = 'walk_in'` and `checkIns.clientType = 'walk_in'`, not via a live walk-in customer lookup. Refunds reference walk-in via the originating sale's `customerId` field, not a direct walk-in lookup.

### Promotions → POS

| Page | Consumed By | How |
|---|---|---|
| Promotions (via Service View tab) | Sales Create (POS) | Promo code validation at checkout; writes `promotion_usages` on apply |

### Category Commission Config → Commissions

| Config | Consumed By | How |
|---|---|---|
| `category_commission_configs` + `commission_coach_slots` + `commission_tier_rates` + `commission_conditions` | Appointments Calendar (on completion) | Server-side `calculateCommissionForAppointment` reads these + `members.trainerTierId` to create splits |
| Result (`commission_splits`) | Commissions View | Displayed in ledger |
| Result (`commission_splits`) | Payouts View | Basis for payout batch creation |

---

## 4. Status Lifecycles & Workflows

### Sales Order

```
[Sales Create] → draft → confirmed → completed
                              │           │
                    [cancellation]    [Refunds: separate entity]
                       cancelled      refund.pending → approved/rejected → processed
```

> Actual enum: `draft | confirmed | completed | cancelled`. There is no `refunded` status on sales orders — refunds are a separate `refunds` table. `draft` is schema default; POS writes `confirmed` directly.

### Appointment

```
[Appointments Calendar]
        pending
           │
    ┌──────┼──────────────┐
 confirmed  cancelled    no-show  ← pending can go directly to no-show
    │
    ├── completed → [commission_splits created] → Commissions View
    ├── cancelled → [credits restored] → Package Instances
    └── no-show   → [no credit restore]
```

### Commission Split

```
[Appointments Calendar: completion (mandatory) / POS: conditional]
        created (pending)
              │
    [Commissions View: approve]
           approved
              │
    [Commissions View: markPaid]
             paid  ← terminal

    [void — only from pending or approved; NOT from paid]
           void  ← terminal
```

### Payout

```
[Payouts: create batch from approved splits]
      pending
         │
   [payment initiated]
    processing
         │
    ┌────┴────┐
   paid     failed
 (terminal)    │
         [no retry procedure exists — gap]

   [from any non-terminal state]
   canceled  ← terminal
```

### Expense

```
[Expenses: create]
      pending → [Home ClaimsWidget shows count]
          │
   ┌──────┴──────┐
approved       rejected  ← terminal
   │
[Expenses: markPaid]
   paid  ← terminal
```

### Refund

```
[Refunds: create — explicit refunds.create call]
      pending
          │
   ┌──────┼──────────┐
approved  rejected  cancelled  ← pending can be cancelled before review
   │      (terminal)  (terminal)
[Refunds: process]
   processed → credits restored to package_instance (if applicable)
```

### Package Instance

```
[Package Instances: create OR Sales Create POS]
      pending  ← requires approval (package approval flow)
         │
   [approve]         [reject]
    active           cancelled  ← terminal
       │
   [membership hold: apply/release via membership_holds table]
   package_instances.status stays ACTIVE — no "paused" status in schema
   membership_holds.status: active | completed | cancelled (separate table)
       │
   [installments confirmed] → credits unlocked incrementally
   [appointments completed] → credits consumed
   [refund processed]       → credits restored
       │
   ┌───┴──────────┐
expired        exhausted / cancelled
```

> **Note:** There is no `paused` status on `package_instances`. Membership holds are tracked in a separate `membership_holds` table; the package instance remains `active` while a hold is in effect.

### Invitation

```
[User Assignment: invite]
      pending
          │
   ┌──────┼──────────┐
accepted  declined  expired
   │      (terminal)  (terminal)
   │
[members row created — tenant DB + control panel DB]
```

### Member

```
active
  │
[User Assignment: deactivate]
suspended  ← DB enum value is "suspended" (not "inactive" or "deactivated")
  │
[User Assignment: reactivate]
active
```

### Purchase Order

```
[Purchase Orders: create]
      draft
        │
   [approve]          [cancel]  ← cancellable from draft or approved only
    approved ──────────────────→ cancelled
        │              [cancel]
   [mark ordered] ──────────────→ cancelled
    ordered  ← NOT cancellable from here
        │
   [receiveItems via Goods Receipts]
 partially_received → received  ← terminal
```

### Stock Request

```
[Stock Requests: create]
      pending
          │
   ┌──────┼──────────┐
approved  rejected  cancelled  ← pending can be cancelled by requestor
   │      (terminal)  (terminal)
   │
[fulfill] → product_stock updated via adjustStock
  fulfilled  ← terminal
```

> **Note:** Schema has `cancelled` state for approved requests but **no cancel API endpoint exists** for approved stock requests. The `approved → cancelled` transition is schema-level only.

### Class Slot

```
[Class Slots: create]
      active (isFull=false stored boolean, spotsBooked=0)
         │
   [enrollClient]     → spotsBooked++; isFull=true when spotsBooked=capacity (stored)
   [cancelEnrollment] → spotsBooked--; isFull=false; isAvailable=true
   [waitlist.add]     → waitlist_entries created
   [waitlist.promote] → spotsBooked++ (member must STILL call enrollClient)
         │
   [cancel slot]
      isCancelled = true — enrolled appointments NOT auto-cancelled
```

---

## 5. Shared Entities

| Entity | Owner Page (primary writes) | Reader Pages |
|---|---|---|
| `sales_orders` | Sales Create (POS) | Sale Detail, Sales View, Cancelled Sales, Refunds, Commissions View, Customer 360 |
| `invoices` | Sales Create (POS, auto) | Payment View, Sale Detail |
| `payment_items` | Sales Create (POS, auto — tax + payment lines) | Sale Detail, Payment View |
| `promotion_usages` | Sales Create (POS, on promo apply) | Promotions View (usage count) |
| `commission_splits` | Appointments Calendar (mandatory on complete); Sales Create POS (conditional — trainer assigned only) | Commissions View (all tabs), Payouts View (via batch) |
| `payouts` | Payouts (manual batch creation) | Payouts View |
| `refunds` | Refunds (create/approve/process) | Refunds View, Audit Log |
| `appointments` | Appointments Calendar, Class Slots (enrollClient) | Customer 360, Class Slots (signups), Home widget |
| `appointment_clients` | Appointments Calendar, Class Slots (enrollClient/cancelEnrollment) | Customer 360, Attendance (check-in match) |
| `class_slots` | Class Slots (create/update/cancel) | Class Slots list |
| `waitlist_entries` | Class Slots (waitlist.add/promote/remove) | Class Slots (queue display) |
| `check_ins` | Attendance (recordCheckIn / deleteCheckIn) | Attendance log, Customer 360 |
| `package_instances` | Package Instances (create/approve/reject), Sales Create (POS) | Customer 360 Packages tab, Appointments (credit check), Refunds (credit restore), Package Installments |
| `installments` | Package approval flow (auto-created), Installments (confirmPayment/manualUnlock) | Customer 360 (installments tab), Package Installments page |
| `installment_events` | Installment service operations | `installmentsRouter.getEvents` |
| `membership_holds` | Membership hold (apply/release) | Customer 360, Package Instances (hold state; package status stays active) |
| `households` | Customer 360 (create/link) | Customer 360, Customers View |
| `expenses` | Expenses | Home ClaimsWidget |
| `announcements` | Announcements | Home AnnouncementsWidget |
| `notifications` | System-generated (package pending/approved/rejected, payment due) | Notifications page, bell widget |
| `notification_preferences` | Notification Preferences settings | Notifications dispatcher |
| `invitations` | User Assignment (invite), Invitations tab (resend/revoke) | Invitations tab, Accept Invitation route |
| `member_profiles` | `member-profiles` router (gated on `user_management` permission — NOT trainer-specific) | Appointments Calendar (trainer display name), Trainers page |
| `hierarchy_nodes` | Branch View | Stock Requests, Purchase Orders, Attendance, User Assignment (branch selector), all RBAC-scoped pages |
| `members` | User Assignment (invite/deactivate/role), Trainer Tiers (assignToMember) | Appointments, Class Slots, Commissions, Payouts, Customers View, Attendance |
| `trainer_tiers` | Trainer Tiers settings page (create/update/deactivate/reactivate) | Members form (tier selector), Commission calculator (rate lookup) |
| `roles` / `role_permissions` | Roles | User Assignment, all permission-gated pages |
| `tax_rates` | Settings → Tax Rates | Sales Create (POS, rate lookup + snapshot) |
| `installment_plans` | Settings → Installment Plans | Package Instances, Sales Create (POS) |
| `promotions` | Promotions (via Service View tab) | Sales Create (POS, promo validation) |
| `rooms` | Service View (Rooms tab) — gated on `appointments` permission in backend | Appointments Calendar (room selector) |
| `products` | Products | Sales Create (POS), Purchase Orders, Stock Requests |
| `brands` | Inventory Options / Brands tab | Products form, Sales Create (POS product display) |
| `product_categories` | Inventory Options / Categories tab | Products form |
| `suppliers` | Inventory Options / Suppliers tab | Purchase Orders, Products form |
| `units_of_measure` | Settings → UOM | Products form |
| `goods_receipts` / `goods_receipt_items` | Goods Receipts (createReceipt — separate from `purchaseOrders.receiveItems`) | Products (stock level), Audit Log |
| `transfer_orders` / `transfer_order_items` | Transfer Orders | Products (stock level at both branches), Audit Log |
| `services` | Services (via Service View tab) | Appointments, Class Slots, Package Instances, Sales Create (POS) |
| `category_commission_configs` | Category Commission Config (sheet on Services page) | Commission calculator on appointment completion |

---

## 6. Permission Gating

| Permission Resource | Pages / Actions Gated |
|---|---|
| `role_management` | Roles (create/update/delete roles, add/remove permissions), User Assignment (role tabs) |
| `appointment_management` | Appointments Calendar (create/update status), Class Slots (create/update/cancel/enroll/waitlist), Rooms CRUD (create/update/delete — **backend enforces `appointments` permission even though Rooms UI lives on Service View tab**) |
| `attendance_management` | Attendance (recordCheckIn, deleteCheckIn) |
| `sales` | Sales View, Sale Detail, Cancelled Sales, Payment View |
| `pos` | Sales Create (POS) — separate from `sales` read |
| `refund_management` | Refunds (create, approve, reject, process) |
| `customer_management` | Customers View (edit profile), Customer 360, Households (create/link/unlink) |
| `walk_in_customer_management` | Walk-In Customers — **only active action: `convertToPackage`** (create/update/deactivate are deprecated and throw `BAD_REQUEST`) |
| `commission_management` | Commissions View (All Commissions tab, approve, markPaid, void, manualAdjustment) |
| `category_commission_management` | Category Commission Config sheet (create/update configs, tier rates, conditions) |
| `commission_payout` | Commissions View (Liability tab), Payouts View |
| `trainer_tier_management` | Trainer Tiers settings page (create/update/deactivate/reactivate/assignToMember) |
| `inventory` | Products (create/update), Brands (create/update), Product Categories (create/update), Suppliers (create/update), UOM (create/update), Stock Requests (create/approve/reject/fulfill), Transfer Orders (create/markInTransit/completeTransfer/cancel), Goods Receipts (post/cancel) — **note:** resource string in code is `inventory`, not `inventory_management` |
| `purchase_order_management` | Purchase Orders (create, approve, receive, cancel), Goods Receipts cancel |
| `service_management` | Services (create/update), Service Categories (create/update), Package Instances (create/approve/reject), Installments (confirmPayment — note: manualUnlock/processRefund/adjustCredits are **admin-role-gated**, not permission-resource-gated) |
| `expense_management` | Expenses (create, approve, reject, markPaid) |
| `promotion_management` | Promotions page (create/update/deactivate) |
| `announcement_management` | Announcements (create, update, delete) |
| `notification_management` | Notifications page (markRead, markAllRead, delete), Notification Preferences (update) |
| `payments` | Payment View (`invoices.list`, `invoices.get` procedures — gated on `payments` resource in invoices router) |
| `audit_log` | Audit Log (read) |
| `reports` | Analytics/reporting pages, dashboard KPI exports |
| Admin-only (role check, no RBAC resource) | Organization Settings (edit), Tax Rates (create/update), Installment Plans (edit), Package Installments advanced actions (manualUnlock/processRefund/adjustCredits), Platform Admin pages |

**RBAC scope note:** `member.hierarchyScopeId` + `getDescendantNodeIds` → `accessibleNodeIds` in request context. Admin role bypasses scope (sees all nodes). All list queries filter by `accessibleNodeIds`.

**Permission–UI mismatch:** Rooms UI lives on `/dashboard/service/view?tab=rooms` (Service View), suggesting `service_management`. The backend router (`rooms.ts`) enforces `appointments` permission. These are misaligned — fix should standardize on one or the other.

**Tax/Installment POS read gap:** Tax Rates and Installment Plans are admin-only write, but POS must read them for all staff. Verify POS fetch uses system-level query bypassing RBAC, or add explicit `read` actions to these resources for staff roles.

---

## 7. Redirect Stubs

### Tab redirects (consolidated into tabbed pages)

| Legacy Route | Redirects To |
|---|---|
| `/dashboard/brands/view` | `/dashboard/inventory-options?tab=brands` |
| `/dashboard/categories/view` | `/dashboard/inventory-options?tab=categories` |
| `/dashboard/suppliers/view` | `/dashboard/inventory-options?tab=suppliers` |
| `/dashboard/memberships/view` | `/dashboard/packages/view?tab=memberships` |
| `/dashboard/packages/instances/view` | `/dashboard/packages/view?tab=session-packs` |
| `/dashboard/packages/installments/view` | `/dashboard/packages/view?tab=installments` |
| `/dashboard/commissions/my` | `/dashboard/commissions/view?tab=mine` |
| `/dashboard/access-control/permissions` | `/dashboard/access-control/roles?tab=permissions` |
| `/dashboard/access-control/invitations` | `/dashboard/access-control/user-assignment?tab=invitations` |
| `/dashboard/role/view` | `/dashboard/access-control/roles?tab=roles` |
| `/dashboard/service-category/view` | `/dashboard/service/view?tab=categories` |
| `/dashboard/transfer-orders/view` | `/dashboard/stock-requests/view?tab=transfers` |
| `/dashboard/uom-conversions/view` | `/dashboard/uom/view?tab=conversions` |
| `/dashboard/customers/walk-in/view` | `/dashboard/customers/view?tab=registered` |

### Service management consolidation (redirects into Services page)

| Legacy Route | Redirects To | Note |
|---|---|---|
| `/dashboard/promotions/view` | `/dashboard/service/view?tab=promotions` | Promotions managed under Services |
| `/dashboard/rooms/view` | `/dashboard/service/view?tab=rooms` | Rooms managed under Services |

### Sales consolidation

| Legacy Route | Redirects To |
|---|---|
| `/dashboard/cancelled-sales/view` | `/dashboard/sales/view` |

> **Note:** `/dashboard/payment/view` is a real page (not a redirect). Reads `invoices.list`, renders invoice payment table, links to Sale Detail via `salesOrderId`.

---

## 8. Home Dashboard Aggregations

| Widget | Reads From | Links To |
|---|---|---|
| KPI — Total Sales | `analytics.getDashboardKpis` → `salesOrders` (sum) | Sales View |
| KPI — Appointments | `analytics.getDashboardKpis` → `appointments` (totalAppointments + completedAppointments — **check_ins NOT included**) | Appointments Calendar |
| KPI — Active Members | `analytics.getDashboardKpis` → `members` (active count) | `/dashboard/memberships/view` (redirects to Packages/Memberships tab) — **not** Customers View |
| Revenue by Branch | `analytics.getDashboardKpis` → `hierarchyNodes` (branch breakdown) | — |
| Staff Performance | `analytics.getStaffPerformance` → `completedAppointments` count + `totalCommission` cents — top-10 sorted **client-side** (`.sort().slice(0,10)`), no DB LIMIT | — |
| AppointmentsWidget | `appointments.list` — queries **today only** (not 7 days ahead) | Appointments Calendar |
| ExpiringMembershipsWidget | `packageInstances.listExpiring` (expiring soon) | Customer 360 (links to `/dashboard/customers/view?customerId=...`) |
| AnnouncementsWidget | `announcements.listActive` | — (no outbound link) |
| ClaimsWidget | `expenses.list` (status: pending) | — (no outbound link) |
| PayrollWidget | `payouts.list` — **not** commissionSplits; fetches payout records | Commissions View |

---

## 9. Full Dependency Chain Diagrams

### Complete Sales & Finance Chain

```
Settings (Tax Rates, Installment Plans, Payment)
Promotions ─────────────────────────────────────────┐
Services / Products / Brands ───────────────────────┤
Walk-in Customers (anonymous input only) ───────────┤
Customers ──────────────────────────────────────────┴──▶ Sales Create (POS)
Trainers (optional assignment) ────────────────────────────────│
                                                               │
              ┌────────────────────────────────────────────────┼──────────────────┬──────────────────────┐
              ▼                                                ▼                  ▼                      ▼
       Sale Detail                                    Payment View     Commission Splits           Package Instances
              │                                     (→ Sale Detail)   (only if trainer            (credit decrement
              ▼                                                         assigned; non-fatal)        on package debit)
        Refunds ──────────┐
              │           │
              ▼           ▼
    Package Instances  Audit Log
    (credits restored)
    
    Commission Splits → Commissions View → [payout batch] → Payouts View
```

### Complete Appointment & Commission Chain

```
Services ──────────────────────────────┐
Rooms ──────────────────────────────── ┤
Trainers ──────────────────────────────┤
Package Instances (credit balance) ────┴──▶ Appointments Calendar
                                                      │
                          ┌───────────────────────────┼──────────────────────────┐
                          ▼                           ▼                          ▼
                   Customer 360            Commission Splits               Attendance
                   (appt history)          (mandatory on complete)     (check_ins — NOT fed to KPIs)
                                                      │
                                               Commissions View
                                          approve → markPaid → [void if needed]
                                                      │
                                              [payout batch]
                                              Payouts View
```

### Class Slots Chain

```
Services ──────────────────────────────┐
Members (trainers/instructors) ─────────┴──▶ Class Slots
                                                  │
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                         Waitlist           enrollClient          cancel slot
                    (add/promote/remove)   (appointments       (isCancelled=true;
                              │             created)        enrolled appts NOT touched)
                              ▼                   │
                     promote → member must    Appointments Calendar
                     still call enrollClient  Customer 360 (appt history)
                                              [separate check-in step in Attendance]
```

### Inventory & Stock Chain

```
Suppliers ───────────┐
Brands / Categories ─┤
UOM ─────────────────┤
                     ▼
                  Products ──────────────────────────────┐
                     │                                   │
                     ├──▶ Purchase Orders (restock)      ├──▶ Sales Create (POS)
                     │         │                         │         │
                     │    receiveItems                   │    Sale Detail
                     │    → Goods Receipts
                     │    → product_stock updated
                     │
                     ├──▶ Stock Requests (inter-branch)
                     │    → adjustStock (independent)
                     │
                     └──▶ Transfer Orders (inter-branch)
                              markInTransit → completeTransfer
                              → adjustStock at source + destination (independent)

Note: Stock Requests and Transfer Orders are PARALLEL flows — neither creates the other.
```

### Package & Installment Chain

```
Services ──────────────────────────────┐
Installment Plans (Settings) ──────────┴──▶ Package Instances (create → status=pending)
                                                       │
                                              [package approval flow]
                                              approved → active
                                              rejected → cancelled
                                              notifications → Notifications page (staff + customer)
                                                       │
                                            auto-creates installment rows
                                                       │
                                              Package Installments
                                              confirmPayment → credits unlock
                                              manualUnlock   → credits unlock [admin-only]
                                              processRefund  → Refunds workflow
                                                       │
                                          [membership hold]
                                          membership_holds row created/released
                                          package_instances.status stays active
                                                       │
                                          Customer 360 (Packages tab) reflects state
                                          Appointments (credit check uses current balance)
```

### Access Control & RBAC Chain

```
Branch View (hierarchy_nodes tree)
        │
        ▼
User Assignment (hierarchyScopeId per member)
        │
        ├──▶ getDescendantNodeIds → accessibleNodeIds in context
        │            └──▶ Every page query scoped to accessibleNodeIds
        │
        └──▶ Roles (role_permissions)
                     └──▶ Permission checks on every route + action

Invitations flow:
User Assignment → invitations.create → email sent
                        │
                   invitations.accept
                        │
               members row created (tenant)
               + organizationMembers (control panel)
                        │
               member can log in + RBAC applies

Trainer Tiers:
Trainer Tiers page → trainer_tiers
        ├──▶ Members form (tier selector)
        └──▶ assignToMember → members.trainerTierId
                                    │
                         commission calculator reads at appointment completion
                                    │
                         commission_splits (tier rate snapshotted)
```

### Settings Dependency Fan-Out

```
Settings
    ├── Tax Rates ──────────────────────▶ Sales Create (POS, tax dropdown + snapshot)
    ├── Installment Plans ──────────────▶ Sales Create (POS, payment plan)
    │                                  ▶ Package Instances (plan selector)
    ├── Payment Settings ───────────────▶ Sales Create (POS, gateway)
    ├── Organization Settings ──────────▶ Package Instances (gracePeriodDays → isLocked)
    │                                  ▶ Commission calc (commissionPct fallback)
    ├── Google Calendar ───────────────▶ Appointments
    │                                    create  → Calendar event CREATE
    │                                    update  → Calendar event UPDATE (incl. completion)
    │                                    cancel  → Calendar event DELETE
    └── Notification Preferences ───────▶ Notifications dispatcher
                                        ▶ Appointments (booking reminders/confirmations)
                                        ▶ Package Installments (payment due alerts)
                                        ▶ Package Instances (expiry alerts)

Trainers section (not Settings):
    Trainer Tiers ──────────────────────▶ Commission Splits (tier-based rate lookup)
                                        ▶ Members form (tier assignment selector)
```

### Notifications Trigger Chain

```
Package Instance → pending     ──▶ notifyStaffOfPendingPackage  ──▶ Notifications page (staff)
Package Instance → active      ──▶ notifyCustomerPackageAssigned ──▶ Notifications page (customer)
Package Instance → cancelled   ──▶ notifyCustomerPackageRejected ──▶ Notifications page (customer)
[future: appointment confirm, payment due — not yet wired]
```

### Expenses Chain

```
[Expenses: create]
      pending → Home ClaimsWidget (count)
          │
   ┌──────┴──────┐
approved       rejected ← terminal
   │
[markPaid]
   paid ← terminal
```

---

## 10. Schema-Level Entities With No Confirmed Page Coverage

Tables verified in `packages/db/src/schema/tenant/` but with no confirmed UI page or documented relationship. Split into: **feature exists in DB, UI unknown** vs **clearly missing page**.

### Scheduling & Availability (trainer settings — no settings page documented)

| Table | FKs | Implied Feature | Status |
|---|---|---|---|
| `trainer_availability` | `trainerId → members` | Trainer weekly availability grid | No page found |
| `coach_intake_availability` | `trainerId → members` | Intake session slots per trainer | No page found |
| `coach_intake_exceptions` | `trainerId → members` | Block-out dates for intake | No page found |
| `preferred_times` | `packageInstanceId → package_instances` | Customer scheduling preferences per package | No page found |

### Per-Member Buffer Overrides (no page documented)

| Table | FKs | Implied Feature |
|---|---|---|
| `member_category_buffer_overrides` | `memberId → members`, `categoryId → serviceCategories` | Override buffer time per trainer per service category |
| `member_service_buffer_overrides` | `memberId → members`, `serviceId → services` | Override buffer time per trainer per service |

> These suggest a trainer-specific buffer settings panel — possibly hidden in Members/Trainers detail or Service Categories config. No confirmed UI.

### Service / Category Configuration

| Table | FKs | Implied Feature |
|---|---|---|
| `service_category_config` | `categoryId → serviceCategories` | Booking rules (capacity, buffer, cancellation policy) per category |
| `service_members` | `serviceId → services`, `memberId → members` | Trainer-to-service assignment junction — which trainers can deliver which services |

### Per-Branch Pricing Overrides (no page documented)

| Table | FKs | Implied Feature |
|---|---|---|
| `service_prices` | `serviceId → services`, `branchId (optional) → hierarchyNodes` | Per-branch / per-customer-type service price overrides |
| `product_prices` | `productId → products`, `branchId (optional) → hierarchyNodes` | Per-branch / per-customer-type product price overrides |

> POS likely reads these at checkout. No settings page to manage them is documented.

### Multi-Staff Appointment / Package Assignment

| Table | FKs | Implied Feature |
|---|---|---|
| `appointment_staff` | `appointmentId → appointments`, `staffId` (text) | Multiple staff members per appointment booking |
| `package_instance_staff` | `packageInstanceId → package_instances`, `staffId` (text) | Multiple trainers assigned to a package instance |
| `recurrence_rules` | `appointmentId → appointments` | Recurring appointment series |

> These suggest richer Appointments Calendar features (recurring bookings, multi-trainer appointments) with no confirmed UI.

### Announcement Scoping

| Table | FKs | Implied Feature |
|---|---|---|
| `announcement_scopes` | `announcementId → announcements`, `branchId → hierarchyNodes` | Per-branch targeting for announcements |

> Announcements page creates announcements but no branch-scoping UI is documented.

### Supplier Invoice Reconciliation (no page documented)

| Table | FKs | Implied Feature |
|---|---|---|
| `supplier_invoices` | `supplierId → suppliers`, `purchaseOrderId (optional) → purchaseOrders`, `goodsReceiptId (optional) → goodsReceipts` | 3-way match: PO ↔ goods receipt ↔ supplier invoice reconciliation |

### Payment Infrastructure

| Table | FKs | Implied Feature |
|---|---|---|
| `partner_stripe_accounts` | `partnerId` (text, cross-DB, no FK) | Stripe Connect onboarding for payout partners — no settings page documented |
| `payout_batches` | `branchId (optional) → hierarchyNodes`, `createdBy` (text) | Payout batch grouping — Payouts View creates batches but `payout_batches` table not explicitly documented as the batch container |

### Status History Tables (no timeline UI documented)

These tables exist and are presumably written on every status transition, but no page displays them:

| Table | FK | Implied Reader |
|---|---|---|
| `appointment_status_history` | `appointmentId → appointments` | Appointment detail — status change timeline |
| `sales_order_status_history` | `salesOrderId → salesOrders` | Sale Detail — status change timeline |
| `package_instance_status_history` | `packageInstanceId → packageInstances` | Package Instances — approval/rejection history |
| `payment_status_history` | `paymentId → payments` | Payment View — payment status timeline |

### Observability / Logging Tables

| Table | Key Column | Purpose | Page |
|---|---|---|---|
| `user_activity_log` | `userId` (text, no FK) | Customer activity feed (bookings, credit use) | Possibly Customer 360 recent activity — not documented |
| `ghl_sync_events` | — (logging only) | GoHighLevel webhook sync log | No page documented |
