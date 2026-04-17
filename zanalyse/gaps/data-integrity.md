# Data Integrity Audit

**Date:** 2026-04-16
**Branch:** Customer-app
**Auditor:** Agent 6

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH     | 11 |
| MEDIUM   | 13 |
| LOW      | 8 |
| **Total** | **37** |

---

## 1. Zod-DB Mismatches

### [CRITICAL] Buy Package Pay sends packageId but API expects serviceId
- **File:** `apps/native/app/(app)/dashboard/buy-package/pay.tsx:62`
- **Status:** KNOWN
- **What's wrong:** The mobile app sends `packageId: state.packageId` to `client.packageInstances.create`, but the Zod input schema and DB column both require `serviceId` (uuid FK to services table). The field `packageId` does not exist in the Zod schema and will be silently ignored; `serviceId` will be missing, causing a Zod validation error or a NOT NULL constraint violation.
- **What to do:** Change `packageId` to `serviceId` in the pay screen and update the purchase flow context to store `serviceId` instead of `packageId`.

### [HIGH] Sales order create accepts createdBy from client input - spoofable
- **File:** `packages/api/src/routers/sales-orders.ts:103`
- **Status:** NEW
- **What's wrong:** The `create` Zod input accepts `createdBy: z.string().min(1)` from the caller rather than using `context.member.userId`. An attacker can impersonate another user's ID. The `cancel` endpoint has the same issue with `cancelledBy`.
- **What to do:** Remove `createdBy` from the Zod input and set it from `context.member.userId` in the handler, same pattern as expenses.create. Same fix for `cancelledBy` in the cancel endpoint.

### [HIGH] Sales order create missing customerType field
- **File:** `packages/api/src/routers/sales-orders.ts:97-108`
- **Status:** NEW
- **What's wrong:** The DB schema has `customerType text NOT NULL DEFAULT 'member'` but the Zod input for create/update has no `customerType` field. Walk-in sales will always be saved as `customerType='member'`, breaking the discriminated union between `members.userId` and `walk_in_customers.id` in `customerId`.
- **What to do:** Add `customerType: z.enum(["member", "walk_in"]).optional()` to both create and update Zod inputs. Pass it through to the service.

### [HIGH] Expense create missing currency field - defaults to "usd"
- **File:** `packages/db/src/schema/tenant/expenses.ts:18` / `packages/api/src/routers/expenses.ts:109-126`
- **Status:** KNOWN (LIMITATION)
- **What's wrong:** DB schema defaults `currency` to `"usd"`, but this is a Malaysian platform (MYR). The Zod input for expense create has no `currency` field, so every expense is stored as USD.
- **What to do:** Change the DB default to `"myr"` and/or add `currency` to the Zod input schema.

### [HIGH] Appointments create: roomId not in Zod input
- **File:** `packages/api/src/routers/appointments.ts:202-224`
- **Status:** NEW
- **What's wrong:** The DB schema has `roomId uuid` with FK to `rooms.id`, but the appointment create Zod input does not include `roomId`. Room assignments cannot be made at creation time. The update Zod schema also omits `roomId`.
- **What to do:** Add `roomId: z.string().uuid().nullable().optional()` to both create and update Zod input schemas.

### [HIGH] Appointments create: recurring fields not in Zod input
- **File:** `packages/api/src/routers/appointments.ts:202-224`
- **Status:** NEW
- **What's wrong:** DB has `isRecurring`, `recurringParentId`, `recurringFrequency`, `recurringEndDate` columns, but the create Zod input does not expose any recurring fields. Recurring appointments cannot be created via the API.
- **What to do:** Add recurring fields to the Zod input or create a dedicated `createRecurring` procedure.

### [MEDIUM] Service create missing Stripe fields from Zod schema
- **File:** `packages/api/src/routers/services.ts:143-174`
- **Status:** NEW
- **What's wrong:** DB columns `stripeProductId`, `stripePriceId`, `stripeSyncStatus` exist but are not in the create Zod input. These default to `null`/`"pending"` which is correct for new services, but there is no API endpoint to update these fields either (the update Zod input also omits them). Stripe sync status can never be updated via the API.
- **What to do:** Either add stripe fields to the update input schema or create a dedicated sync procedure.

