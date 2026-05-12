# Form Wiring & Schema Redundancy Audit

> **Date:** 2026-04-11
> **Branch compared:** `Customer-app` (web) vs `main` (web2)
> **Decision:** Option A for commission/rules — category-level only, no per-service overrides.

---

## Part A: Form Wiring Issues

Two full-featured form components exist in `web` but are unused — replaced by simplified stub dialogs that drop critical business fields.

### A1. Service Category Form

#### Import Chain

| | web (Customer-app) | web2 (main) |
|---|---|---|
| **Data-table file** | `components/tables/service-category/view/data-table.tsx` | Same |
| **Imports** | `ServiceCategoryCreateEditDialog` from `service-category-create-edit-dialog.tsx` | `ServiceFormDialog` from `service-category-form.tsx` |

#### Field Comparison

| Field | `service-category-form.tsx` (real, unused) | `service-category-create-edit-dialog.tsx` (stub, active) |
|---|---|---|
| Name | Yes | Yes |
| Description | No | Yes |
| Display Order | No | Yes |
| Active | No | Yes |
| Duration (minutes) | Yes | **Missing** |
| Max Attendees | Yes | **Missing** |
| Require Advance Booking | Yes | **Missing** |
| Min Advance Hours | Yes | **Missing** |
| Enable Cancellation Window | Yes | **Missing** |
| Cancellation Cutoff Hours | Yes | **Missing** |
| Payment Type (fixed/variable) | Yes | **Missing** |
| Conditional Payment Rules | Yes | **Missing** |
| Conditional Threshold | Yes | **Missing** |
| Below/Above Threshold Rates | Yes | **Missing** |
| Role Selection for Rates | Yes | **Missing** |
| Staff Pool Percentage | Yes | **Missing** |
| Staff Weightage Distribution | Yes | **Missing** |

#### Impact

Users cannot configure service duration, attendee limits, booking/cancellation rules, or staff payment incentive structures when creating or editing service categories.

---

### A2. Service Form

#### Import Chain

| | web (Customer-app) | web2 (main) |
|---|---|---|
| **Data-table file** | `components/tables/service/view/data-table.tsx` | Same |
| **Imports** | `ServiceCreateEditDialog` from `service-create-edit-dialog.tsx` | `ServiceFormDialog` from `service-form.tsx` |

#### Field Comparison

| Field | `service-form.tsx` (real, unused) | `service-create-edit-dialog.tsx` (stub, active) |
|---|---|---|
| Name | Yes | Yes |
| Category (select) | Yes | Yes |
| Duration + Unit | Yes (Session Duration in minutes) | Yes (raw number + unit select) |
| Max Attendees | Yes | Yes |
| Price | Yes | Yes |
| Scheduling Type | Yes (appointment-based / time-preset radio) | Yes (appointment / class_slot select) |
| Active | No | Yes |
| Expirable (toggle) | Yes | **Missing** |
| Expiry Duration + Unit | Yes (conditional on expirable) | **Missing** |
| Sessions Count | Yes | **Missing** |
| Taxable (toggle) | Yes | **Missing** |
| Tax Percentage | Yes (conditional on taxable) | **Missing** |
| Time-Preset Config: Recurring Days | Yes (day checkboxes) | **Missing** |
| Time-Preset Config: Time Slots per Day | Yes (dynamic time inputs per day) | **Missing** |

#### Impact

Users cannot configure session expiry, session counts, tax settings, or time-preset scheduling (recurring days and time slots) when creating or editing services.

---

### A3. Appointment Form

No wiring issue. The appointment form (`add-appointment-modal.tsx`) has identical fields in both branches. The difference is only in data source:

| Aspect | web (Customer-app) | web2 (main) |
|---|---|---|
| Customer dropdown | Real API via `orpc.members.list` | Hardcoded mock data |
| Services dropdown | Real API via `orpc.services.list` | No service fetching |
| Create appointment | Real `client.appointments.create` | `console.log` stub |
| Confirm/Cancel | Real `updateMutation` with toast | `console.log` stub |

