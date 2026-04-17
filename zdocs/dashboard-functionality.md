# Avantej Core - Dashboard Functionality & User Flows

> Complete reference for all dashboard features in `apps/web`, organized by sidebar section.
> Each entry describes what the user sees, what actions they can take, and the data flow behind it.

---

## Table of Contents

1. [Dashboard Home](#1-dashboard-home)
2. [Trainers](#2-trainers)
3. [Branches](#3-branches)
4. [Services](#4-services)
5. [Appointments](#5-appointments)
6. [Packages](#6-packages)
7. [Customers](#7-customers)
8. [Sales](#8-sales)
9. [Payments & Invoices](#9-payments--invoices)
10. [Promotions](#10-promotions)
11. [Purchase Orders](#11-purchase-orders)
12. [Inventory](#12-inventory)
13. [Finance](#13-finance)
14. [Access Control](#14-access-control)
15. [User Management](#15-user-management)
16. [Communications](#16-communications)
17. [My Services (Staff/Trainer)](#17-my-services-stafftrainer)
18. [Settings](#18-settings)
19. [Sidebar & Navigation](#19-sidebar--navigation)
20. [Common Patterns](#20-common-patterns)
21. [Testing Status](#21-testing-status)

---

## 1. Dashboard Home

**Route:** `/dashboard`
**File:** `routes/_authenticated/dashboard/_layout/index.tsx`

### What the User Sees

- **Greeting banner** with the logged-in user's name and quick-action buttons
- **Period filter pills** — Today, This Week, This Month, This Year — controlling all KPI data
- **KPI Cards:**
  - Sales Overview: total revenue in RM + order count for the selected period
  - Appointments: total count + completed count + completion-rate progress bar
  - Active Members: current member count
- **Analytics Section:**
  - Revenue by Branch table (branch name, revenue, order count)
  - Staff Performance table (top 10 staff by appointments completed, commission totals)
- **Activity Section:**
  - Appointments widget (upcoming/recent)
  - Announcements widget (active org-wide announcements)
- **Team Section:**
  - Payroll widget
  - Claims widget (pending expense claims)

### User Flow

```
User lands on /dashboard after login
  → Period pills default to "This Month"
  → KPI cards load via client.analytics.getDashboardKpis({ period })
  → Staff performance loads via client.analytics.getStaffPerformance({ period })
  → Widgets load independently (announcements, claims)
  → User clicks a period pill → all cards/tables refresh
  → User clicks a sidebar link → navigates to that section
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.analytics.getDashboardKpis()` | KPI card data |
| `client.analytics.getStaffPerformance()` | Staff performance table |
| `client.announcements.listActive()` | Announcements widget |
| `client.expenses.list({ status: "pending" })` | Claims widget |

---

## 2. Trainers

**Route:** `/dashboard/trainers/view`
**File:** `routes/_authenticated/dashboard/_layout/trainers/view.tsx`

### What the User Sees

- **Search bar** filtering by name, email, or specialization
- **"Add Trainer" button** opening a creation sheet
- **DataTable columns:** Display Name, Email (copyable), Specialization, Phone (copyable), Status (Active/Suspended)

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create Trainer** | "Add Trainer" button | Sheet with: Email (must be existing user), Hierarchy Scope (location dropdown), optional profile fields (Display Name, Specialization, Phone, Bio, Certifications) |
| **Edit Trainer** | Row action menu | Same sheet + Weekly Availability Editor (day-by-day time slots) + Service Buffer Times (per-service buffer override) |
| **Suspend** | Row action menu | Confirms, then suspends the trainer |
| **Reactivate** | Row action menu (suspended trainers) | Restores active status |

### User Flow

```
Admin opens Trainers page
  → DataTable loads all members with trainer role
  → Admin searches for a trainer by name
  → Admin clicks "Add Trainer" → fills email + hierarchy scope → saves
  → API creates member record + profile
  → Admin clicks Edit on existing trainer
  → Expands "Weekly Availability" → sets Mon-Fri 9am-6pm
  → Expands "Service Buffer Times" → sets 15min buffer for "PT Session"
  → Saves → availability and buffer times persist
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.members.list()` | Trainer list |
| `client.memberProfiles.get()` | Profile details for edit |
| `client.members.create()` | Create new trainer |
| `client.memberProfiles.upsert()` | Save profile changes |
| `client.members.suspend()` | Suspend trainer |
| `client.members.reactivate()` | Reactivate trainer |
| `client.serviceMembers.listForMember()` | Services assigned to trainer |
| `client.serviceMembers.updateBuffer()` | Update buffer time per service |

---

## 3. Branches

### 3a. View Branches

**Route:** `/dashboard/branch/view`
**File:** `routes/_authenticated/dashboard/_layout/branch/view.tsx`

### What the User Sees

- **DataTable columns:** Branch Name, Area, Region, Country, Address, Person In Charge, Status
- Hierarchical data showing the org's geographic structure

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Edit Branch** | Row action | Dialog with: Branch name, cascading Country→Region→Area dropdowns, Address, Person In Charge (member selector), Member reassignment section |
| **Delete Branch** | Row action | Confirmation dialog; fails if branch has active members |
| **Move Branch** | Row action | Move branch to a different area in the hierarchy |

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.hierarchy.listNodes()` | Full hierarchy tree |
| `client.hierarchy.updateNode()` | Edit branch details |
| `client.hierarchy.moveNode()` | Move branch to different parent |
| `client.hierarchy.deleteNode()` | Delete branch |

### 3b. Create Branch

**Route:** `/dashboard/branch/create`
**File:** `routes/_authenticated/dashboard/_layout/branch/create.tsx`

### What the User Sees

- **4-step wizard form:** Country → Region → Area → Branch
- Each step shows existing options or allows creating new
- Sidebar card explaining "How it works" with permissions info

### User Flow

```
Admin clicks "Create Branch" in sidebar
  → Step 1: Select or create Country
  → Step 2: Select or create Region under that Country
  → Step 3: Select or create Area under that Region
  → Step 4: Enter Branch Name, Address, assign Person In Charge
  → Submit → hierarchy nodes created at each new level
  → Redirect to Branch View
```

---

## 4. Services

### 4a. Services

**Route:** `/dashboard/service/view`
**File:** `routes/_authenticated/dashboard/_layout/service/view.tsx`

### What the User Sees

- **DataTable** of all services with CRUD actions
- Category filter available
- Create/Edit managed through DataTable component's built-in sheets

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.services.list()` | Service list |
| `client.serviceCategories.list()` | Category filter data |

> **Known Bug:** Price is formatted as USD instead of MYR.

### 4b. Service Categories

**Route:** `/dashboard/service-category/view`
**File:** `routes/_authenticated/dashboard/_layout/service-category/view.tsx`

### What the User Sees

- **DataTable** of service categories with CRUD actions
- DataTable component self-fetches edit data when a row is selected

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.serviceCategories.list()` | Category list |

---

## 5. Appointments

### 5a. Appointment Calendar

**Route:** `/dashboard/appointment/view`
**File:** `routes/_authenticated/dashboard/_layout/appointment/view.tsx`

### What the User Sees

- **Calendar view** with monthly/weekly toggle
- **Admin view:** Trainer sidebar to filter appointments by trainer; sees all appointments within accessible hierarchy scope
- **Trainer view:** Title shows "My Schedule"; sees only own appointments
- Clicking an appointment opens a detail modal with client name, service, time

### User Flow

```
Admin opens Appointments
  → Calendar loads current month's appointments
  → Admin clicks a trainer name in sidebar → calendar filters to that trainer
  → Admin clicks an appointment block → detail modal opens
  → Shows: client name, service, time, status
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.appointments.list()` | Appointment data for calendar |

### 5b. Class Slots

**Route:** `/dashboard/appointment/class-slots/view`
**File:** `routes/_authenticated/dashboard/_layout/appointment/class-slots/view.tsx`

### What the User Sees

- **Filters:** Service dropdown, Date range (From/To), "Show available only" checkbox
- **"New Class Slot" button**
- **DataTable columns:** Date, Service, Time (start-end), Instructor, Location, Capacity, Booked, Available, Status badge (Available/Full/Cancelled)

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create** | "New Class Slot" button | Sheet: Service (dropdown), Branch ID (text), Date, Start Time, End Time, Capacity, Instructor (optional), Location (optional) |
| **Edit** | Row action | Sheet: Start Time, End Time, Capacity, Instructor, Location |
| **Cancel Class** | Row action | Dialog with optional cancellation reason |

### Status Workflow

```
Available → Full (automatic when booked = capacity)
Available/Full → Cancelled (manual via cancel action)
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.classSlots.list()` | Filtered class slot list |
| `client.classSlots.create()` | Create slot |
| `client.classSlots.update()` | Edit slot |
| `client.classSlots.cancel()` | Cancel slot |

---

## 6. Packages

### 6a. Package Instances

**Route:** `/dashboard/packages/instances/view`
**File:** `routes/_authenticated/dashboard/_layout/packages/instances/view.tsx`

### What the User Sees

- **Status filter tabs:** All, Active, Expired, Exhausted, Cancelled
- **DataTable columns:** Service (copyable), Client ID (copyable, truncated to 8 chars), Source badge (Assigned/Purchased), Credits Used/Total, Remaining, Total Price (RM), Starts, Expires, Status badge

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Assign Package** | Create button | Sheet: Package (dropdown of active services with sessionCount), Client ID (UUID), Source (Assigned by staff / Purchased by client), Credits (>=1), Start Date, Expiry Date, Total Price (RM, optional), Payment Status (pending/paid/failed/refunded), Remark |

### Status Workflow

```
Active → Expired (when expiry date passes)
Active → Exhausted (when all credits used)
Active → Cancelled (manual)
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.packageInstances.listAll()` | Package instance list |
| `client.packageInstances.create()` | Create/assign package |
| `client.services.list()` | Package dropdown data |

### 6b. Installments

**Route:** `/dashboard/packages/installments/view`
**File:** `routes/_authenticated/dashboard/_layout/packages/installments/view.tsx`

### What the User Sees

- **Status filter tabs:** All, Active, Overdue, Locked
- **DataTable columns:** Client ID, Plan Type badge, Credits (unlocked/total), Progress (paid/total installments), Next Due Date, Status badge

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **View Details** | Row click | Detail sheet showing: Plan Type, Status, Credits breakdown, Progress bar, Next Due Date, Lock Reason (if locked) |
| **Confirm Payment** | Per-installment button | Dialog: Payment Method (Manual Transfer/Cash), Notes, Override Next Interval (days) |
| **Manual Unlock** | Detail sheet action | Dialog: Reason (required, for audit trail) |
| **Process Refund** | Detail sheet action | Dialog showing suggested refund calculation (paid amount, credits used/unlocked, unused credit value, suggested refund), editable Refund Amount (RM), Reason (required) |

### Status Workflow

```
Active → Overdue (missed payment past grace period)
Overdue → Locked (continued non-payment)
Locked → Active (via Manual Unlock with reason)
Any → Refunded (via Process Refund)
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.installments.adminOverview()` | Overview list |
| `client.installments.listByPackageInstance()` | Individual installments |
| `client.installments.confirmPayment()` | Record payment |
| `client.installments.manualUnlock()` | Unlock locked package |
| `client.installments.processRefund()` | Process refund |
| `client.installments.suggestRefund()` | Calculate suggested refund |

---

## 7. Customers

### Walk-in Customers

**Route:** `/dashboard/customers/walk-in/view`
**File:** `routes/_authenticated/dashboard/_layout/customers/walk-in/view.tsx`

### What the User Sees

- **Search bar** filtering by name, email, or phone
- **"Add Customer" button**
- **DataTable columns:** Name, Phone (copyable), Email (copyable), Branch, Date Added, Status (Active/Inactive)

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create** | "Add Customer" button | Sheet with sections: **Basic Info** (Name*, Phone, Email, DOB, Gender), **Location** (Branch ID, Address), **Emergency Contact** (collapsible: Contact Name, Contact Phone), **Health Notes** (collapsible: Medical Notes, General Notes) |
| **Edit** | Row action | Same sheet; Emergency/Health sections auto-expand if data exists |
| **Deactivate** | Row action (active only) | Confirmation then deactivate |

### User Flow

```
Staff opens Walk-in Customers
  → Searches for customer by phone number
  → Not found → clicks "Add Customer"
  → Fills: Name, Phone, Branch ID
  → Optionally expands Emergency Contact section → fills contact info
  → Saves → customer appears in list
  → Later: clicks Edit → updates address or health notes
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.walkInCustomers.list()` | Customer list |
| `client.walkInCustomers.create()` | Create customer |
| `client.walkInCustomers.update()` | Update customer |
| `client.walkInCustomers.deactivate()` | Deactivate customer |

---

## 8. Sales

### 8a. Sales Orders

**Route:** `/dashboard/sales/view`
**File:** `routes/_authenticated/dashboard/_layout/sales/view.tsx`

### What the User Sees

- **DataTable columns:** Date, Sales Order #, Total Sales (RM), Customer Name, Created By
- Read-only list of all sales orders

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **View** | Row action | Currently a `console.log` stub (non-functional) |
| **Edit** | Row action | Currently a `console.log` stub (non-functional) |

> **Known Limitation:** The Sales Detail page (`/dashboard/sales/$id`) is only reachable by typing the URL directly.

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.salesOrders.list()` | Sales order list |

### 8b. Sales Order Detail

**Route:** `/dashboard/sales/$id`
**File:** `routes/_authenticated/dashboard/_layout/sales/$id.tsx`

### What the User Sees

- **Order summary card:** Total amount (RM), Customer name, Created by, Customer type, Notes
- **Status badge** with color coding: draft, pending, confirmed, completed, paid, partially_paid, sent, cancelled, rejected, overdue
- **Related invoices section:** Invoice number, amount, status for each linked invoice
- **Back button** to sales list

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.salesOrders.getById()` | Order details |
| `client.invoices.list()` | Related invoices |

### 8c. Cancelled Sales

**Route:** `/dashboard/cancelled-sales/view`
**File:** `routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx`

### What the User Sees

- Read-only DataTable of cancelled sales orders
- Errors silently return an empty array (no error UI)

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.salesOrders.list({ status: "cancelled" })` | Cancelled orders |

---

## 9. Payments & Invoices

**Route:** `/dashboard/payment/view`
**File:** `routes/_authenticated/dashboard/_layout/payment/view.tsx`

### What the User Sees

- **DataTable columns:** Date, Invoice #, Sales Order, Payment Mode, Total Paid (RM), Customer Name, Created By, E-Invoice Status
- Read-only invoice/payment ledger

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **View** | Row action | Stub (non-functional) |
| **Edit** | Row action | Stub (non-functional) |

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.invoices.list()` | Invoice list |

---

## 10. Promotions

**Route:** `/dashboard/promotions/view`
**File:** `routes/_authenticated/dashboard/_layout/promotions/view.tsx`

### What the User Sees

- **DataTable columns:** Code (copyable), Name, Type badge (Percentage/Fixed Amount/Free Item/Buy X Get Y), Value (formatted per type), Valid From, Valid Until, Usage (count/limit), Status badge

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create** | "New Promotion" button | Sheet: Code* (uppercase, 3+ chars, alphanumeric/hyphen/underscore), Name*, Description, Type* (percentage/fixed_amount/free_item/buy_x_get_y), Value* (stored as basis points x100), Min Order Amount (RM), Usage Limit, Per Customer Limit (default 1), Valid From* (datetime), Valid Until (datetime, optional) |
| **Edit** | Row action | Sheet: Only Name, Description, Valid From, Valid Until are editable (Code and Type are immutable after creation) |
| **Deactivate** | Row action | Confirmation dialog |

### Value Display Logic

| Type | Storage | Display |
|------|---------|---------|
| Percentage | basis points (e.g., 1000) | 10% |
| Fixed Amount | cents (e.g., 500) | RM 5.00 |
| Free Item | raw number | "1" |
| Buy X Get Y | raw number | "2" |

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.promotions.list()` | Promotion list |
| `client.promotions.create()` | Create promotion |
| `client.promotions.update()` | Update promotion |
| `client.promotions.deactivate()` | Deactivate promotion |

---

## 11. Purchase Orders

**Route:** `/dashboard/purchase-orders/view`
**File:** `routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx`

### What the User Sees

- **DataTable columns:** PO #, Supplier ID, Branch, Order Date, Expected Delivery, Total (RM), Status badge

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create** | "New PO" button | Sheet: Supplier* (dropdown), Branch ID* (text), Order Date (default today), Expected Delivery, Notes. **Line Items section:** Product (dropdown), Qty, Unit Cost (RM) with add/remove + running total |
| **Approve** | Row action (draft only) | Confirms, transitions to Approved |
| **Receive Items** | Row action (approved/ordered/partial) | Dialog showing per-item: ordered qty, received qty, remaining; enter received quantities |
| **Cancel** | Row action (draft/approved) | Confirmation dialog |

### Status Workflow

```
Draft → Approved → Ordered → Partially Received → Received
  ↓         ↓
Cancelled  Cancelled
```

### User Flow

```
Admin creates PO → selects supplier, adds line items with products and quantities
  → Saves as Draft
  → Reviews → clicks Approve
  → Goods arrive → clicks Receive Items
  → Enters received quantities per item
  → If all items received → status becomes "Received"
  → If partial → status becomes "Partially Received" → receive remainder later
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.purchaseOrders.list()` | PO list |
| `client.purchaseOrders.create()` | Create PO |
| `client.purchaseOrders.approve()` | Approve PO |
| `client.purchaseOrders.receiveItems()` | Record received items |
| `client.purchaseOrders.cancel()` | Cancel PO |
| `client.suppliers.list()` | Supplier dropdown |
| `client.products.list()` | Product dropdown |

---

## 12. Inventory

### 12a. Products

**Route:** `/dashboard/products/view`
**File:** `routes/_authenticated/dashboard/_layout/products/view.tsx`

### What the User Sees

- **Status filter tabs:** All, Active, Inactive, Discontinued
- **DataTable columns:** SKU, Name, Barcode, Type, Brand, Category, Supplier, UOM, Price, Status badge

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create** | "New Product" button | Sheet: SKU, Name, Barcode, Type, Brand (dropdown), Category (dropdown), Supplier (dropdown), UOM (dropdown), Price, Conversion Factor, Status |
| **Edit** | Row action | Same sheet with existing data |

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.products.list()` | Product list |
| `client.products.create()` | Create product |
| `client.products.update()` | Update product |
| `client.brands.list()` | Brand dropdown |
| `client.productCategories.list()` | Category dropdown |
| `client.suppliers.list()` | Supplier dropdown |
| `client.uom.list()` | UOM dropdown |

### 12b. Brands

**Route:** `/dashboard/brands/view`
**File:** `routes/_authenticated/dashboard/_layout/brands/view.tsx`

### What the User Sees

- **DataTable columns:** Name, Products Assigned (computed from product list)
- Inline CRUD via DataTable callbacks (add/edit/delete)
- Empty state: "No brands yet. Add a brand to organize your products."
- Error state with "Try Again" button

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.brands.list()` | Brand list |
| `client.brands.create()` | Create brand (name, description) |
| `client.brands.update()` | Update brand |
| `client.brands.delete()` | Delete brand |
| `client.products.list()` | Fetch products to compute "Products Assigned" count |

> **Known Issue:** `_editTarget` and `_deleteTarget` state variables are declared but never read (dead state).

### 12c. Categories (Product)

**Route:** `/dashboard/categories/view`
**File:** `routes/_authenticated/dashboard/_layout/categories/view.tsx`

- DataTable with CRUD for product categories
- Router name: `productCategories` (not `categories`)
- Columns: Name, External Code, Products Assigned

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.productCategories.list()` | Category list |
| `client.productCategories.create()` / `update()` / `delete()` | Category CRUD |

### 12d. Suppliers

**Route:** `/dashboard/suppliers/view`
**File:** `routes/_authenticated/dashboard/_layout/suppliers/view.tsx`

### What the User Sees

- **Filter tabs:** Active (default), All, Inactive
- **DataTable** with full supplier data
- **Supplier fields (create/edit form):** Name, Description, Account Number, Payment Terms, Contact Person, Contact Phone, Office Phone, Email, Website, Barcode
- Create, Update, and Deactivate (not hard delete) actions

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.suppliers.list()` | Supplier list (filtered by isActive) |
| `client.suppliers.create()` | Create supplier |
| `client.suppliers.update()` | Update supplier |
| `client.suppliers.deactivate()` | Soft-deactivate supplier |

### 12e. Units of Measure

**Route:** `/dashboard/uom/view`
**File:** `routes/_authenticated/dashboard/_layout/uom/view.tsx`

- DataTable with CRUD for base units of measure
- **Hard delete** (no soft-delete / no deactivation — records are permanently removed)
- Shares query cache key with UoM Conversions page

### 12f. UoM Conversions

**Route:** `/dashboard/uom-conversions/view`
**File:** `routes/_authenticated/dashboard/_layout/uom-conversions/view.tsx`

- DataTable with CRUD for conversion factors between units (e.g., 1 kg = 1000 g)
- Deleting a base UoM that has child conversions will fail at the DB level (FK constraint)

### 12g. Stock Requests

**Route:** `/dashboard/stock-requests/view`
**File:** `routes/_authenticated/dashboard/_layout/stock-requests/view.tsx`

### What the User Sees

- **Status filter tabs:** All, Pending, Approved, Rejected, Fulfilled
- **"New Request" button** (requires `inventory_management:create` permission)
- **DataTable columns:** Request # (copyable), Date Issued, Issued By (copyable), To Branch (shows destination label or branch ID), Status badge, Actions

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create** | "New Request" button | Sheet: To Branch* (searchable combobox), From Branch (optional combobox), Destination Label (optional), Notes (optional). **Item section:** Product ID* (UUID text), Quantity* (>=1), Item Notes (optional). Currently supports only 1 item per request. |
| **Approve** | Row action (pending only) | Confirms and transitions to Approved |
| **Reject** | Row action (pending only) | Confirms and transitions to Rejected |
| **Fulfill** | Row action (approved only) | Dialog: fetches items via `getById`, shows per-item product ID + requested qty, enter fulfilled quantities, confirm |

### Status Workflow

```
Pending → Approved → Fulfilled
    ↓
  Rejected
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.stockRequests.list()` | Filtered stock request list |
| `client.stockRequests.create()` | Create stock request |
| `client.stockRequests.approve()` | Approve request |
| `client.stockRequests.reject()` | Reject request |
| `client.stockRequests.fulfill()` | Fulfill with received quantities |
| `client.stockRequests.getById()` | Fetch item details for fulfill dialog |
| `client.hierarchy.listNodes()` | Branch combobox data |

### 12h. Transfer Orders

**Route:** `/dashboard/transfer-orders/view`
**File:** `routes/_authenticated/dashboard/_layout/transfer-orders/view.tsx`

### What the User Sees

- **Status filter tabs:** All, Pending, In Transit, Completed, Cancelled
- **"New Transfer" button** (requires `inventory_management:create` permission)
- **DataTable columns:** Transfer # (copyable), Date Issued, From Branch, To Branch, Status badge, Actions

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create** | "New Transfer" button | Sheet: From Branch* (searchable combobox), To Branch* (searchable combobox), Notes (optional). **Item section:** Product ID* (UUID text), Quantity* (>=1), Item Notes (optional). Currently supports only 1 item per transfer. |
| **Mark In Transit** | Row action (pending only) | Transitions to In Transit |
| **Complete** | Row action (in_transit only) | Dialog: fetches items via `getById`, shows per-item product ID + transferred qty, enter received quantities, confirm |
| **Cancel** | Row action (pending or in_transit) | Confirmation dialog: "Are you sure? This action cannot be undone." |

### Status Workflow

```
Pending → In Transit → Completed
  ↓           ↓
Cancelled   Cancelled
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.transferOrders.list()` | Filtered transfer order list |
| `client.transferOrders.create()` | Create transfer order |
| `client.transferOrders.markInTransit()` | Mark as in transit |
| `client.transferOrders.complete()` | Complete with received quantities |
| `client.transferOrders.cancel()` | Cancel transfer |
| `client.transferOrders.getById()` | Fetch item details for complete dialog |
| `client.hierarchy.listNodes()` | Branch combobox data |

### 12i. Inventory Options (Hub)

**Route:** `/dashboard/inventory-options`
**File:** `routes/_authenticated/dashboard/_layout/inventory-options.tsx`
**Component:** `components/merge-tables/inventory-options-dashboard.tsx`

### What the User Sees

This is a **combined dashboard page** displaying three DataTables in a single view, not just a link page:

- **Top row (2-column grid):**
  - **Brands card** — DataTable with columns: Name, Products Assigned. Inline CRUD (add/edit/delete).
  - **Categories card** — DataTable with columns: Name, External Code, Products Assigned. Inline CRUD (add/edit/delete).
- **Bottom row (full-width):**
  - **Suppliers card** — Full supplier DataTable with CRUD and deactivation support. Supplier fields: Name, Description, Account Number, Payment Terms, Contact Person, Contact Phone, Office Phone, Email, Website, Barcode.

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.brands.list()` | Brand list |
| `client.brands.create()` / `update()` / `delete()` | Brand CRUD |
| `client.productCategories.list()` | Category list |
| `client.productCategories.create()` / `update()` / `delete()` | Category CRUD |
| `client.suppliers.list()` | Supplier list |
| `client.suppliers.create()` / `update()` / `deactivate()` | Supplier CRUD |

---

## 13. Finance

### 13a. Expenses

**Route:** `/dashboard/expenses/view`
**File:** `routes/_authenticated/dashboard/_layout/expenses/view.tsx`

### What the User Sees

- **Status filter tabs:** All, Pending, Approved, Rejected, Paid
- **DataTable columns:** Date, Category (badge), Description, Amount (MYR), Submitted By (copyable), Status badge

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create** | "New Expense" button | Sheet: Category* (Travel/Equipment/Supplies/Training/Other), Description* (textarea), Amount* (RM), Expense Date*, Receipt URL (optional, must be valid URL) |
| **Approve** | Row action (pending only) | Transitions to Approved |
| **Reject** | Row action (pending only) | Dialog with rejection reason |
| **Mark Paid** | Row action (approved only) | Dialog with optional payment reference |

### Status Workflow

```
Pending → Approved → Paid
    ↓
  Rejected
```

### User Flow

```
Staff submits expense claim (category, amount, receipt)
  → Claim appears as "Pending" for admins
  → Admin reviews → Approves or Rejects (with reason)
  → If approved, finance marks as "Paid" with optional reference number
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.expenses.list()` | Expense list (filtered by status tab) |
| `client.expenses.create()` | Submit expense |
| `client.expenses.approve()` | Approve expense |
| `client.expenses.reject()` | Reject with reason |
| `client.expenses.markPaid()` | Mark as paid |

### 13b. Payouts

**Route:** `/dashboard/payouts/view`
**File:** `routes/_authenticated/dashboard/_layout/payouts/view.tsx`

### What the User Sees

- **Status filter tabs:** All, Pending, Processing, Paid, Failed, Canceled
- **DataTable** with columns defined in `components/tables/payouts/view/columns.tsx` (PayoutRow: id, recipientId, recipientName, amount, status, paidAt, appointmentId, createdAt)
- No create button — payouts are auto-generated from completed appointments

### Key Details

- Read-only view of commission payout records
- Cross-DB enrichment: `recipientName` comes from control panel DB, payout data from tenant DB
- **Hard limit:** 50 records, no pagination
- Statuses: Pending, Processing, Paid, Failed, Canceled

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.payouts.list()` | Payout list (filtered by status) |

---

## 14. Access Control

### 14a. Role Management

**Route:** `/dashboard/access-control/roles`
**File:** `routes/_authenticated/dashboard/_layout/access-control/roles.tsx`

### What the User Sees

- **Three view modes** (toggle buttons): Cards, Matrix, Wizard
- **Search bar** for roles by name/description
- Quick Start Guide card (dismissible)

### View Modes

**Card View:**
- Role cards showing: name, description, user count, assigned permissions count
- Select/deselect checkboxes for bulk operations

**Matrix View:**
- Resources x Actions grid (e.g., "appointment_management" x "create", "read", "update", "delete")
- Toggle individual permissions per role
- Real-time API updates with pending status indicator

**Wizard View (Create New Role):**
- Step 1: Select template (Administrator, Manager, Basic User, Read Only) or start custom
- Step 2: Configure permissions — collapsible resource groups with "All/None" buttons
- Step 3: Review summary and save

> **Known Bug:** Permissions selected in the wizard are not carried into the RoleEditor component.

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.permissions.list()` | All available permissions |
| `client.roles.list()` | All roles |
| `client.members.list()` | User counts per role |
| `client.rolePermissions.list()` | Current role-permission assignments |

### 14b. Permissions

**Route:** `/dashboard/access-control/permissions`
**File:** `routes/_authenticated/dashboard/_layout/access-control/permissions.tsx`

### What the User Sees

- **Stats cards:** Total Resources, Total Actions, Avg Actions/Resource
- **Search bar** for permissions by resource or action name
- **Resource cards grid:** Each card shows icon, resource name, description, and action badges (create, read, update, delete, etc.)
- "Remove All Permissions" in context menu with impact confirmation dialog

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.permissions.list()` | Permission list |
| `client.rolePermissions.list()` | Current assignments |
| `client.rolePermissions.remove()` | Remove permissions |

### 14c. User Assignment

**Route:** `/dashboard/access-control/user-assignment`
**File:** `routes/_authenticated/dashboard/_layout/access-control/user-assignment.tsx`

### What the User Sees

- **Stats cards:** Total Users, Active Users, Users with No Roles, Available Roles
- **Filters:** Search (name/email/department), Role filter (All/No Roles/specific), Status filter (All/Active/Inactive)
- **Bulk selection** checkbox
- **User cards** showing: Avatar, Name, Email, Department, Status badge, Highest-priority role badge, Last Login, Assigned Roles

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Edit Roles** | User card menu | Sheet with system role radio buttons (Admin, Trainer, Staff, Client) |
| **Edit User** | User card menu | Dialog: Role (dropdown), Hierarchy Scope (dropdown with depth indicators) |
| **Deactivate/Activate** | User card menu | Toggles member status |
| **Invite User** | "Invite" button | Sheet: Email*, Role* (dropdown with descriptions); sends invitation + notification |

> **Known Bugs:** Role badges never render (API doesn't return role ID arrays). Bulk actions are UI-only no-ops.

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.members.list()` | Member list |
| `client.roles.list()` | Available roles |
| `client.hierarchy.listNodes()` | Hierarchy scope options |
| `client.members.updateRole()` | Change member role |
| `client.members.deactivate()` | Deactivate member |
| `client.members.reactivate()` | Reactivate member |
| `client.invitations.create()` | Create invitation |
| `client.invitations.sendEmail()` | Send invitation email |
| `client.hierarchy.reassignMember()` | Change hierarchy scope |

### 14d. Invitations

**Route:** `/dashboard/access-control/invitations`
**File:** `routes/_authenticated/dashboard/_layout/access-control/invitations.tsx`
**Component:** `components/invitations/invitations-page.tsx`
**Permission Guard:** `user_management:read` + `user_management:create`

### What the User Sees

- **"Invite Member" button** at top right
- **Status filter dropdown:** All Invitations, Pending, Accepted, Declined, Expired
- **Status count badges:** Pending count, Accepted count (green), Expired count
- **Invitation list** (rendered by `InvitationList` component) showing: Email, Role, Hierarchy Scope ID, Status, Expiry date, Created date

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Invite Member** | "Invite Member" button | Dialog via `CreateInvitationDialog` component |
| **Resend** | Per-invitation action | Re-creates invitation token + sends email via `client.invitations.sendEmail()` |
| **Revoke** | Per-invitation action | Confirmation prompt: "Are you sure? This action cannot be undone." |

### Status Logic

- Invitations with status "pending" that have passed `expiresAt` date are normalized to "expired" on the client side
- Valid statuses: pending, accepted, declined, expired

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.invitations.list()` | Invitation list (filtered by status) |
| `client.invitations.revoke()` | Revoke invitation |
| `client.invitations.resend()` | Resend (generates new token) |
| `client.invitations.sendEmail()` | Send invitation email with token, org name, inviter name |

> **Known Limitation:** List is scoped to `invitedBy: current member` — admins cannot see invitations sent by other admins.

---

## 15. User Management

### 15a. Employees Listing

**Route:** `/dashboard/user/view`
**File:** `routes/_authenticated/dashboard/_layout/user/view.tsx`

### What the User Sees

- **Page title:** "Members"
- **Subtitle:** "Manage organization members and their roles"
- **DataTable** with columns defined in `components/tables/user/view/columns.tsx`
- Read-only member list with cross-DB name join (names fetched from control panel DB, member data from tenant DB)

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.members.list()` | Member list for current org |

### 15b. Role List

**Route:** `/dashboard/role/view`
**File:** `routes/_authenticated/dashboard/_layout/role/view.tsx`

### What the User Sees

- **Page title:** "User Roles"
- **DataTable** with columns defined in `components/tables/role/view/columns.tsx`
- Read-only list of available roles
- Uses `orpc.roles.list.queryOptions()` pattern (different from most pages which use `client.roles.list()`)
- Overlaps with Access Control > Roles (duplicate page)

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `orpc.roles.list` | Role list for current org |

---

## 16. Communications

### 16a. Announcements

**Route:** `/dashboard/announcements/view`
**File:** `routes/_authenticated/dashboard/_layout/announcements/view.tsx`

### What the User Sees

- **Status tabs:** Active, Inactive, All
- **Audience filter dropdown:** All Audiences, Staff only, Clients only (client-side filter)
- **DataTable columns:** Title, Priority badge (Low/Normal/High/Urgent), Target (All/Staff/Clients), Scope (Org-wide or branch), Valid From, Valid Until, Pinned icon, Status badge

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create** | "New Announcement" button | Sheet: Title*, Message* (textarea), Priority (Low/Normal/High/Urgent), Target Audience (All/Staff/Clients), Start Date, End Date (must be after start), Pin to top (checkbox) |
| **Edit** | Row action | Same sheet with existing data |
| **Deactivate** | Row action (active only) | Confirmation dialog |
| **Delete** | Row action | Confirmation dialog |

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.announcements.list()` | Announcement list |
| `client.announcements.create()` | Create announcement |
| `client.announcements.update()` | Update announcement |
| `client.announcements.delete()` | Delete announcement |

### 16b. Notifications

**Route:** `/dashboard/notifications/view`
**File:** `routes/_authenticated/dashboard/_layout/notifications/view.tsx`

### What the User Sees

- **Filter tabs:** All, Unread, Read
- **DataTable columns:** Title, Message, Type, Status, Created At
- **"Mark All as Read" button**
- Per-row "Mark Read" action for unread notifications

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.notifications.list()` | Notification list |
| `client.notifications.markRead()` | Mark single as read |
| `client.notifications.markAllRead()` | Mark all as read |

---

## 17. My Services (Staff/Trainer)

**Route:** `/dashboard/my-services/view`
**File:** `routes/_authenticated/dashboard/_layout/my-services/view.tsx`

- **Visibility:** Only shown in sidebar for staff/trainer roles (checked via `hasRole(["trainer", "staff"])`)

### What the User Sees

- **DataTable columns:** Service (name + category subtitle), Category Default (buffer in minutes or "None"), My Override (buffer badge or "— (using default)"), Actions (Edit button)
- **Empty state:** "You have no service assignments yet. Contact your manager to get assigned to services."

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Edit Buffer** | Edit button on row | Sheet showing: Service name (read-only), Category name (read-only), Category default buffer (read-only). Editable: "My Buffer (minutes)" input. **Buttons:** Cancel, Clear Override (removes personal buffer, reverts to category default — only shown if override exists), Save |

### User Flow

```
Trainer opens My Services
  → Sees list of services they're assigned to
  → Each row shows the category default buffer time
  → Trainer clicks Edit on "PT Session"
  → Sheet opens showing category default is 10 min
  → Trainer enters 15 in "My Buffer" field → Save
  → Override badge "15 min" now shows in the table
  → Later: trainer clicks Edit again → clicks "Clear Override"
  → Row reverts to "— (using default)"
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.serviceMembers.listMine()` | Services assigned to current member |
| `client.serviceMembers.updateMyBuffer()` | Set or clear personal buffer override |

---

## 18. Settings

### 18a. Tax Rates

**Route:** `/dashboard/settings/tax-rates`
**File:** `routes/_authenticated/dashboard/_layout/settings/tax-rates.tsx`

### What the User Sees

- **Filter toggle:** Active / All (includes inactive)
- **Rate count** displayed next to filter
- **"Add Tax Rate" button**
- **DataTable columns:** Name, Code (mono badge), Rate (e.g., "8.00%"), Category, Default (star icon — click to set as default), Effective From, Effective Until, Status badge, Actions

### Actions

| Action | Trigger | Details |
|--------|---------|---------|
| **Create** | "Add Tax Rate" button | Sheet: Name*, Code* (auto-uppercase, mono font), Rate %* (step 0.01, shows basis point conversion), Category (SST/GST/Service Tax/Withholding Tax/Tax Exempt/Custom), Effective From* (date), Effective Until (date, optional), Description (textarea, optional), "Set as default" checkbox (create only) |
| **Edit** | Row action | Same sheet but "Set as default" checkbox is hidden; code can be changed |
| **Set Default** | Star icon in Default column | Marks this rate as the org default |
| **Deactivate** | Row action (active only) | Deactivates the rate; disabled if the rate is currently the default |

### Data Conventions

| Convention | Detail |
|------------|--------|
| Storage | Integer basis points (e.g., 800 = 8.00%) |
| User Input | Percentage with 2 decimal places (e.g., "8.00") |
| Conversion | `rateInBasisPoints = Math.round(parseFloat(ratePercent) * 100)` |
| Max | 10,000 basis points (100%) |
| Categories | SST, GST, Service Tax, Withholding Tax, Tax Exempt, Custom |

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.taxRates.list()` | Tax rate list |
| `client.taxRates.create()` | Create tax rate |
| `client.taxRates.update()` | Update tax rate |
| `client.taxRates.setDefault()` | Set a rate as default |
| `client.taxRates.deactivate()` | Deactivate a rate |

### 18b. Google Calendar

**Route:** `/dashboard/settings/google-calendar`
**File:** `routes/_authenticated/dashboard/_layout/settings/google-calendar.tsx`

### What the User Sees

- **Connection Status card** showing:
  - If connected: green "Connected" badge, sync scope badge ("All appointments" or "Your appointments"), Google email address, last synced time (relative: "5 minutes ago"), Disconnect button
  - If not connected: grey "Not connected" state, "Connect Google Calendar" button
- **Sync error alert** (if `lastSyncError` exists): shows error message with "Reconnect" link if token was revoked

### User Flow

```
User opens Google Calendar settings
  → Clicks "Connect Google Calendar"
  → Redirected to /auth/google-calendar/initiate?organizationId=...&returnUrl=...
  → Google OAuth consent screen
  → Grants permissions → redirected back with ?gcal=connected or ?gcal=error&message=...
  → Toast shown: success or error (auth_denied, invalid_state, generic)
  → Status card now shows connected state with sync scope
  → Sync scope: admin = "all" (org-wide), staff = personal appointments only
  → User can disconnect → confirmation dialog → token revoked (best-effort)
```

### API Calls

| Procedure | Purpose |
|-----------|---------|
| `client.googleCalendar.status()` | Connection status, sync scope, last sync time, errors |
| `client.googleCalendar.disconnect()` | Revoke token and disconnect |

### 18c. Reports

- Sidebar link points to `/dashboard/sales/view` — no dedicated reports page exists yet

### 18d. GHL Integration

**Route:** `/go-highlevel-integration` (outside dashboard layout)

- GoHighLevel CRM sync diagnostic page
- Uses raw `fetch()` instead of oRPC
- No RBAC guard
- Self-described as a demo/diagnostic tool

---

## 19. Sidebar & Navigation

**File:** `apps/web/src/components/app-sidebar.tsx`

### Structure

The sidebar is organized into collapsible groups:

```
MAIN
  ├── Home
  └── Trainers

BUSINESS
  ├── Branches (View / Create)
  ├── Services (Categories / View)
  ├── Appointments (Calendar / Class Slots / Package Instances / Installments)
  └── Customers (Walk-in)

SALES & INVENTORY
  ├── Sales (Orders / Payment / Cancelled / Promotions / Purchase Orders)
  └── Inventory (Products / Options / Brands / Categories / Suppliers / UoM / Conversions / Stock Requests / Transfer Orders)

FINANCE
  └── Finance (Expenses / Payouts)

PEOPLE
  ├── Access Control (Roles / Permissions / User Assignment / Invitations)
  ├── User (Roles / Employees)
  └── Communications (Announcements / Notifications)

MY WORK (staff/trainer only)
  └── My Services

SETTINGS
  ├── Config (Tax Rates / Google Calendar)
  ├── Reports
  └── GHL Integration
```

### Features

- **Collapsible groups** — expand/collapse with chevron
- **Active state** — current page highlighted in sidebar
- **Collapsible sidebar** — can be collapsed to icon-only mode
- **Organization name** displayed under the logo
- **Power Search** input (UI present, not wired to functionality)
- **User footer** — avatar initial, name, email, dropdown with Profile/Settings/Logout

---

## 20. Common Patterns

### UI Components Used Across Pages

| Component | Usage |
|-----------|-------|
| **DataTable** | Primary data display for all list views |
| **Sheet** | Slide-over panel for create/edit forms |
| **Dialog** | Confirmation modals (delete, deactivate, approve) |
| **Status badges** | Color-coded pill badges for entity states |
| **Copyable cells** | Click-to-copy for emails, UUIDs, phone numbers |
| **Collapsible sections** | Optional/advanced form fields |
| **Debounced search** | All search inputs use `useDebounce` hook |
| **Tab filters** | Status-based tab filtering (All/Active/Inactive, etc.) |
| **Sonner toasts** | Success/error notifications after mutations |

### Data & State Management

| Pattern | Implementation |
|---------|---------------|
| Data fetching | React Query via oRPC (`client.{router}.{procedure}()`) |
| Mutations | `useMutation` with `onSuccess` → `queryClient.invalidateQueries()` |
| Local state | `useState` for UI-only state (dialog open, selected row) |
| Forms | Controlled inputs with local state or React Hook Form |

### RBAC Behavior

| Role | Scope |
|------|-------|
| **Admin** | Sees all hierarchy nodes and all data within the tenant |
| **Staff** | Sees only nodes within `getDescendantNodeIds(hierarchyScopeId)` |
| **Trainer** | Same as staff + "My Services" and "My Schedule" views |

### Request Flow (Every Dashboard Page)

```
Browser → POST /rpc/{router}/{procedure}
  → Cookie: better-auth session token
  → Body: { json: { ...input, organizationId } }
  → Server: dbMiddleware → orpcTenantMiddleware → createContext
  → Context: { session, tenantDb, member, accessibleNodeIds }
  → Handler executes with tenant-scoped DB connection
  → Response returned to React Query cache
```

### Permission Guards

Some routes use `beforeLoad` with `requirePermission()` to gate access:

| Page | Permission Required |
|------|-------------------|
| Invitations | `user_management:read` |
| Stock Requests | `inventory_management:create` (create button), `inventory_management:update` (approve/reject/fulfill) |
| Transfer Orders | `inventory_management:create` (create button), `inventory_management:update` (transit/complete/cancel) |

> **Note:** `requirePermission` in `route-guards.ts` is currently a stub — it does not actually block navigation. Permission checks happen at the API level and via `hasPermission()` in components to conditionally show/hide buttons.

### Dashboard Layout

**File:** `routes/_authenticated/dashboard/_layout.tsx`

The layout is a passthrough `<Outlet />` wrapper. The actual sidebar + content structure is provided by the `_authenticated` layout which renders the `AppSidebar` component alongside the routed content.

### Amount & Currency Conventions

| Convention | Detail |
|------------|--------|
| Storage | Integer cents (never floats) |
| Display | Formatted as RM (Malaysian Ringgit) |
| Tax rates | Basis points (800 = 8.00%) |
| Promotion values | Basis points x100 for percentages, cents for fixed amounts |

---

## Known Issues Summary

### Non-Functional UI Elements

| Page | Element | Status |
|------|---------|--------|
| Sales View | View/Edit buttons | `console.log` stubs |
| Payment View | View/Edit buttons | `console.log` stubs |
| User Assignment | Bulk actions | UI-only no-ops |
| User Assignment | Role badges | Never render (API gap) |
| Sidebar | Power Search | Not wired |

### Data Display Bugs

| Page | Issue | Status |
|------|-------|--------|
| Service View | Price formatted as USD instead of MYR | **FIXED** (2026-04-16) — replaced local USD formatter with shared `formatPrice(val, "MYR")` |
| Expenses | Currency column defaults to "usd" but UI shows MYR | Open |
| Branch View | Debug panel visible in dev mode | **FIXED** (2026-04-16) — entire debug block removed |
| Branch View | PIC Name shows raw encoded user ID | **FIXED** (2026-04-16) — resolved via members.list lookup |
| Appointment View | Trainer sidebar shows raw UUIDs | **FIXED** (2026-04-16) — fallback chain: displayName → name → email |
| User View | Some members show "Unknown" for name and email | **FIXED** (2026-04-16) — email shown as fallback when name is Unknown |
| Inventory Options | Brand/category product counts hardcoded to 0 | **FIXED** (2026-04-16) — computed from products.list query |

### Design Gaps

| Page | Issue | Status |
|------|-------|--------|
| Roles Wizard | Permissions not carried into RoleEditor component | Open |
| Invitations | Admin can only see their own invitations | Open |
| Payouts | Hard 50-record limit, no pagination | Open |
| Sales Detail | Only reachable by direct URL (no link from Sales View) | Open |
| Cancelled Sales | Errors silently return empty array | Open |
| Class Slots | Branch ID is a raw UUID text input (no dropdown) | Open |
| Walk-in Customers | Branch ID is a raw UUID text input (no dropdown) | Open |
| Purchase Orders | Branch ID is a raw UUID text input (no dropdown) | Open |
| Payment View | Missing page header | **FIXED** (2026-04-16) — added CreditCard icon + title |
| UoM View | Missing page header | **FIXED** (2026-04-16) — added Ruler icon + title |
| Dashboard Home | QuickInsight hardcoded | **FIXED** (2026-04-16) — now driven by KPI data |
| Sidebar | Shows links to pages user can't access | **FIXED** (2026-04-16) — permission-based filtering added |
| Access Control (all) | Admin blocked by permission guards | **FIXED** (2026-04-16) — case-insensitive role lookup in auth.ts |

---

## 21. Testing Status

> **Last tested:** 2026-04-16
> **Test user:** Franchise Owner (franchisee@gmail.com) — Admin role
> **Environment:** localhost:3001 (web) + localhost:3000 (server)
> **Method:** Chrome browser automation (3 parallel tabs)

### Page-by-Page Test Results

| # | Page | Route | Test Result | Notes |
|---|------|-------|-------------|-------|
| 1 | Dashboard Home | `/dashboard` | PASS | KPIs, period filters, widgets all working. QuickInsight now dynamic. |
| 2 | Trainers | `/dashboard/trainers/view` | PASS | List, search, 3 trainers displayed with names. |
| 3 | Branch View | `/dashboard/branch/view` | PASS (after fix) | Debug panel removed. PIC name now resolves. 2 branches visible. |
| 4 | Branch Create | `/dashboard/branch/create` | NOT TESTED | Wizard — not navigated during test. |
| 5 | Service View | `/dashboard/service/view` | PASS (after fix) | Prices now in MYR. Services list loads. |
| 6 | Service Categories | `/dashboard/service-category/view` | PASS | CRUD working. 8+ categories with Add button. |
| 7 | Appointment Calendar | `/dashboard/appointment/view` | PASS (after fix) | Calendar loads. Trainer sidebar now shows names. |
| 8 | Class Slots | `/dashboard/appointment/class-slots/view` | PASS | Filters, data table working. Instructor column shows "—" (data issue). |
| 9 | Package Instances | `/dashboard/packages/instances/view` | PASS | Status tabs, multiple packages displayed. |
| 10 | Installments | `/dashboard/packages/installments/view` | PASS | Status tabs working. No data. |
| 11 | Walk-in Customers | `/dashboard/customers/walk-in/view` | BLOCKED → PASS (after fix) | Was blocked by `walk_in_customer_management:read` permission. Fixed via auth.ts role lookup. |
| 12 | Sales | `/dashboard/sales/view` | PASS | Read-only table loads. No data. View/Edit buttons are stubs. |
| 13 | Sales Detail | `/dashboard/sales/$id` | NOT TESTED | Only reachable by direct URL. |
| 14 | Cancelled Sales | `/dashboard/cancelled-sales/view` | PASS | Table loads. No data. |
| 15 | Payment | `/dashboard/payment/view` | PASS (after fix) | Page header added. Table loads. No data. |
| 16 | Promotions | `/dashboard/promotions/view` | PASS | Empty state message. Create button visible. |
| 17 | Purchase Orders | `/dashboard/purchase-orders/view` | PASS | Table loads. No data. Create button visibility depends on permissions. |
| 18 | Products | `/dashboard/products/view` | PASS | Status tabs, 3 products, prices in MYR. |
| 19 | Brands | `/dashboard/brands/view` | PASS | 2 brands, product counts correct. CRUD visible. |
| 20 | Categories | `/dashboard/categories/view` | NOT TESTED | Not directly navigated. |
| 21 | Suppliers | `/dashboard/suppliers/view` | NOT TESTED | Not directly navigated. |
| 22 | Inventory Options | `/dashboard/inventory-options` | PASS (after fix) | 3-table hub. Product counts now computed from products.list. |
| 23 | UoM | `/dashboard/uom/view` | PASS (after fix) | Page header added. 2 UoMs displayed. |
| 24 | UoM Conversions | `/dashboard/uom-conversions/view` | NOT TESTED | Not directly navigated. |
| 25 | Stock Requests | `/dashboard/stock-requests/view` | PASS | Status tabs. No data. Create button depends on permissions. |
| 26 | Transfer Orders | `/dashboard/transfer-orders/view` | PASS | Status tabs. No data. Create button depends on permissions. |
| 27 | Expenses | `/dashboard/expenses/view` | PASS | Status tabs. No data. Submit button depends on permissions. |
| 28 | Payouts | `/dashboard/payouts/view` | PASS | Status tabs. No data. |
| 29 | Access Control — Roles | `/dashboard/access-control/roles` | BLOCKED → PASS (after fix) | Was redirecting to `?unauthorized`. Fixed via auth.ts. |
| 30 | Access Control — Permissions | `/dashboard/access-control/permissions` | BLOCKED → PASS (after fix) | Same fix as above. |
| 31 | Access Control — User Assignment | `/dashboard/access-control/user-assignment` | BLOCKED → PASS (after fix) | Same fix as above. |
| 32 | Access Control — Invitations | `/dashboard/access-control/invitations` | PASS | List loads. 1 accepted, multiple declined. |
| 33 | User View | `/dashboard/user/view` | PASS (after fix) | 12 members. "Unknown" members now show email fallback. |
| 34 | Role View | `/dashboard/role/view` | PASS | 5 roles displayed. |
| 35 | Announcements | `/dashboard/announcements/view` | PASS | 2 announcements. CRUD actions visible. |
| 36 | Notifications | `/dashboard/notifications/view` | PASS | 4 notifications. Tabs working. Mark-read actions present. |
| 37 | Tax Rates | `/dashboard/settings/tax-rates` | PASS | 1 tax rate (SST 8%). Active/All filter. |
| 38 | Google Calendar | `/dashboard/settings/google-calendar` | PASS | "Not connected" state with Connect button. |
| 39 | My Services | `/dashboard/my-services/view` | PASS | Empty state for admin user. |

### Summary

| Metric | Count |
|--------|-------|
| Total pages | 39 |
| Tested | 34 |
| Not tested (not navigated) | 5 |
| Passing | 34 |
| Initially blocked (fixed) | 4 |
| Bugs found | 20 |
| Bugs fixed | 13 |
| Bugs remaining (open) | 7 |

### Fixes Applied (2026-04-16)

| Bug | File(s) Changed | Fix |
|-----|-----------------|-----|
| Debug panel in Branch View | `branch/view.tsx` | Deleted 68-line debug block |
| PIC name shows encoded ID | `branch/view.tsx` | Added members.list lookup map |
| Admin permissions blocked | `apps/server/src/routers/auth.ts` | Case-insensitive role name comparison with `LOWER()` |
| Service prices in USD | `components/tables/service/view/columns.tsx` | Replaced local USD formatter with shared `formatPrice(val, "MYR")` |
| Trainer sidebar shows UUIDs | `components/calendar/trainer-sidebar.tsx` | Fallback chain: `displayName → name → email → "Unknown Trainer"` |
| User View "Unknown" members | `components/tables/user/view/columns.tsx` | Email fallback when name is "Unknown" |
| Inventory Options product count 0 | `components/merge-tables/inventory-options-dashboard.tsx` | Added products.list query + useMemo count maps |
| Payment View missing header | `payment/view.tsx` | Added CreditCard icon + title block |
| UoM View missing header | `uom/view.tsx` | Added Ruler icon + title block |
| QuickInsight hardcoded | `dashboard/_layout/index.tsx` | Replaced with dynamic KPI-driven message |
| Sidebar shows unauthorized links | `components/app-sidebar.tsx` | Permission-based filtering on nav items |
| Notifications missing actions | Already had all features | No fix needed (was a viewport issue) |
| Expense/PO/Stock/Transfer create buttons | Cascading fix from auth.ts | Permissions now populated correctly |

### Remaining Open Issues

| Page | Issue | Priority |
|------|-------|----------|
| Sales View | View/Edit buttons are `console.log` stubs | Moderate |
| User Assignment | Bulk actions are UI-only no-ops | Moderate |
| User Assignment | Role badges never render (API gap) | Moderate |
| Invitations | Admin can only see own invitations | Minor |
| Payouts | Hard 50-record limit, no pagination | Minor |
| Sales Detail | Only reachable by direct URL | Minor |
| Sidebar | Power Search not wired | Minor |