### [MEDIUM] Package instance create: installmentsTotal calculated in router, not service
- **File:** `packages/api/src/routers/package-instances.ts:224`
- **Status:** NEW
- **What's wrong:** The router hardcodes `installmentsTotal: paymentPlanType === "half" ? 2 : paymentPlanType === "quarterly" ? 4 : 1`. If a future plan type is added, this logic must be updated in the router instead of the service layer.
- **What to do:** Move the installment count calculation into `createPackageInstance` service function.

### [MEDIUM] Walk-in customer update: email field accepts any string, not validated as email
- **File:** `packages/api/src/routers/walk-in-customers.ts:172`
- **Status:** NEW
- **What's wrong:** The update Zod input has `email: z.string().optional()` but the create input has `email: z.string().email().optional()`. Update allows saving invalid email addresses.
- **What to do:** Change to `email: z.string().email().optional()` in the update schema.

### [MEDIUM] Walk-in customer update: gender field accepts any string
- **File:** `packages/api/src/routers/walk-in-customers.ts:177`
- **Status:** NEW
- **What's wrong:** The update Zod input has `gender: z.string().optional()` but the create input has `gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional()`. Update allows saving invalid gender values.
- **What to do:** Use the same enum validation in the update schema.

### [MEDIUM] Appointment update: paymentStatus not updatable
- **File:** `packages/api/src/routers/appointments.ts:307-323`
- **Status:** NEW
- **What's wrong:** DB has `paymentStatus` column but it is not in the update Zod input. Payment status can only change via direct DB access or Stripe webhooks (if implemented), but there is no update path in the API.
- **What to do:** Add `paymentStatus` to the update Zod input, or create a dedicated payment status update procedure.

### [MEDIUM] Service create/update: availablePaymentPlans, installmentIntervalDays, gracePeriodDays not in CreateServiceParams type
- **File:** `packages/services/src/service.service.ts:28-53`
- **Status:** NEW
- **What's wrong:** The router passes these fields with `as Parameters<typeof createService>[1]` type assertion because `CreateServiceParams` does not include `availablePaymentPlans`, `installmentIntervalDays`, or `gracePeriodDays`. The `as` cast bypasses type safety.
- **What to do:** Add the missing fields to `CreateServiceParams` and `UpdateServiceParams` in the service file.

### [LOW] Promotion create: applicableProductIds/applicableServiceIds not in Zod input
- **File:** `packages/api/src/routers/promotions.ts:166-188`
- **Status:** NEW
- **What's wrong:** DB schema has `applicableProductIds` and `applicableServiceIds` JSONB columns, but the create Zod input does not include them. Promotions will always apply to all products/services.
- **What to do:** Add `applicableProductIds: z.array(z.string().uuid()).optional()` and `applicableServiceIds: z.array(z.string().uuid()).optional()` to the create schema.

### [LOW] Product create: barcode field is optional in DB and Zod - no unique constraint
- **File:** `packages/db/src/schema/tenant/products.ts:12`
- **Status:** NEW
- **What's wrong:** Products have a `barcode` column with an index but no unique constraint. Two products can share the same barcode, which defeats the purpose of a barcode scanner.
- **What to do:** Add a unique constraint on `barcode` (partial unique index where barcode IS NOT NULL).

---

## 2. Cross-DB References (No FK Enforcement)