---

### A4. Recommended Fix for Form Wiring

1. Update the two data-table imports to point to the real forms
2. Verify the real forms' API calls work with the current oRPC client and schema
3. Reconcile any fields the stubs added that the real forms lack (Description, Display Order, Active on service category; Active on service)
4. Remove or deprecate the stub dialogs once the real forms are confirmed working

#### Files to change

- `apps/web/src/components/tables/service-category/view/data-table.tsx`
  - Change: import `ServiceFormDialog` from `@/components/forms/service-category-form` instead of `ServiceCategoryCreateEditDialog`
- `apps/web/src/components/tables/service/view/data-table.tsx`
  - Change: import `ServiceFormDialog` from `@/components/forms/service-form` instead of `ServiceCreateEditDialog`

#### Stub files to deprecate/remove

- `apps/web/src/components/forms/service-category-create-edit-dialog.tsx`
- `apps/web/src/components/forms/service-create-edit-dialog.tsx`

---

## Part B: Schema Redundancy Audit

### B1. CRITICAL — `packages` table is redundant

**Tables involved:**
- `packages` — product definition (name, sessionCount, pricePerSession, maxClientsPerSession, expiry, branchId, appointmentType, allowedServiceIds)
- `package_instances` — per-client tracking (credits, payment, status, validity)
- `package_assignments` — legacy per-client tracking (superseded by package_instances)
- `services` — already defines: name, duration, price, maxAttendees, type, schedulingType, taxable, branchId

#### Why `packages` is redundant

The `services` table already stores the product definition. The `service-category-form.tsx` (the real form) already captures sessions, expiry, pricing, max attendees, and scheduling — which are the same concepts `packages` duplicates.

The real per-client work (credit tracking, payment lifecycle, assignment) is all on `package_instances`. The `packages` table is a redundant middle layer between services and instances.

#### Field mapping: packages vs services

| `packages` field | Already on `services` | Notes |
|---|---|---|
| `name` | `services.name` | Same concept |
| `sessionCount` | `service-form.tsx: sessions` | Form captures it; needs DB column on services |
| `pricePerSession` | `services.price` | Same (both in cents) |
| `maxClientsPerSession` | `services.maxAttendees` | Same concept |
| `expiryDays` / `expiryDate` | `service-form.tsx: expirable + duration/unit` | Form captures it; needs DB columns on services |
| `appointmentType` (private/semi-private/both) | `services.type` (private/semi_private) | Nearly identical; add "both" option |
| `branchId` | `services.branchId` | Same |
| `crossUsageEnabled` | (not on services) | Can move to `package_instances` or services |
| `allowedServiceIds` | (not applicable) | Only needed if a package bundles multiple services; can be replaced by `package_instances.serviceId` |
| `autoGenerateInvoice` | (not on services) | Can move to `package_instances` |
| `isArchived` | `services.isActive` | Inverse logic, same concept |

#### Action plan

1. Add missing fields to `services` table: `sessionCount`, `expiryDays`, `expiryDate`, `expirable`
2. Change `package_instances.packageId` to `package_instances.serviceId`
3. Move `crossUsageEnabled` and `autoGenerateInvoice` to `package_instances` if still needed
4. Drop `packages` table
5. Drop `package_assignments` table (already superseded by `package_instances` per its own schema comment)

#### Files affected

**Schema (drop):**
- `packages/db/src/schema/tenant/packages.ts`
- `packages/db/src/schema/tenant/package-assignments.ts`

**Schema (modify):**
- `packages/db/src/schema/tenant/services.ts` — add `sessionCount`, `expiryDays`, `expiryDate`, `expirable` columns
- `packages/db/src/schema/tenant/package-instances.ts` — rename `packageId` to `serviceId`, add `crossUsageEnabled`, `autoGenerateInvoice` if needed
- `packages/db/src/schema/tenant/index.ts` — remove `packages` and `packageAssignments` exports

