# Pipeline Audit — Sales / Commission / Service Access

**Date:** 2026-04-20
**Scope:** Full trace of the client onboarding → service purchase → appointment booking → check-in → commission pipeline.
**Gap analysis applied:** 2026-04-20 (cross-referenced against codebase; stale claims corrected, 8 additional gaps added)
**Second-pass deep audit:** 2026-04-20 (transaction boundaries, ownership checks, race conditions, validation — 21 additional gaps added)

---

## Pipeline Completeness Summary

| Component | Wired | Auto-Triggered | Working | Notes |
|-----------|-------|----------------|---------|-------|
| Sales Order + Items (POS) | ✅ | ✅ | ⚠️ | Atomic transaction, but order number generators have `count()+1` race (see Gap #13) |
| Payment + Payment Items (POS) | ✅ | ✅ | ✅ | `pos_<uuid>` placeholder for non-Stripe |
| Invoice Generation (POS) | ✅ | ✅ | ✅ | Linked to payment + sales order |
| Package Instance Creation (POS) | ✅ | ✅ | ✅ | Credits, installment schedule, status all set |
| Credit Debit at Booking | ⚠️ | ⚠️ | ⚠️ | Insert + debit not in same transaction; no ownership check; accepts `creditsUsed=0` (see Gaps #7, #10, V1) |
| Credit Restoration on Cancellation | ❌ | ❌ | ❌ | `updateAppointment` never reverses `creditsUsed` |
| Credit Debit at Check-in | ✅ | ❌ (opt-in) | ✅ | `creditsConsumed` param must be > 0 explicitly |
| Credit Restoration on Check-in Delete | ✅ | ✅ | ⚠️ | Reverses `creditsConsumed` portion, but TOCTOU race can double-restore (see Gap #18) |
| Service Access Enforcement | ⚠️ | ✅ | ⚠️ | Checks credits + lock; missing staff qualification check, expiry-by-date check, and **package ownership check** (see Gap #10) |
| Package Expiry Auto-Marking | ❌ | ❌ | ❌ | No job/trigger sets `status=expired`; `expiresAt` check only in list queries, not at booking |
| Commission Auto-Creation (Appointment) | ❌ | ❌ | ❌ | Scaffolded no-op — missing `commissionPercentage` config schema |
| Commission Auto-Creation (POS) | ❌ | ❌ | ❌ | Scaffolded no-op — missing `commissionPercentage` config schema |
| Commission Approval → Paid Workflow | ✅ | N/A | ✅ | `approveCommissionSplits`, `markCommissionSplitsPaid`, `voidCommissionSplit` fully implemented; only missing: upstream trigger |
| Refund → Package Credit/Status Reset | ❌ | ❌ | ❌ | `processRefund` flips `paymentStatus` but never resets `creditsUsed` or `status` |
| Check-in Attendance Tracking | ✅ | ✅ | ✅ | 30-min anti-duplicate, flips `appointment_clients.attended` |

---

## Schema Relationships

### Service Delivery
```
service_categories ──< services ──< service_members >── members
                                          (isPrimary)
```

### Client Service Access (Purchased)
```
services ──< package_instances >── payments
                 │
                 └── creditsTotal / creditsUsed / creditsRemaining (computed)
                 └── status: active | expired | exhausted | cancelled
                 └── paymentStatus: pending | paid | failed | refunded
                 └── installment support: creditsUnlocked (null = all, int = gated)
```

### Sales / Payment Pipeline
```
sales_orders ──< sales_order_items (serviceId | productId | appointmentId — all nullable)
     │
     └──< payments ──< payment_items (type: package | booking | tax | fee | discount)
               │
               └──< invoices (linked to both payment + sales_order)
```

### Appointment & Consumption
```
appointments ──< appointment_clients ──< check_ins
     │                    │
     serviceId         packageInstanceId (per-client credit tracking)
     trainerId         attended: null | true | false
     packageInstanceId
     creditsUsed (default 1)
```

### Commission
```
commission_splits ── appointmentId OR salesOrderId (exactly one)
     │
     staffId (member.userId)
     splitPercentage
     calculatedAmount (cents)
     status: pending → approved → paid | void
```

---

## What Works End-to-End

### POS Sale (`pos.recordSale`)
Steps executed in a single atomic `tenantDb` transaction:
1. Create `sales_orders` row (status=confirmed)
2. Create `sales_order_items` rows (one per line item)
3. Create `payments` row (currency=myr, status=succeeded/pending)
4. Create `payment_items` rows (items + tax + discount)
5. Create `invoices` row (status=paid)
6. Create `package_instances` rows (if package items present; source=purchased, status=active)
7. Create `installments` rows (if installment plan applies)
8. Write `audit_log` row
9. ❌ Commission creation — **scaffolded, no-op** (`pos.service.ts` Step 15)

### Appointment Booking
1. ✅ Validates `packageInstanceId` — checks status=active, creditsRemaining ≥ requested
2. ✅ Checks installment lock via `evaluateAndLockIfOverdue()`
3. ✅ Decrements `creditsUsed` atomically on booking
4. ✅ Enforces trainer buffer time / conflict check
5. ❌ No check that trainer is in `service_members` for the service
6. ❌ No check that service is active/not deleted
7. ❌ No check that `package_instances.expiresAt` has not passed (only `status` is read)

### Check-In
1. ✅ Anti-duplicate window (30-min, drop-ins only)
2. ✅ Flips `appointment_clients.attended`
3. ✅ Optionally decrements `package_instances.creditsUsed` (only if `creditsConsumed > 0`)
4. ✅ Writes audit row in same transaction
5. ❌ Does not trigger commission creation

### Check-In Deletion
1. ✅ Reverses `creditsConsumed` portion via `GREATEST(0, creditsUsed - creditsConsumed)`
2. ⚠️ Only restores check-in credits — booking-time credit deduction remains (see Design Risks)

---

## Critical Gaps

### 1. Commission Auto-Creation Is Non-Functional

**Root cause:** No `serviceCommissionConfig` table and no `commissionPercentage` field on `services`.

Both hooks exist but are no-ops:
- `pos.service.ts` Step 15 — logs info, returns without writing
- `appointment.service.ts` lines 359–376 — logs warning, returns without writing

**Correction from gap analysis:** `approveCommissionSplits`, `markCommissionSplitsPaid`, and `voidCommissionSplit` are **fully implemented** in `packages/services/src/commission-splits.service.ts` (lines 299–465). The ledger query `listCommissionLedger` is also implemented. Only the upstream trigger is missing — once `commissionPercentage` config is added to schema, the existing functions can be called directly.

**Three design options for the config:**

| Option | Where stored | Flexibility |
|--------|-------------|-------------|
| A | `services.commissionPercentage` (decimal) | Simple; one rate per service |
| B | `serviceCommissionConfig` table (serviceId + role + rate) | Different rate per staff role |
| C | `service_members.commissionPercentage` | Per-staff-per-service rate |

**Recommended:** Option A to unblock quickly; Option C for franchise model parity.

---

### 2. No Staff Qualification Check at Booking

When `appointments.create` runs, there is no validation that:
- The assigned trainer (`trainerId`) is in `service_members` for the `serviceId`
- The service itself is active

Note: `serviceId` FK on appointments is `onDelete: "set null"` — a hard-deleted service silently nullifies future `appointments.serviceId`. The real risk is booking against an archived/inactive service, not against a deleted one.

**Fix:** Add to `appointment.service.ts → createAppointment`:
```typescript
// Before inserting appointment:
const assignment = await tenantDb.query.serviceMembers.findFirst({
  where: and(
    eq(serviceMembers.serviceId, params.serviceId),
    eq(serviceMembers.memberId, params.trainerId)  // trainerId is members.id
  )
});
if (!assignment) throw new ORPCError("FORBIDDEN", "Trainer not assigned to this service");
```

---

### 3. Walk-ins Cannot Purchase Packages

`package_instances.clientId` is `text NOT NULL` with no FK to either control-panel `user.id` or `walk_in_customers.id`. Walk-in customers have no user record. `pos.service.ts` lines 206–209 explicitly reject package items when `customerType === "walk_in"`.

**Fix options:**
- Allow a nullable `walkInCustomerId` on `package_instances` (schema change)
- Or keep v1 restriction with clear UI messaging

---

### 4. Appointment Cancellation Does Not Restore Credits

`updateAppointment` handles cancellation (`status="cancelled"`, `cancelledAt`, `cancellationReason`) but contains **no logic to reverse `creditsUsed`** on the linked `packageInstanceId`. Credits decremented at booking are permanently lost on cancellation.

**File:** `packages/services/src/appointment.service.ts` lines 283–378

**Fix:** When `newStatus === "cancelled"` and `existing.packageInstanceId`, decrement `creditsUsed` by `existing.creditsUsed` (clamped to 0) in the same transaction.

---

### 5. Refund Does Not Reset Package Credits or Status

`processRefund` flips `package_instances.paymentStatus = "refunded"` when cumulative refunds exceed `totalPrice` but does **not** reset `creditsUsed` or set `status = "cancelled"`. A fully refunded package with `status = "active"` can still be used for bookings.

**File:** `packages/services/src/refunds.service.ts` lines 730–759

---

### 6. No Automated Package Expiry Marking

`package_instances.status` has an `"expired"` value but nothing transitions `"active"` → `"expired"` when `expiresAt` passes. The booking check at `appointment.service.ts` line 222 only reads `pkg.status !== "active"` — not `pkg.expiresAt < now`. A package expired by date but not yet flipped in DB will still allow credit deductions.

**Fix options:**
- Add `expiresAt < now()` check alongside `status` check in `createAppointment`
- Or add a scheduled job to flip expired packages nightly

---

### 7. Appointment Insert + Credit Debit Are Not Transactional

**File:** `packages/services/src/appointment.service.ts` lines 235–275

`createAppointment` issues two separate statements directly against `tenantDb`: the appointment INSERT (line 235) and the `packageInstances.creditsUsed` UPDATE (line 268). There is no `tenantDb.transaction(...)` wrapper. A network blip, serialization error, or Neon serverless drop between them leaves a confirmed booking with no credits debited. Under production load, clients can accumulate appointments without consuming credits, and refund/expiry calculations read incorrect `creditsUsed`.

**Fix:** Wrap both operations in `tenantDb.transaction(async (tx) => { ... })`.

---

### 8. Parallel `processRefund` in `installment.service.ts` Has No Guards

**File:** `packages/services/src/installment.service.ts` lines 519–558

A second, completely separate `processRefund` function exists in `installment.service.ts` (different from the one in `refunds.service.ts` covered in Gap #5). It:

- Sets `paymentStatus="refunded"` AND `status="cancelled"` on the package instance with **no amount cap**, **no remaining-refundable validation**
- Has **no status guard** — silently no-ops on already-cancelled packages but still writes
- Bypasses the `request → approve → process` workflow entirely
- Logs to `installment_events` only — no `audit_log` row
- Is exported from `packages/services/src/index.ts` and reachable from any admin-level caller

Any admin can directly cancel any active package with any amount, bypassing all approval safeguards.

**Fix:** Either remove this function entirely (route all refunds through `refunds.service.ts`'s lifecycle), or add status guard, cumulative cap check, and `writeAudit` call.

---

### 9. `confirmInstallmentPayment` Not in a Transaction

**File:** `packages/services/src/installment.service.ts` lines 266–365

Five separate operations on bare `tenantDb`:
1. Mark installment `status="paid"` (line 291)
2. Update `packageInstances` (`installmentsPaid`, `creditsUnlocked`, `nextDueDate`) (line 334)
3. Clear `gracePeriodEndsAt` (same update)
4. `logInstallmentEvent("payment_received")` (line 349)
5. `logInstallmentEvent("credits_unlocked")` (line 356)

A crash after step 1 leaves the installment marked paid but credits not unlocked. The client has paid but cannot use new credits, and `installmentsPaid` is wrong, breaking downstream `calculateCreditsUnlocked` and locking logic.

**Fix:** Wrap the entire function body in `tenantDb.transaction(async (tx) => { ... })`.

---

### 10. Package Ownership Not Verified at Booking or Check-In

**File:** `packages/services/src/appointment.service.ts` lines 217–232; `packages/services/src/check-ins.service.ts` lines 305–318

Neither `createAppointment` nor `recordCheckIn` checks that `packageInstance.clientId === params.userId` (the booking/check-in user). Any authenticated user who knows another client's `packageInstanceId` can deduct credits from that client's package. This is distinct from the existing FK-integrity gap noted under Design Risks — that one is DB-level; this one is application-layer authorization.

**Fix:** After the package fetch, add: `if (pkg.clientId !== params.userId) throw new ORPCError("FORBIDDEN", "Package does not belong to this client")`. Mirror in both `createAppointment` and `recordCheckIn`.

---

### 11. `createInstallmentSchedule` Not in a Transaction

**File:** `packages/services/src/installment.service.ts` lines 201–251

The N-row installment INSERT loop (lines 213–237) and the subsequent `packageInstances` metadata update (line 241) run as separate statements. Partial failure leaves `installmentsTotal` mismatched with the actual installment row count — `confirmInstallmentPayment` and `evaluateAndLockIfOverdue` then produce wrong results.

**Fix:** Wrap in `tenantDb.transaction(async (tx) => { ... })`.

---

## Design Risks

### Dual Payment State Tracking
`appointments.paymentStatus` ("pending" | "paid" | "partial" | "refunded") exists independently of `payments.status`. These can diverge.

**Recommendation:** Deprecate `appointments.paymentStatus` and derive payment state from `payments` table via join.

### Dual Credit Decrement Risk
Credits are decremented at two points:
1. **Booking** (`createAppointment`) — always
2. **Check-in** (`recordCheckIn`) — only if `creditsConsumed > 0`

If `creditsConsumed` is set incorrectly, clients lose double credits. Check-in deletion restores the check-in portion only — not the booking-time portion.

**Recommendation:** Document the intended contract clearly. The canonical model should be: credits deducted once at booking; check-in only records attendance. Remove the check-in credit decrement path.

### `sales_order_items` Ambiguity
All three FKs (`serviceId`, `productId`, `appointmentId`) are nullable with no DB constraint enforcing exactly one is populated.

**Recommendation:** Add a DB-level CHECK constraint.

### `package_instances.clientId` No FK Integrity
Stored as `text NOT NULL` with no FK to any user table (cross-DB reference). App layer is the only guard. A bug allowing a walk-in `id` as `clientId` would silently succeed at DB level.

### `appointment_clients` Has No `clientType` — Walk-in Linkage Impossible
`appointment_clients` only has `clientId text NOT NULL` with no `clientType` column. Walk-in customers cannot be linked to appointment bookings — only drop-in check-ins. `check-ins.service.ts` line 357 documents this as "§7.8 limitation: walk-in booking linkage deferred (requires `appointment_clients.clientType`)."

### Service Deactivation Has No Active-Booking Guard
`updateService` allows setting `isActive = false` with no check for existing future appointments using that service.

**File:** `packages/services/src/service.service.ts` lines 161–215

### Installment Overdue Lock Is Lazy-Only
`evaluateAndLockIfOverdue` is only called at booking time (`appointment.service.ts` line 219). No cron or background worker proactively marks overdue installments. Clients with overdue installments who haven't booked remain unlocked in the DB.

**File:** `packages/services/src/installment.service.ts` line 397

### Gap #12 — Commission Approval is TOCTOU-Vulnerable

**File:** `packages/services/src/commission-splits.service.ts` lines 299–344

`approveCommissionSplits` reads status (line 309), validates all rows are `"pending"` (line 311), then issues a separate UPDATE (line 319) — with no `.for("update")` row lock. Two concurrent approval requests for the same IDs both pass the guard and both write. Compare with `processRefund` in `refunds.service.ts` line 629 which correctly uses pessimistic locking. `markCommissionSplitsPaid` has the same pattern.

**Recommendation:** Wrap in `tenantDb.transaction()` and add `.for("update")` on the SELECT, or use `UPDATE ... WHERE status='pending' RETURNING` (optimistic write).

### Gap #13 — POS Order Number Generators Are Not Concurrency-Safe

**File:** `packages/services/src/pos.service.ts` lines 145–175 (also `refunds.service.ts` lines 124–133)

`generateSalesOrderNumber`, `generatePaymentNumber`, `generateInvoiceNumber`, and `generateRefundNumber` all use `count() + 1` under READ COMMITTED isolation. The code comment claims this is "safe for tenant-scale concurrency" but two concurrent transactions can both read `count()=3`, both compute `seq=4`, both insert with the same number. The UNIQUE constraint causes the second to fail with a constraint violation that surfaces to the client as an unhandled error (no retry logic).

**Recommendation:** Use a Postgres sequence per tenant per prefix, or an advisory lock on a counter table, or UUID-based identifiers with a separate human-readable display number.

### Gap #14 — Trainer Buffer-Conflict Check is Not Locked

**File:** `packages/services/src/appointment.service.ts` lines 199–213

`checkAppointmentBufferConflict` runs before the INSERT with no DB-level lock. Two simultaneous bookings for the same trainer at the same time both find no conflict and both insert. There is no DB-level unique or exclusion constraint on `(trainerId, timerange)`.

**Recommendation:** Add a Postgres exclusion constraint using `tsrange` + `&&` operator, OR wrap the conflict check + insert in a serializable transaction.

### Gap #15 — `updateAppointment` Has No Status Machine Guard

**File:** `packages/services/src/appointment.service.ts` lines 318–337

Status changes pass through unconditionally via spread operator. A cancelled appointment can be re-set to `confirmed` (with credits already lost on cancel — see Gap #4 — they are not re-deducted). A completed appointment can be reset to `pending`. No state is terminal.

**Recommendation:** Define `ALLOWED_TRANSITIONS: Record<string, string[]>` and reject invalid transitions before the UPDATE.

### Gap #16 — `rescheduleInstallment` Not in a Transaction

**File:** `packages/services/src/installment.service.ts` lines 573–655

Three separate operations: installment UPDATE with new `dueDate` and `status="pending"` (line 615) → package UPDATE for `nextDueDate` and `gracePeriodEndsAt` (line 638) → event log (line 646). A crash after step 1 leaves the installment cleared to `"pending"` but the package's grace state stale, so it re-locks immediately at the next booking.

**Recommendation:** Wrap in `tenantDb.transaction()`.

### Gap #17 — `recordCheckIn` Anti-Duplicate Check Outside Transaction

**File:** `packages/services/src/check-ins.service.ts` lines 244–273 (check), line 277 (tx start)

The 30-minute anti-duplicate SELECT (line 244) runs before the transaction begins (line 277). Two concurrent drop-in check-ins for the same client both pass the check and both insert. If both also pass `creditsConsumed > 0`, double credit deduction occurs.

**Recommendation:** Move the anti-duplicate check inside the transaction, OR add a unique partial index on `(clientId, branchId, checkedInAt)` truncated to a 30-min window.

### Gap #18 — `deleteCheckIn` TOCTOU — Double Credit Restoration

**File:** `packages/services/src/check-ins.service.ts` lines 565–620

The existing-row read (line 565) happens outside the transaction (which begins at line 575). Two concurrent deletions of the same check-in both read the row, both enter transactions, both decrement `creditsUsed`. The Drizzle `delete` without `returning` does not error on zero rows, so the second delete silently no-ops while the credit decrement runs twice.

**Recommendation:** Move the SELECT inside the transaction with `.for("update")`, or use `DELETE ... RETURNING`.

### Gap #19 — `listAppointments` Filters by Scope in Memory After `limit`

**File:** `packages/services/src/appointment.service.ts` lines 136–146

`accessibleNodeIds` is applied in JS after the DB-level `limit` (default 100, cap 500). A branch admin whose 100 most recent appointments are all from other branches sees an empty list even though hundreds of in-scope appointments exist. Calendar view and appointment list are both affected.

**Recommendation:** Move `inArray(appointments.branchId, accessibleNodeIds)` into the Drizzle `where` clause.

### Gap #20 — `listRefunds` Count Uses Full-Row Fetch

**File:** `packages/services/src/refunds.service.ts` lines 852–859

The total count is computed by `findMany({ columns: { id: true } })` — fetches all matching rows just to count them. At scale this fetches tens of thousands of UUID rows per page load. Other functions (e.g., `listCheckIns` line 509) correctly use `count()`.

**Recommendation:** Replace with `tenantDb.select({ total: count() }).from(refunds).where(where)`.

---

## Validation & Audit Gaps

### V1 — Booking Accepts `creditsUsed: 0` or Negative

**File:** `packages/services/src/appointment.service.ts` lines 227–232

`creditsRequested = params.creditsUsed ?? 1`. The check `pkg.creditsRemaining < creditsRequested` passes for `0` and negative values, allowing free or refund-on-book attacks. The appointment is inserted with `creditsUsed: 0` and the UPDATE adds 0 to `packageInstances.creditsUsed`.

**Fix:** Reject `creditsUsed < 1` upfront with `BAD_REQUEST`.

### V2 — POS `taxBase` Goes Negative When Discount > Subtotal

**File:** `packages/services/src/pos.service.ts` lines 353–355

`taxBase = subtotalCents - discountCents`. A flat-value promo larger than subtotal (e.g., RM 200 promo on RM 150 sale) makes `taxBase` negative, producing negative `taxCents` and negative `totalCents`. The sales order, payment, and invoice are recorded as `succeeded` with negative amounts. Financial reports show negative revenue.

**Fix:** Cap `discountCents = Math.min(discountCents, subtotalCents)` after computing the discount, or enforce inside `validatePromoCode`.

### V3 — POS Allows Negative `unitPriceCents` and Zero `quantity`

**File:** `packages/services/src/pos.service.ts` lines 312–315

Subtotal loop applies no per-item guard. Negative unit prices silently reduce total. Zero quantity contributes nothing but is accepted.

**Fix:** Validate `quantity >= 1` and `unitPriceCents >= 0` per item before the subtotal loop; reject with `BAD_REQUEST` if violated.

### V4 — Refund Cap Check Excludes Pending Refunds

**File:** `packages/services/src/refunds.service.ts` lines 400–413

`requestRefund` counts refunds with status `"approved"` or `"processed"` only when computing the remaining-refundable cap. Two concurrent refund requests for the same package both see the other as `"pending"` (not counted), both pass the cap, both can be approved — cumulatively exceeding the package total price.

**Fix:** Include `"pending"` in the cap query: `inArray(refunds.status, ["pending", "approved", "processed"])`.

### V5 — Missing `writeAudit` on Key Operations

The following high-value operations write nothing to `audit_log`:

- `createAppointment` (`appointment.service.ts`) — no audit row when an appointment is created
- `updateAppointment` (`appointment.service.ts`) — no audit row for cancellations or time changes
- `confirmInstallmentPayment` (`installment.service.ts`) — credits-unlock event only goes to `installment_events`
- `createInstallmentSchedule` (`installment.service.ts`)
- `rescheduleInstallment` (`installment.service.ts`)

By contrast, `recordCheckIn`, `deleteCheckIn`, `processRefund` (in refunds.service.ts), `recordPosSale`, and `unlockPackage` all call `writeAudit`. Admin audit log viewer is blind to appointment and installment activity.

**Fix:** Add `writeAudit(tenantDb, { ... })` calls to each, inside the transactions added by Gaps #7, #9, #11, #16.

### V6 — `searchPosCustomers` Fetches All Members, Filters in Memory

**File:** `packages/services/src/pos.service.ts` lines 743–789

Fetches all `role="client"`, `status="active"` members tenant-wide (line 743), then filters by `accessibleNodeIds` in JS (line 750). For a 10K-member tenant, every POS keypress fetches all 10K rows.

**Fix:** Add `inArray(members.hierarchyScopeId, accessibleNodeIds)` to the Drizzle WHERE clause.

### V7 — `unlockPackage` Has No "Already Unlocked" Guard

**File:** `packages/services/src/installment.service.ts` lines 467–513

Calling `unlockPackage` on an already-unlocked package writes a misleading audit + event log entry claiming it was "unlocked" when it was already in that state. Risk of clearing legitimate lock metadata.

**Fix:** Read the package first; throw `BAD_REQUEST` if `!pkg.isLocked`.

---

## Recommended Fix Order

### Tier 1 — Original Pipeline Fixes

| Priority | Work | Unblocks |
|----------|------|---------|
| 1 | Add `commissionPercentage` to `services` schema + migration | Commission auto-creation everywhere |
| 2 | Uncomment commission hooks in `pos.service.ts` + `appointment.service.ts` | Commissions ledger populated on sales |
| 3 | Commission `approve` + `markPaid` already implemented — wire admin UI | Full commission workflow visible to admins |
| 4 | Add credit restoration on appointment cancellation in `updateAppointment` | Clients don't lose credits on cancellation |
| 5 | Add `expiresAt < now()` check in `createAppointment` alongside `status` check | Expired packages cannot be booked against |
| 6 | Add refund → package credit/status reset in `processRefund` | Fully refunded packages can't still be used |
| 7 | Add trainer-to-service validation in `createAppointment` | Service integrity |
| 8 | Add service deactivation guard (check future appointments before archiving) | Prevents orphaned appointments |
| 9 | Add `clientType` to `appointment_clients` schema | Walk-in booking linkage |
| 10 | Deprecate `appointments.paymentStatus` | Remove dual state confusion |
| 11 | Add CHECK constraint on `sales_order_items` item type | DB integrity |
| 12 | Schedule proactive installment overdue sweep | Overdue state propagates without requiring a booking |

### Tier 2 — Atomicity, Authorization & Validation (from second-pass audit)

| Priority | Work | Gap | Risk if not fixed |
|----------|------|-----|-------------------|
| A1 | Add package-ownership check (`pkg.clientId === userId`) in `createAppointment` and `recordCheckIn` | #10 | Any user can drain another client's credits |
| A2 | Wrap `createAppointment` insert + credit debit in a transaction | #7 | Confirmed bookings without credit debits under load |
| A3 | Remove or fully guard the parallel `processRefund` in `installment.service.ts` | #8 | Admin can refund/cancel any package, no cap, yes audit |
| A4 | Wrap `confirmInstallmentPayment` in a transaction | #9 | Payment confirmed but credits not unlocked on crash |
| A5 | Wrap `createInstallmentSchedule` in a transaction | #11 | Mismatched `installmentsTotal` vs row count |
| A6 | Wrap `rescheduleInstallment` in a transaction | #16 | Reschedule appears to succeed but package re-locks |
| A7 | Move `deleteCheckIn` SELECT inside transaction with `.for("update")` (or use `DELETE ... RETURNING`) | #18 | Concurrent deletions double-restore credits |
| A8 | Move `recordCheckIn` anti-duplicate check inside transaction (or add unique partial index) | #17 | Duplicate check-ins + double credit deduction |
| A9 | Replace POS `count()+1` number generators with sequences or UUIDs | #13 | Concurrent sales fail with UNIQUE violation |
| A10 | Add Postgres exclusion constraint on `(trainerId, [startTime, endTime])` | #14 | Trainer double-booking under concurrency |
| A11 | Add `.for("update")` lock or RETURNING pattern to `approveCommissionSplits` and `markCommissionSplitsPaid` | #12 | Duplicate audit rows, lost approver attribution |
| A12 | Add status machine guard to `updateAppointment` | #15 | Cancelled appointments re-activated without credit re-debit |
| A13 | Reject `creditsUsed < 1` in `createAppointment` | V1 | Free bookings via API |
| A14 | Cap discount at subtotal in POS, validate per-item `quantity >= 1` and `unitPriceCents >= 0` | V2, V3 | Negative-total sales recorded as `succeeded` |
| A15 | Include `"pending"` refunds in `requestRefund` cap check | V4 | Concurrent refund requests can over-refund a package |
| A16 | Add `writeAudit` to appointment + installment lifecycle ops | V5 | Admin audit log blind to bookings, cancellations, payments |
| A17 | Push `accessibleNodeIds` filter into Drizzle `where` for `listAppointments` and `searchPosCustomers` | #19, V6 | Branch admins see empty results; POS search fetches all members per keypress |
| A18 | Use `count()` instead of full-row fetch in `listRefunds` | #20 | Refunds list page slow at scale |
| A19 | Add `isLocked` guard to `unlockPackage` | V7 | Misleading audit entries on no-op unlocks |