### [HIGH] No services validate cross-DB userId existence before storing
- **File:** Multiple service files
- **Status:** NEW
- **What's wrong:** The following tenant DB columns store Control Panel `user.id` as plain text with no FK: `members.userId`, `appointments.userId`, `appointments.createdBy`, `payments.customerId`, `payments.userId`, `salesOrders.customerId` (when type=member), `salesOrders.createdBy`, `salesOrders.cancelledBy`, `expenses.submittedBy`, `expenses.approvedBy`, `expenses.paidBy`, `promotions.createdBy`, `purchaseOrders.createdBy`, `purchaseOrders.approvedBy`, `walkInCustomers.createdBy`, `announcements.createdBy`, `commissionSplits.staffId`, `packageInstances.clientId`, `invoices.customerId`, `invoices.createdBy`, `invitations.invitedBy`, `customerProfiles.userId`, `partnerStripeAccounts.partnerId`. None of the service functions that write these columns validate that the referenced user actually exists in the Control Panel DB, except `members.create` (which looks up user by email first).
- **What to do:** For user-facing writes (appointments created by clients, package purchases), validate the session userId matches a real CP user. For staff actions, the middleware already resolves `context.member` which proves the userId exists. Document which paths are validated and which are not.

### [MEDIUM] packageInstances.clientId references CP user.id but is never validated
- **File:** `packages/services/src/package-instance.service.ts:112`
- **Status:** NEW
- **What's wrong:** `createPackageInstance` accepts `clientId` as a plain string and inserts it directly. The router passes it from user input. A malicious caller could pass any string as clientId.
- **What to do:** Validate that clientId matches either `context.session.user.id` (for self-purchases) or a valid member in the tenant DB (for staff assignments).

### [MEDIUM] commissionSplits.staffId stores members.userId but no validation
- **File:** `packages/db/src/schema/tenant/commission-splits.ts:23`
- **Status:** NEW
- **What's wrong:** `staffId text NOT NULL` is documented as referencing `members.userId`, but there is no API create endpoint for commissionSplits (only read endpoints exist in the router). If commission splits are created programmatically, there is no validation that staffId maps to an actual member.
- **What to do:** When implementing commission split creation, validate staffId against the members table.

---

## 3. Orphan Risk on Delete

### [CRITICAL] Deleting a brand orphans products.brandId
- **File:** `packages/services/src/brands.service.ts:77`
- **Status:** NEW
- **What's wrong:** `deleteBrand()` hard-deletes without checking if any products reference this brand. The FK `products.brandId` uses `onDelete: "set null"` so products won't fail, but they silently lose their brand association.
- **What to do:** Either check for referencing products before deletion and warn/block, or accept the set-null behavior and document it.

### [CRITICAL] Deleting a product category orphans products.categoryId
- **File:** `packages/services/src/product-categories.service.ts:79`
- **Status:** NEW
- **What's wrong:** `deleteProductCategory()` hard-deletes without checking if any products reference this category. The FK uses `onDelete: "set null"` so products silently lose their category.
- **What to do:** Check for referencing products before deletion and either block or warn the user.

### [HIGH] Deleting a UOM blocks on FK but has no user-friendly error
- **File:** `packages/services/src/units-of-measure.service.ts:81`
- **Status:** NEW
- **What's wrong:** `deleteUnitOfMeasure()` hard-deletes. The FK `products.uomId` uses `onDelete: "restrict"`, so the delete will fail with a raw PostgreSQL FK violation error if any product uses this UOM. The error is not caught or translated to a user-friendly message.
- **What to do:** Check for referencing products before deletion and throw a descriptive error.

### [HIGH] Hierarchy node deletion checks members but not services, appointments, or other entities
- **File:** `packages/services/src/hierarchy.service.ts:451-570`
- **Status:** NEW
- **What's wrong:** `deleteHierarchyNode()` checks for assigned members and optionally reassigns them, but does not check for services, appointments, expenses, announcements, rooms, or other entities scoped to the branch. The service FK uses `onDelete: "restrict"` which will cause a raw PostgreSQL error. Other FKs use various strategies.
- **What to do:** Before deleting a hierarchy node, check all entities referencing it (services, appointments, rooms, etc.) and either block or cascade appropriately.