**API routers (drop/modify):**
- `packages/api/src/routers/packages.ts` — remove (services router already handles product definition)
- `packages/api/src/routers/package-instances.ts` — update to reference `serviceId` instead of `packageId`
- `packages/api/src/routers/index.ts` — remove `packages` router from `baseRouter`

**Services (drop/modify):**
- `packages/services/src/package.service.ts` — remove (replaced by existing service CRUD in services)
- `packages/services/src/package-instance.service.ts` — update `packageId` references to `serviceId`
- `packages/services/src/index.ts` — remove package service exports

**Frontend:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx` — redirect to services page or remove
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx` — update to use `serviceId`
- `apps/web/src/__tests__/routes/packages.test.tsx` — update or remove

**Migrations:**
- `packages/db/src/migrate-tenant.ts` — new migration to drop tables, add columns, rename FK

---

### B2. CRITICAL — Commission/rules config: consolidate to category-level only (Option A)

**Decision: Option A — category-level only.** All booking rules and commission config live on `service_category_config`. The per-service tables (`service_rules`, `service_commission_config`) are removed. Services inherit everything from their category.

#### Current state: 3 tables, same data

**Booking rules duplicated in 2 places:**

| Field | `service_category_config` (category) | `service_rules` (service) |
|---|---|---|
| Require advance booking | `requireAdvanceBooking` (boolean) | `requireAdvanceBooking` (boolean) |
| Min advance time | `minAdvanceHours` (integer, hours) | `minAdvanceBookingDuration` (integer, seconds) + `minAdvanceBookingUnitType` |
| Enable cancellation window | `enableCancellationWindow` (boolean) | `enableCancellationWindow` (boolean) |
| Cancellation cutoff | `cancellationCutoffHours` (integer, hours) | `cancellationCutoffDuration` (integer, seconds) + `cancellationCutoffUnitType` |

Same 4 fields, different column names and units. No inheritance logic — unclear which one wins at runtime.

**Commission config duplicated in 2 places:**

| Field | `service_category_config` (category) | `service_commission_config` (service) |
|---|---|---|
| Type | `incentiveType` ("fixed" / "variable") | `commissionType` ("fixed" / "percentage" / "position_based") |
| Max staff | `maxStaff` (integer) | `maxStaff` (integer) |
| Staff pool % | `staffPoolPercentage` (integer) | `staffPoolPercentage` (integer) |
| Weightage | `staffWeightage` (jsonb) | `positionWeightage` (jsonb) |
| Payment structures | `paymentStructures` (jsonb) | `fixedAmounts` (jsonb) |
| Conditional threshold | `threshold` (integer) | (none) |
| Is conditional | `isConditional` (boolean) | (none) |

Same concept, different column names. Both store staff pool percentage, max staff, and weightage.

**`service_category_config` has no API router or service layer** — the DB table exists but nothing reads from or writes to it. The `service-category-form.tsx` frontend currently writes to `service_commission_config` and `service_rules` (per-service) instead.

#### What the form currently does (wrong)

`service-category-form.tsx` submit handler (lines 412-476) runs 3 API calls:

1. `client.services.create(...)` — creates a **service**, not a service category
2. `client.serviceCommissionConfig.upsert(...)` — writes commission to per-service table
3. `client.serviceRules.upsert(...)` — writes rules to per-service table

This is wrong: the form is labelled "Service Category" but creates a service and writes config to per-service tables instead of `service_category_config`.

#### Action plan

1. **Create a `serviceCategoryConfig` API router** with upsert endpoint that writes to `service_category_config` table
2. **Update `service-category-form.tsx`** submit handler to:
   - Call `client.serviceCategories.create(...)` (not `services.create`)
   - Call `client.serviceCategoryConfig.upsert(...)` (not `serviceCommissionConfig.upsert` or `serviceRules.upsert`)
3. **Update any code that reads booking rules or commission** to read from `service_category_config` via the service's `categoryId` join
4. **Drop `service_rules` table and router** — booking rules now live on `service_category_config`
5. **Drop `service_commission_config` table and router** — commission config now lives on `service_category_config`

#### Files to drop

**Schema:**
- `packages/db/src/schema/tenant/service-rules.ts`
- `packages/db/src/schema/tenant/service-commission-config.ts`

**API routers:**
- `packages/api/src/routers/service-rules.ts`
- `packages/api/src/routers/service-commission-config.ts`

**Router index (remove from baseRouter):**
- `packages/api/src/routers/index.ts` — remove `serviceCommissionConfig` and `serviceRules` entries

**Tenant schema index:**
- `packages/db/src/schema/tenant/index.ts` — remove `serviceRules` and `serviceCommissionConfig` exports

#### Files to create

**API router:**
- `packages/api/src/routers/service-category-config.ts` — new router with `upsert` procedure that writes to `service_category_config`

#### Files to modify

**Frontend form:**
- `apps/web/src/components/forms/service-category-form.tsx` — rewrite submit handler:
  - Step 1: `client.serviceCategories.create(...)` instead of `client.services.create(...)`
  - Step 2: `client.serviceCategoryConfig.upsert(...)` instead of `client.serviceCommissionConfig.upsert(...)` + `client.serviceRules.upsert(...)`

**Router index:**
- `packages/api/src/routers/index.ts` — add `serviceCategoryConfig` router, remove the two dropped routers

**Any backend code reading commission or rules for a service** must now:
- Look up the service's `categoryId`
- Read from `service_category_config` where `categoryId` matches
- (No per-service override to check)

#### Cleanup references

These files reference the dropped tables only in migrations/snapshots (no code changes needed, just awareness):
- `packages/db/src/migrations/tenant/0001_salty_morlocks.sql`
- `packages/db/src/migrations/0009_majestic_switch.sql`
- `packages/db/src/migrate-tenant.ts`
- `packages/db/src/migrations/tenant/meta/0001-0007_snapshot.json`
- `packages/db/src/migrations/meta/0009-0010_snapshot.json`

These test scripts reference the dropped routers (need updating):
- `apps/server/scripts/test-write-endpoints.ts`
- `apps/server/scripts/inspect-and-cleanup-test-data.ts`

---

### B3. HIGH — `cancelled_sales` table is redundant

**`sales_orders` already has:** `status` field with `"cancelled"` as a valid value.

**`cancelled_sales` duplicates:** `salesOrderId`, `customerId`, `customerName`, `cancelledAmount` (same as `totalAmount` on the order).

**Unique fields on `cancelled_sales`:** `cancellationNumber`, `cancellationDate`, `cancellationReason`, `cancelledBy`, `invoiceId`.

#### Action plan

Add the unique fields to `sales_orders` directly:
- `cancellationNumber` (nullable, populated when status = cancelled)
- `cancellationDate` (nullable)
- `cancellationReason` (nullable)
- `cancelledBy` (nullable)

The `invoiceId` link already exists on `invoices.salesOrderId`. Drop the `cancelled_sales` table.

#### Files affected

**Schema (drop):**
- `packages/db/src/schema/tenant/cancelled-sales.ts`

**Schema (modify):**
- `packages/db/src/schema/tenant/sales-orders.ts` — add `cancellationNumber`, `cancellationDate`, `cancellationReason`, `cancelledBy` columns
- `packages/db/src/schema/tenant/index.ts` — remove `cancelledSales` export

**Frontend:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx` — update to query `sales_orders` with `status = "cancelled"` filter instead of separate table

---

### B4. MEDIUM — Payment/Sales/Invoice document chain has ambiguous relationships

Three parallel document types with overlapping fields and optional cross-references:

```
sales_orders (draft -> confirmed -> completed -> cancelled)
     ? optional
invoices (draft -> sent -> paid -> partially_paid -> overdue -> cancelled)
     ? optional