### [HIGH] Appointment create does not populate appointment_staff or appointment_clients junction tables
- **File:** `packages/services/src/appointment.service.ts:225-248`
- **Status:** NEW
- **What's wrong:** The DB has `appointment_staff` and `appointment_clients` junction tables for linking staff and clients to appointments. However, `createAppointment` only inserts into the `appointments` table. The `trainerId` and `userId` are stored on the appointment row directly, but the junction tables are never populated. This means: (1) commission splits that rely on `appointment_staff` records will find nothing, (2) multi-client group appointments cannot track per-client attendance or package usage via `appointment_clients`, and (3) queries joining on these tables will return empty results.
- **What to do:** After inserting the appointment, also insert into `appointment_staff` (using trainerId) and `appointment_clients` (using userId/clientId with pricePaid). For group/semi-private appointments, expose a client list in the create input.

---

## 4. Raw SQL / Injection Risk

### [MEDIUM] Sequence number generation uses COUNT-based approach - race condition
- **File:** `packages/services/src/sales-order.service.ts:28-42`
- **File:** `packages/services/src/purchase-orders.service.ts:12-26`
- **File:** `packages/services/src/invoice.service.ts:32-46`
- **File:** `packages/services/src/stock-requests.service.ts:26-39`
- **File:** `packages/services/src/transfer-orders.service.ts:28-42`
- **Status:** NEW
- **What's wrong:** All sequence number generators use `SELECT COUNT(*) ... WHERE number LIKE prefix%` then add 1. Under concurrent requests, two calls can get the same count and generate duplicate numbers. The unique constraint on the number column will cause one insert to fail with a cryptic error.
- **What to do:** Use a PostgreSQL sequence, `INSERT ... ON CONFLICT DO NOTHING` with retry, or a serializable transaction. At minimum, wrap in a transaction with `FOR UPDATE` or use `MAX()` instead of `COUNT()`.

### [LOW] Raw SQL in hierarchy service uses parameterized CTE - safe
- **File:** `packages/services/src/hierarchy.service.ts:57,124`
- **Status:** NEW
- **What's wrong:** Uses `tenantDb.execute(sql\`WITH RECURSIVE ...\`)` with parameterized Drizzle `sql` tagged template literals. This is safe against SQL injection as Drizzle parameterizes the interpolated values.
- **What to do:** No action needed - these use Drizzle's parameterized sql template, not string concatenation.

### [LOW] Raw SQL in promotions.service uses parameterized lower() - safe
- **File:** `packages/services/src/promotions.service.ts:85`
- **Status:** NEW
- **What's wrong:** `sql\`lower(${promotions.code}) = lower(${code})\`` uses Drizzle parameterized sql. Safe.
- **What to do:** No action needed.

### [LOW] LIKE patterns in sequence generators use Drizzle sql tag - safe but fragile
- **File:** `packages/services/src/sales-order.service.ts:38`
- **Status:** NEW
- **What's wrong:** `sql\`${salesOrders.salesOrderNumber} LIKE ${prefix + "%"}\`` uses Drizzle parameterized sql, which is injection-safe. However, if a prefix ever contains `%` or `_` characters, the LIKE would match unintended rows. Current prefixes (SO-, PO-, INV-, etc.) are generated server-side and are safe.
- **What to do:** No immediate action, but consider escaping LIKE special characters if prefix generation ever changes.

---

## 5. Missing Constraints

### [CRITICAL] Appointments: branchId can be null from client booking flow
- **File:** `packages/db/src/schema/tenant/appointments.ts:31-33`
- **Status:** KNOWN
- **What's wrong:** DB has `branchId uuid NOT NULL`, but the "Book Workout" flow in the mobile app sends `branchId: null`. This will cause a NOT NULL constraint violation at the DB level, surfacing as an opaque error to the user.
- **What to do:** Ensure the mobile app always resolves a valid branchId before calling the API. Add a clear error message in the API when branchId is null/missing.

### [HIGH] Supplier email has no unique constraint
- **File:** `packages/db/src/schema/tenant/suppliers.ts:11`
- **Status:** NEW
- **What's wrong:** Supplier `email` is a plain text field with no unique constraint or even an index. Duplicate supplier emails can be created, making it impossible to reliably match suppliers by email.
- **What to do:** Add a partial unique index on `email` where `email IS NOT NULL`.