payments (pending -> succeeded -> failed -> canceled -> refunded)
```

#### Overlapping fields

| Field | `sales_orders` | `invoices` | `payments` |
|---|---|---|---|
| `customerId` | Yes | Yes | Yes |
| `customerName` | Yes | Yes | No |
| `totalAmount` | Yes | Yes | Yes |
| `status` | Yes (4 values) | Yes (6 values) | Yes (5 values) |
| `date` / `createdAt` | Yes | Yes | Yes |
| `eInvoiceStatus` | No | Yes | Yes |
| `eInvoiceId` | No | Yes | Yes |
| `paymentMethod`/`paymentMode` | No | Yes (`paymentMode`) | Yes (`paymentMethod`) |

#### Issues

1. **`eInvoiceStatus` and `eInvoiceId`** are on both `invoices` and `payments` — which is the source of truth?
2. **`customerId` and `customerName`** are on all three tables — can drift
3. **`totalAmount`** tracked in three places — no enforcement they match
4. **Relationships are all optional:** `invoices.salesOrderId` is nullable, `invoices.paymentId` is nullable, `payments.invoiceId` is nullable
5. **Line items duplicated:** `sales_order_items` and `payment_items` both break down costs separately

#### Recommended direction

1. Establish a clear flow: `sales_order` -> `invoice` -> `payment`
2. Make `invoices.salesOrderId` required (every invoice comes from a sales order)
3. Remove `eInvoiceStatus`/`eInvoiceId` from `payments` — keep only on `invoices`
4. Remove `payments.invoiceId` — use `invoices.paymentId` as the single link direction
5. Consider removing `payment_items` — use `sales_order_items` as the single line-item breakdown

---

### B5. CLEAN — No redundancy found

These table groups are properly designed with no overlap:

| Tables | Assessment |
|---|---|
| `members` / `customer_profiles` / `walk_in_customers` / `member_profiles` | Clear separation: org membership, customer data, unregistered visitors, staff profiles |
| `appointments` / `class_slots` / `appointment_clients` / `appointment_staff` | Complementary: individual bookings vs pre-scheduled group sessions, with proper M:N junction tables |
| `notifications` / `notification_preferences` / `announcements` | Three distinct purposes: transactional inbox, user settings, broadcast messages |
| `recurrence_rules` / `preferred_times` | Different scopes: appointment repeat patterns vs client scheduling preferences |
| `dashboard_snapshots` / `user_activity_log` | Different purposes: aggregated metrics vs granular event log |
| `product_categories` / `brands` / `service_categories` | Separate domains: inventory products vs service catalog |
| `roles` / `permissions` / `role_permissions` | Standard RBAC pattern |
| `products` / `product_stock` / `units_of_measure` | Standard inventory pattern |
| `stock_requests` / `transfer_orders` | Different flows: requesting stock vs transferring between branches |
| `promotions` / `tax_rates` | Independent business rules |

---

## Summary

| Issue | Severity | Tables to Drop | Tables to Modify | Action |
|---|---|---|---|---|
| `packages` + `package_assignments` redundant | **CRITICAL** | `packages`, `package_assignments` | `services` (add columns), `package_instances` (rename FK) | Drop both; services becomes product definition; package_instances references serviceId |
| Commission/rules duplicated (Option A: category-only) | **CRITICAL** | `service_rules`, `service_commission_config` | `service_category_config` (keep as-is) | Drop per-service tables; create `serviceCategoryConfig` router; rewrite form submit |
| `cancelled_sales` separate table | **HIGH** | `cancelled_sales` | `sales_orders` (add cancellation columns) | Move cancellation metadata to sales_orders; drop table |
| Payment/Sales/Invoice overlap | **MEDIUM** | (none yet) | `payments`, `invoices` | Clarify document flow; remove duplicate fields (`eInvoice*`, line items) |
| Form stubs replacing real forms | **CRITICAL** | (frontend stubs to remove) | data-table imports | Rewire data-tables to real forms; remove stub dialogs |

### Total tables to drop: 5

1. `packages`
2. `package_assignments`
3. `service_rules`
4. `service_commission_config`
5. `cancelled_sales`