### [HIGH] Walk-in customer email has no unique constraint
- **File:** `packages/db/src/schema/tenant/walk-in-customers.ts:37`
- **Status:** NEW
- **What's wrong:** Walk-in customer `email` is a plain text field with no unique constraint. Two walk-in records can share the same email, creating duplicate customer identities.
- **What to do:** Add a partial unique index on `email` where `email IS NOT NULL AND is_active = true`.

### [MEDIUM] Service category name not unique per branch (DB level)
- **File:** `packages/db/src/schema/tenant/service-categories.ts:17`
- **Status:** NEW
- **What's wrong:** Schema comment says "Category names must be unique within a branch (enforced in app layer)" but there is no unique constraint at the DB level and no evidence of app-layer enforcement in the service code.
- **What to do:** Add a composite unique constraint on `(name, branchId)` or add validation in the service layer.

### [MEDIUM] Room name not unique per branch
- **File:** `packages/db/src/schema/tenant/rooms.ts:6`
- **Status:** NEW
- **What's wrong:** Room names have no uniqueness constraint. Two rooms at the same branch can have identical names, causing confusion in booking.
- **What to do:** Add a composite unique constraint on `(name, branchId)`.

### [MEDIUM] Tax rate isDefault enforced only in service layer
- **File:** `packages/db/src/schema/tenant/tax-rates.ts:52`
- **Status:** NEW
- **What's wrong:** Only one tax rate should be default, but this is enforced only in the service layer. A direct DB write or race condition could create multiple default tax rates.
- **What to do:** Add a partial unique index: `CREATE UNIQUE INDEX ON tax_rates (is_default) WHERE is_default = true`.

### [LOW] Announcement branchId uses onDelete CASCADE - risky
- **File:** `packages/db/src/schema/tenant/announcements.ts:16`
- **Status:** NEW
- **What's wrong:** Announcements use `onDelete: "cascade"` for branchId FK. If a hierarchy node is deleted, all announcements for that branch are silently deleted. Other entities (services, rooms, expenses) use `"restrict"` or `"set null"`.
- **What to do:** Change to `onDelete: "set null"` or `"restrict"` for consistency with other branch-scoped entities.

### [LOW] Payment platformFeePercentage stores 0-100 but no Zod/DB range check
- **File:** `packages/db/src/schema/tenant/payments.ts:40`
- **Status:** NEW
- **What's wrong:** `platformFeePercentage integer DEFAULT 0` has no CHECK constraint. A value of 200 (200%) would be accepted by the DB.
- **What to do:** Add a CHECK constraint: `CHECK (platform_fee_percentage >= 0 AND platform_fee_percentage <= 100)`.

### [LOW] Members status is free-text - not constrained to enum
- **File:** `packages/db/src/schema/tenant/members.ts:31`
- **Status:** NEW
- **What's wrong:** `status text NOT NULL` accepts any string. The Zod layer constrains list filters to `["active", "suspended"]` but the deactivate endpoint sets status to `"inactive"` which is not in the filter enum.
- **What to do:** Use a pgEnum for member status or add a CHECK constraint. Align the Zod filter enum to include all possible statuses.

---

## 6. Hardcoded/Wrong Values

### [CRITICAL] Buy Package Done screen uses hardcoded * 1.1 tax
- **File:** `apps/native/app/(app)/dashboard/buy-package/done.tsx:24`
- **Status:** KNOWN
- **What's wrong:** The done screen calculates `total = subtotal * 1.1` (hardcoded 10% tax) instead of using the actual tax rate from the API (which the pay screen correctly fetches via `taxRates.getDefault`).
- **What to do:** Pass the calculated tax amount or rate through the purchase flow context state, or re-fetch the tax rate on the done screen.

### [MEDIUM] Payments currency defaults to "usd"
- **File:** `packages/db/src/schema/tenant/payments.ts:36`
- **Status:** KNOWN (LIMITATION)
- **What's wrong:** Payment records default to `currency: "usd"` but the platform operates in Malaysia (MYR).
- **What to do:** Change default to `"myr"`.
