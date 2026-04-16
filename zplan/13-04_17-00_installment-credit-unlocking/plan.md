# Installment-Based Credit Unlocking System — Implementation Plan

## 1. Overview

### Problem Statement

When a client purchases a service package (e.g., 10 personal training sessions), they currently pay in full and receive all credits immediately. The business needs a system where clients can pay in installments (Full/Half/Quarterly) with credits unlocked proportionally to payments made. Non-payment triggers grace periods, package locking, and admin follow-up workflows.

### Goals & Success Criteria

1. Admins can configure which payment plans (Full, Half, Quarterly) are available per service package
2. Clients select a payment plan at purchase and see an installment schedule
3. Credits unlock proportionally as each installment is confirmed
4. Overdue payments trigger configurable grace periods → package locking
5. Admins can confirm manual transfer payments, manually unlock packages, and process refunds
6. All installment events are audited with staff identity, timestamp, and reason
7. Notifications fire at spec-defined trigger points (14d, 3d, 1d before due; weekly during grace; on lock/unlock)
8. Client, coach, and admin dashboards show real-time installment status

### Scope

**In scope:**
- Payment plans: Full (1×), Half (2×), Quarterly (4×)
- Manual transfer payment confirmation by admin
- Cash payment option
- Credit unlocking, package locking/unlocking, grace periods
- Notification schedule (in-app; email channel deferred)
- Admin installment dashboard, client dashboard, coach visibility
- Manual override (unlock/refund) with audit trail

**Out of scope (for now):**
- Stripe online payment integration (user request: "skip the strip part for now")
- Automatic retry logic (Stripe-specific)
- Email/push notification channels (in-app only for V1)
- Per-branch installment configuration

---

## 2. Technical Architecture

### 2.1 Schema Changes

#### New Table: `installments`

Tracks each individual installment payment for a package instance.

```typescript
// packages/db/src/schema/tenant/installments.ts
export const installments = pgTable("installments", {
  id: uuid("id").defaultRandom().primaryKey(),
  packageInstanceId: uuid("package_instance_id")
    .notNull()
    .references(() => packageInstances.id, { onDelete: "cascade" }),
  installmentNumber: integer("installment_number").notNull(), // 1, 2, 3, or 4
  amount: integer("amount").notNull(),           // pre-tax amount in cents
  taxAmount: integer("tax_amount").default(0).notNull(), // tax in cents
  status: text("status").notNull(),              // 'pending' | 'paid' | 'overdue'
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentMethod: text("payment_method"),         // 'manual_transfer' | 'cash'
  confirmedBy: text("confirmed_by"),             // staff userId who confirmed
  creditsUnlockedByThis: integer("credits_unlocked_by_this").notNull(), // credits this installment unlocks
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("installments_package_instance_idx").on(table.packageInstanceId),
  index("installments_status_idx").on(table.status),
  index("installments_due_date_idx").on(table.dueDate),
  uniqueIndex("installments_package_number_unq").on(table.packageInstanceId, table.installmentNumber),
]);
```

#### New Table: `installment_events`

Audit trail for all installment-related events.

```typescript
// packages/db/src/schema/tenant/installment-events.ts
export const installmentEvents = pgTable("installment_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  packageInstanceId: uuid("package_instance_id")
    .notNull()
    .references(() => packageInstances.id, { onDelete: "cascade" }),
  installmentId: uuid("installment_id")
    .references(() => installments.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  // 'payment_received' | 'package_unlocked' | 'package_locked'
  // | 'manual_override_unlock' | 'manual_refund' | 'notification_sent'
  // | 'credits_unlocked' | 'installment_overdue' | 'grace_period_started'
  actorId: text("actor_id"),          // staff/system userId — null for system events
  amount: integer("amount"),          // cents, for payment/refund events
  reason: text("reason"),             // mandatory for overrides/refunds
  metadata: text("metadata"),         // JSON string for extra context
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("installment_events_package_idx").on(table.packageInstanceId),
  index("installment_events_type_idx").on(table.eventType),
  index("installment_events_created_idx").on(table.createdAt),
]);
```

#### New Table: `organization_settings`

Global (per-tenant) configurable settings. Single-row-per-key pattern.

```typescript
// packages/db/src/schema/tenant/organization-settings.ts
export const organizationSettings = pgTable("organization_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),           // e.g. 'installment_grace_period_days'
  value: text("value").notNull(),                // stored as string, parsed by consumers
  updatedBy: text("updated_by"),                 // staff userId
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("organization_settings_key_idx").on(table.key),
]);
```

Initial settings:
- `installment_grace_period_days` — default `"7"` (number of days after due date before lock)

#### Modified Table: `package_instances` — New Columns

```sql
ALTER TABLE "package_instances" ADD COLUMN "payment_plan_type" text;
-- 'full' | 'half' | 'quarterly' | null (null = legacy, no installment tracking)
ALTER TABLE "package_instances" ADD COLUMN "installments_total" integer DEFAULT 1;
ALTER TABLE "package_instances" ADD COLUMN "installments_paid" integer DEFAULT 0 NOT NULL;
ALTER TABLE "package_instances" ADD COLUMN "credits_unlocked" integer;
-- null = all credits available (backwards compat), integer = installment-controlled
ALTER TABLE "package_instances" ADD COLUMN "next_due_date" timestamp with time zone;
ALTER TABLE "package_instances" ADD COLUMN "grace_period_ends_at" timestamp with time zone;
ALTER TABLE "package_instances" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;
ALTER TABLE "package_instances" ADD COLUMN "locked_at" timestamp with time zone;
ALTER TABLE "package_instances" ADD COLUMN "locked_reason" text;
```

#### Modified Table: `services` — New Columns

```sql
ALTER TABLE "services" ADD COLUMN "available_payment_plans" text[] DEFAULT '{}';
-- Array of enabled plan types: e.g. ['full', 'half', 'quarterly']
-- Empty = no installment plans (pay in full, legacy behavior)

ALTER TABLE "services" ADD COLUMN "installment_interval_days" integer DEFAULT 30;
-- Days between installment due dates (e.g. 30 = monthly)
-- Admin can override this per-payment at confirmation time
```

### 2.2 Credit Unlocking Formula

All calculations use **pre-tax** figures.

```typescript
function calculateCreditsUnlocked(
  creditsTotal: number,
  installmentsPaid: number,
  installmentsTotal: number,
): number {
  if (installmentsPaid >= installmentsTotal) return creditsTotal;
  if (installmentsPaid <= 0) return 0;
  return Math.floor(creditsTotal * installmentsPaid / installmentsTotal);
}
```

Examples:
| Credits Total | Plan | After Payment 1 | After Payment 2 | After Payment 3 | After Payment 4 |
|---|---|---|---|---|---|
| 10 | Full (1×) | 10 | — | — | — |
| 10 | Half (2×) | 5 | 10 | — | — |
| 10 | Quarterly (4×) | 2 | 5 | 7 | 10 |
| 8 | Half (2×) | 4 | 8 | — | — |
| 8 | Quarterly (4×) | 2 | 4 | 6 | 8 |

The formula uses `Math.floor` for installments 1 to N-1 (business-conservative) and returns full `creditsTotal` on the final payment.

### 2.3 Installment Amount Calculation

```typescript
function calculateInstallmentAmounts(
  totalPrice: number,  // pre-tax, cents
  installmentsTotal: number,
): number[] {
  const base = Math.floor(totalPrice / installmentsTotal);
  const remainder = totalPrice - (base * installmentsTotal);
  // First installment absorbs rounding remainder
  return Array.from({ length: installmentsTotal }, (_, i) =>
    i === 0 ? base + remainder : base
  );
}
```

### 2.4 `creditsRemaining` Redefinition

**Critical design decision:** The existing `creditsRemaining` column currently means `creditsTotal - creditsUsed` (all credits minus consumed). Under installments, the *actual* available credits are `min(creditsUnlocked, creditsTotal) - creditsUsed`, which is less than the old meaning until all installments are paid.

**Decision: Redefine `creditsRemaining` to mean "credits the client can actually use right now."**

- On every payment confirmation: `creditsRemaining = creditsUnlocked - creditsUsed`
- On every appointment booking (credit consumption): `creditsRemaining = creditsRemaining - creditsUsed`
- For legacy packages (`creditsUnlocked IS NULL`): behavior unchanged — `creditsRemaining = creditsTotal - creditsUsed`

This means **all existing display code** (native dashboard, web instances table, booking detail) continues to work correctly without changes — they already read `creditsRemaining` as "what the client can use."

**Pre-existing gap (to fix in Phase 1, Task 1.12):** `appointment.service.ts:createAppointment` currently does NOT decrement `creditsRemaining` or increment `creditsUsed` on `package_instances` when an appointment is booked. This is a pre-existing bug that must be fixed as part of this feature — without it the credit formula produces incorrect values.

**Update points:**
1. `createAppointment()` — after inserting appointment row, if `packageInstanceId` is set, decrement: `creditsRemaining -= creditsUsed`, increment `creditsUsed += creditsUsed` on `package_instances`
2. `confirmInstallmentPayment()` — recalculate: `creditsRemaining = newCreditsUnlocked - existingCreditsUsed`
3. `createInstallmentSchedule()` — for non-full plans: set `creditsRemaining = 0` (nothing unlocked yet until first payment confirmed)
4. `createPackageInstance()` — for full plan with immediate payment: `creditsRemaining = creditsTotal` (unchanged from current)

**Files that read `creditsRemaining` (verified — no changes needed if we redefine):**
- `apps/native/app/(app)/dashboard/index.tsx` — dashboard active package display
- `apps/native/app/(app)/dashboard/packages/index.tsx` — client package list
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx` — admin instances table
- `packages/services/src/package-instance.service.ts` — reads for validation
- `packages/api/src/routers/package-instances.ts` — returns in API response

### 2.5 Booking Validation Change

When a client books an appointment using a package instance, the system must check:

1. Package is not locked (`is_locked = false`)
2. `creditsRemaining >= creditsRequested` (since `creditsRemaining` now reflects unlocked-minus-used)
3. Package status is `active`

```typescript
// In appointment.service.ts createAppointment, after buffer check:
if (params.packageInstanceId) {
  const pkg = await getPackageInstanceById(tenantDb, params.packageInstanceId);
  if (!pkg) throw new Error("Package instance not found");
  if (pkg.isLocked) throw new Error("Package is locked due to unpaid installment. Please complete your payment to continue booking.");
  if (pkg.status !== "active") throw new Error("Package is not active");
  const creditsRequested = params.creditsUsed ?? 1;
  if (pkg.creditsRemaining < creditsRequested) {
    const hasMoreInstallments = pkg.paymentPlanType && pkg.installmentsPaid < pkg.installmentsTotal;
    const hint = hasMoreInstallments
      ? " Complete your next installment to unlock more."
      : "";
    throw new Error(`Not enough credits. You have ${pkg.creditsRemaining} credits available.${hint}`);
  }
}
```

### 2.6 Package Locking Logic

Triggered by a scheduled check (cron or check-on-access):

```
1. Find all package_instances WHERE:
   - is_locked = false
   - payment_plan_type IS NOT NULL
   - installments_paid < installments_total
   - next_due_date IS NOT NULL
   - next_due_date < NOW()

2. For each:
   a. If grace_period_ends_at IS NULL:
      → Set grace_period_ends_at = next_due_date + grace_period_days
      → Mark installment as 'overdue'
      → Log 'grace_period_started' event
      → Send notification

   b. If grace_period_ends_at < NOW():
      → Set is_locked = true, locked_at = NOW(), locked_reason = 'non_payment'
      → Log 'package_locked' event
      → Send notification to client + coach
```

### 2.7 API Contracts

#### `installments` Router

```typescript
// POST /rpc/installments/confirmPayment
input: {
  organizationId: string;
  installmentId: string;
  paymentMethod: 'manual_transfer' | 'cash';
  notes?: string;
  nextIntervalDays?: number; // admin override for days until next installment due; defaults to service.installmentIntervalDays
}
response: {
  installment: Installment;
  packageInstance: PackageInstance; // updated with new credits_unlocked
}
permission: 'service_management:update'

// GET /rpc/installments/listByPackageInstance
input: {
  organizationId: string;
  packageInstanceId: string;
}
response: Installment[]
permission: owner (client) OR 'service_management:read' (staff)

// POST /rpc/installments/manualUnlock
input: {
  organizationId: string;
  packageInstanceId: string;
  reason: string; // mandatory
}
response: PackageInstance
permission: admin role (member.role === 'admin')

// POST /rpc/installments/processRefund
input: {
  organizationId: string;
  packageInstanceId: string;
  amount: number; // cents
  reason: string; // mandatory
}
response: { success: boolean }
permission: admin role

// GET /rpc/installments/adminOverview
input: {
  organizationId: string;
  status?: 'active' | 'overdue' | 'locked';
  limit?: number;
  offset?: number;
}
response: {
  items: Array<{
    packageInstance: PackageInstance;
    clientName: string;
    serviceName: string;
    installmentProgress: string; // "1 of 2"
    nextDueDate: string | null;
    status: 'active' | 'overdue' | 'locked';
  }>;
  total: number;
}
permission: 'service_management:read'

// GET /rpc/installments/clientDashboard
input: {
  organizationId: string;
}
response: Array<{
  packageInstance: PackageInstance;
  installments: Installment[];
  serviceName: string;
  creditsUnlocked: number;
  creditsUsed: number;
  creditsTotal: number;
  nextDueDate: string | null;
  nextDueAmount: number | null; // pre-tax cents
  nextDueAmountWithTax: number | null; // post-tax cents
}>
permission: authenticated (client sees own data)
```

#### `organizationSettings` Router

```typescript
// GET /rpc/organizationSettings/get
input: { organizationId: string; key: string }
response: { key: string; value: string } | null

// POST /rpc/organizationSettings/upsert
input: { organizationId: string; key: string; value: string }
response: { key: string; value: string }
permission: admin role
```

#### Modified `packageInstances.create`

Extended input accepts new installment fields:
```typescript
input: {
  // ...existing fields...
  paymentPlanType?: 'full' | 'half' | 'quarterly';
  // installments are auto-generated from paymentPlanType
}
```

When `paymentPlanType` is provided:
1. Set `installmentsTotal` based on plan (1/2/4)
2. Set `installmentsPaid = 0` (or 1 if full)
3. Set `creditsUnlocked = 0` (or creditsTotal if full)
4. Generate installment rows with calculated amounts and due dates
5. For "full" plan: auto-mark first installment as paid, set creditsUnlocked = creditsTotal

---

## 3. User Journeys

### Journey 1: Admin Configures Payment Plans for a Service Package

**Trigger:** Admin navigates to Packages management page and creates/edits a package.

**Steps:**
1. Admin opens `/dashboard/packages` → sees list of service packages
2. Admin clicks "Create Package" or edit icon on existing package → **Sheet drawer opens** on the right (existing pattern)
3. In the create/edit sheet, below the existing fields (name, session count, price, validity), admin sees a new **"Payment Plans"** section with three toggle switches:
   - ☐ Full Payment (1×)
   - ☐ Half Payment (2×)
   - ☐ Quarterly Payment (4×)
4. Admin toggles on the desired plans → toggles turn on (blue)
5. Admin saves → sheet closes, table refreshes
6. System stores `available_payment_plans` array on the service record

**Where it lives:** Existing packages sheet at `/dashboard/packages/view.tsx` — inline toggles within the existing create/edit form.

---

### Journey 2: Admin Configures Grace Period

**Trigger:** Admin navigates to Payment Settings.

**Steps:**
1. Admin opens `/dashboard/settings/payment` → **new Payment Settings page** (created as part of this feature)
2. Page shows a **"Installment Settings"** card
3. Card shows: "Grace Period (days)" with a number input, current value displayed (default: 7)
4. Admin changes value to desired number (e.g., 14) → clicks "Save"
5. System upserts `installment_grace_period_days` in `organization_settings`
6. Toast: "Settings saved"

**Where it lives:** New page at `/dashboard/settings/payment/view.tsx` — also add "Payment Settings" link to sidebar under Settings group.

---

### Journey 3: Client Purchases Package with Installment Plan (Native App)

**Trigger:** Client taps "Buy Package" in the native app dashboard.

**Current flow (steps 1–4 unchanged):**
1. Client selects service category → `setup.tsx`
2. Client sets schedule preferences → `schedule.tsx`
3. Client adds remark → `info.tsx`
4. **[NEW]** Client sees **"Select Payment Plan"** screen → `plan.tsx` (inserted here, before terms)
   - Shows only plans enabled for the selected service (from `service.availablePaymentPlans`)
   - If only one plan is enabled (or none), this screen is skipped and defaults to "full"
   - Each option shows: plan name, installment count, amount per installment (post-tax), credits unlocked per payment
   - e.g., "Full Payment — RM 1,000 (1 payment)" / "Half Payment — RM 500 × 2" / "Quarterly — RM 250 × 4"
   - Client selects a plan → option highlights → taps "Continue"
5. Client reviews terms → `terms.tsx` (terms can reference the selected plan)
6. Client signs agreement → `sign.tsx`
7. Client selects payment method (Manual Transfer / Cash) and confirms → `pay.tsx`
   - Summary shows selected plan + first installment amount
   - Taps "Confirm Purchase"
8. System creates `package_instance` with `payment_plan_type`, generates installment schedule
   - For any plan: first installment created as `pending`, admin must confirm payment
   - `creditsUnlocked = 0` until admin confirms first payment (even for "full" — admin confirms cash/transfer)
   - `next_due_date` set to `service.installmentIntervalDays` days after purchase date for installment 2+ (if applicable)
9. Client sees → `done.tsx`: "Package purchased! Your payment is pending confirmation."

**Where it lives:** New `plan.tsx` screen inserted after `info.tsx`, before `terms.tsx`. `pay.tsx` simplified to payment method + final submit only. Step navigation in `_layout.tsx` updated.

---

### Journey 4: Admin Confirms Manual Payment (Installment)

**Trigger:** Client makes bank transfer and notifies business. Admin opens installment dashboard.

**Steps:**
1. Admin opens `/dashboard/packages/installments` → sees **bulk overview table** of all active installment packages
2. Table columns: Client Name | Package | Progress (e.g., "1/2") | Next Due | Amount Due | Status
3. Admin filters by status "Pending" or "Overdue"
4. Admin clicks a row → **Drawer/sheet opens** showing package installment detail:
   - Package name, client name, plan type
   - Full installment schedule as a timeline/table (installment 1: RM 500 — Paid ✓, installment 2: RM 500 — Pending)
   - Current credit allocation: "5/10 credits unlocked, 3 used"
5. Admin clicks **"Confirm Payment"** button on the pending installment row
6. **Confirmation dialog** appears: "Confirm RM 500 payment for [Client Name]'s [Package Name] (Installment 2 of 2)?"
   - Payment method selector: Manual Transfer / Cash
   - Optional notes field
7. Admin confirms → system:
   - Updates installment status to `paid`, sets `paidAt`, `confirmedBy`
   - Increments `installments_paid` on package instance
   - Recalculates and updates `credits_unlocked`
   - Sets `next_due_date` to 30 days from now (if more installments remain)
   - Clears `grace_period_ends_at` if it was set
   - Logs `payment_received` + `credits_unlocked` events
   - Sends notification to client: "Payment confirmed! X new credits unlocked."
8. Drawer refreshes showing updated state

**Where it lives:** New page at `/dashboard/packages/installments/view.tsx` + inline drawer.

---

### Journey 5: Client Views Installment Dashboard (Native App)

**Trigger:** Client opens their packages screen in the native app.

**Steps:**
1. Client opens `/dashboard/packages` → sees list of their packages
2. For packages with installment plans, the card shows:
   - Package name, status badge (Active / Locked / Overdue)
   - **Credits:** "5 of 10 unlocked • 3 used • 2 available"
   - **Installment progress:** "Installment 1 of 2 paid"
   - **Next due:** "RM 500 due on 13 May 2026"
3. Client taps a package card → **detail screen** shows:
   - Full installment timeline with status per row
   - Credits breakdown (unlocked vs total, used, available)
   - Package status and dates
   - Payment history for each installment
4. If credits are exhausted but more installments remain:
   - Client sees: "All unlocked credits used. Pay next installment to unlock more."
   - "Request Early Payment" button (triggers notification to admin)

**Where it lives:** Existing native packages screen at `apps/native/app/(app)/dashboard/packages/index.tsx` — extended card + new detail view.

---

### Journey 6: Client Views Installment Dashboard (Web App)

**Trigger:** Client (if using web) navigates to their packages page.

**Steps:**
1. Client opens `/dashboard/packages/instances` → existing instances table
2. For installment packages, additional columns show:
   - Plan type, Credits Unlocked, Installment Progress, Next Due Date, Lock Status
3. Client clicks a row → detail view (drawer) shows same info as native Journey 5

**Where it lives:** Existing web instances page at `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx` — extended with installment columns and detail drawer.

---

### Journey 7: System Locks Package Due to Non-Payment

**Trigger:** Scheduled check (or check-on-access) detects overdue installment past grace period.

**Steps:**
1. System checks: installment `dueDate < NOW()` AND `status = 'pending'`
2. If grace period not started: mark installment `overdue`, set `grace_period_ends_at` on package instance, send notifications
3. After grace period expires (`grace_period_ends_at < NOW()`):
   a. System sets `is_locked = true`, `locked_at = NOW()`, `locked_reason = 'non_payment'`
   b. Logs `package_locked` event
   c. Sends notification to client: "Your [Package Name] has been locked due to missed payment."
   d. Sends notification to assigned coach (if `trainerId` exists on recent appointments)
   e. Sends notification to admin: "[Client Name]'s package locked — requires follow-up"
4. Client tries to book → sees error: "Package is locked due to unpaid installment."
5. When client pays overdue amount → admin confirms → package auto-unlocks (Journey 4 continues with unlock logic)

**Where it lives:** `packages/services/src/installment.service.ts` — `checkOverdueInstallments()` function, called by a cron endpoint or check-on-access.

---

### Journey 8: Admin Manually Unlocks a Locked Package

**Trigger:** Admin decides to unlock a package as a courtesy or exception.

**Steps:**
1. Admin opens installment dashboard → filters by "Locked" status
2. Admin clicks locked package row → drawer opens
3. Admin clicks **"Manual Unlock"** button
4. **Dialog appears** with mandatory reason field: "Why are you unlocking this package?"
5. Admin enters reason (e.g., "Client paid via alternative method, pending verification")
6. Admin clicks "Unlock"
7. System:
   - Sets `is_locked = false`, clears `locked_at`, `locked_reason`
   - Does NOT change `credits_unlocked` — spec says "Manual unlock does not bypass credit allocation rules"
   - Logs `manual_override_unlock` event with staff identity and reason
   - Sends notification to client: "Your [Package Name] has been unlocked."
8. Drawer refreshes showing unlocked state

**Where it lives:** Admin installment dashboard drawer at `/dashboard/packages/installments/view.tsx`.

---

### Journey 9: Admin Processes Manual Refund

**Trigger:** Admin needs to refund a client for a package.

**Steps:**
1. Admin opens installment dashboard → finds the package
2. Admin clicks row → drawer opens
3. Admin clicks **"Process Refund"** button
4. **Dialog appears** with:
   - Refund amount field (pre-filled with paid amount, editable for partial refunds)
   - Mandatory reason field
5. Admin enters amount and reason, clicks "Confirm Refund"
6. System:
   - Updates package instance `paymentStatus = 'refunded'`, `status = 'cancelled'`
   - Logs `manual_refund` event with staff identity, amount, and reason
   - Sends notification to client: "Refund of RM X processed for [Package Name]."
7. Package is no longer usable

**Where it lives:** Admin installment dashboard drawer.

---

### Journey 10: Coach Views Client Payment Status

**Trigger:** Coach wants to check if their client's package is up to date before a session.

**Steps:**
1. Coach opens `/dashboard/trainers` or their client list
2. Coach sees clients with package status indicators (Active ✓ / Overdue ⚠ / Locked ✗)
3. Coach clicks a client → sees client detail with:
   - Active packages listed
   - For installment packages: plan type, installment progress, next due date, lock status
4. Coach cannot modify payment status — view only

**Where it lives:** Existing trainers/client view at `/dashboard/trainers/view.tsx` — extended with payment status column/badge.

---

### Journey 11: Notification Triggers

| Trigger | When | Recipients | Message |
|---|---|---|---|
| 14 days before due | `next_due_date - 14d` | Client + Coach | "Your installment of RM X for [Package] is due on [Date]" |
| 3 days before due | `next_due_date - 3d` | Client + Coach | "Reminder: RM X due in 3 days for [Package]" |
| 1 day before due | `next_due_date - 1d` | Client + Coach | "Final reminder: RM X due tomorrow for [Package]" |
| Payment overdue | Every 7 days during grace | Client + Coach | "Your payment is overdue. Please pay RM X to avoid package lock." |
| Package locked | On lock | Client + Coach + Admin | "Your [Package] has been locked due to missed payment." |
| Package unlocked | On unlock (auto or manual) | Client + Coach | "Your [Package] has been unlocked. X credits now available." |
| Payment confirmed | On admin confirmation | Client | "Payment of RM X confirmed. X new credits unlocked." |

---

## 4. Phased Implementation

### Phase 1: Schema, Core Services & Admin Configuration

**Goal:** Create all new database tables, extend existing tables, build core business logic services, expose API, and deliver admin configuration UI.

**Delivers:** Journey 1 (Admin configures payment plans) and Journey 2 (Admin configures grace period) — end-to-end.

**Dependencies:** None

#### Task 1.1: Create `installments` schema

**File:** `packages/db/src/schema/tenant/installments.ts` (NEW)

- Define `installments` table with columns per §2.1
- Export table + inferred types
- Add relations: `packageInstanceId` → `packageInstances.id`

#### Task 1.2: Create `installment_events` schema

**File:** `packages/db/src/schema/tenant/installment-events.ts` (NEW)

- Define `installmentEvents` table with columns per §2.1
- Export table + inferred types
- Add relations: `packageInstanceId` → `packageInstances.id`, `installmentId` → `installments.id`

#### Task 1.3: Create `organization_settings` schema

**File:** `packages/db/src/schema/tenant/organization-settings.ts` (NEW)

- Define `organizationSettings` table with columns per §2.1
- Export table + inferred types

#### Task 1.4: Extend `package_instances` schema

**File:** `packages/db/src/schema/tenant/package-instances.ts` (MODIFY)

- Add columns: `paymentPlanType`, `installmentsTotal`, `installmentsPaid`, `creditsUnlocked`, `nextDueDate`, `gracePeriodEndsAt`, `isLocked`, `lockedAt`, `lockedReason`
- Add index on `isLocked`
- Add index on `nextDueDate`

#### Task 1.5: Extend `services` schema

**File:** `packages/db/src/schema/tenant/services.ts` (MODIFY)

- Add column: `availablePaymentPlans` as `text("available_payment_plans").array().default(sql`'{}'::text[]`)`
- Add column: `installmentIntervalDays` as `integer("installment_interval_days").default(30)` — days between installment due dates; admin can override per-payment at confirmation time

#### Task 1.6: Export new schemas from tenant index

**File:** `packages/db/src/schema/tenant/index.ts` (MODIFY)

- Add exports for `installments`, `installmentEvents`, `organizationSettings`

#### Task 1.7: Register schemas in tenant-schema.ts

**File:** `packages/db/src/schema/tenant-schema.ts` (MODIFY)

- Import and re-export new tables so Drizzle query builder recognizes them

#### Task 1.8: Generate and embed tenant migration

- Run `bunx drizzle-kit generate --config=drizzle.tenant.config.ts`
- Embed resulting SQL in `packages/db/src/migrate-tenant.ts` as new constant
- Add to `TENANT_MIGRATIONS` array

#### Task 1.9: Create installment service

**File:** `packages/services/src/installment.service.ts` (NEW)

Functions:
- `calculateCreditsUnlocked(creditsTotal, installmentsPaid, installmentsTotal)` — pure math
- `calculateInstallmentAmounts(totalPrice, installmentsTotal)` — returns array of amounts
- `createInstallmentSchedule(tenantDb, params)` — inserts installment rows for a new package instance; sets `creditsRemaining = 0` for non-full plans (per §2.4)
- `confirmInstallmentPayment(tenantDb, params)` — marks installment paid, updates package instance `creditsUnlocked` + `creditsRemaining` (per §2.4), logs event
- `checkAndLockOverduePackages(tenantDb, gracePeriodDays)` — finds overdue packages, applies grace/lock logic
- `unlockPackage(tenantDb, packageInstanceId, actorId, reason)` — manual unlock
- `processRefund(tenantDb, packageInstanceId, amount, actorId, reason)` — manual refund
- `getInstallmentsByPackageInstance(tenantDb, packageInstanceId)` — list installments
- `getInstallmentDashboardForClient(tenantDb, clientId)` — aggregated view
- `getAdminInstallmentOverview(tenantDb, params)` — admin bulk view with filters

#### Task 1.10: Create organization settings service

**File:** `packages/services/src/organization-settings.service.ts` (NEW)

Functions:
- `getSetting(tenantDb, key)` — returns value or null
- `upsertSetting(tenantDb, key, value, updatedBy)` — insert or update
- `getGracePeriodDays(tenantDb)` — convenience: returns integer, default 7

#### Task 1.11: Export new services from index

**File:** `packages/services/src/index.ts` (MODIFY)

- Add exports for installment service and organization settings service

#### Task 1.12: Modify appointment booking — credit decrement + validation

**File:** `packages/services/src/appointment.service.ts` (MODIFY)

**Fix pre-existing gap:** `createAppointment` currently never updates `package_instances` when credits are consumed. Fix this first:
- After inserting the appointment row, if `params.packageInstanceId` is set:
  - Decrement `creditsRemaining` by `params.creditsUsed ?? 1`
  - Increment `creditsUsed` by `params.creditsUsed ?? 1`
  - Use a single `UPDATE package_instances SET credits_remaining = credits_remaining - $1, credits_used = credits_used + $1 WHERE id = $2` (atomic, no race condition)

**Then add installment validation** (before the insert, after the buffer check):
- Check per §2.5: package not locked, `creditsRemaining >= creditsRequested`, status active
- Import `getPackageInstanceById` from package-instance service

#### Task 1.13: Modify package instance service

**File:** `packages/services/src/package-instance.service.ts` (MODIFY)

- Add `updatePackageInstance(tenantDb, id, params)` function — needed for installment system to update credit fields
- Add `paymentPlanType`, `installmentsTotal` to `CreatePackageInstanceParams`

#### Task 1.13a: Update `createInstallmentSchedule` to use per-service interval

**File:** `packages/services/src/installment.service.ts` (part of Task 1.9)

- `createInstallmentSchedule` params must accept `intervalDays: number` (read from `service.installmentIntervalDays`, defaulting to 30 if null)
- Due dates calculated as: installment N due date = `purchaseDate + (N × intervalDays)` days
- `confirmInstallmentPayment` params must accept optional `nextIntervalDays?: number` (admin override); if provided, overrides `service.installmentIntervalDays` when setting `next_due_date`

#### Task 1.14: Create installments router

**File:** `packages/api/src/routers/installments.ts` (NEW)

Procedures per §2.7:
- `confirmPayment` — protected, requires `service_management:update`
- `listByPackageInstance` — protected, owner or `service_management:read`
- `manualUnlock` — protected, admin role check
- `processRefund` — protected, admin role check
- `adminOverview` — protected, requires `service_management:read`
- `clientDashboard` — protected, returns data for session user
- `getInstallmentEvents` — protected, requires `service_management:read`, returns audit log for a package

#### Task 1.15: Create organization settings router

**File:** `packages/api/src/routers/organization-settings.ts` (NEW)

Procedures:
- `get` — protected, any authenticated member
- `upsert` — protected, admin role

#### Task 1.16: Register new routers

**File:** `packages/api/src/routers/index.ts` (MODIFY)

- Import and add `installments` and `organizationSettings` routers to `baseRouter`

#### Task 1.17: Extend service/package creation to accept payment plans

**File:** `packages/api/src/routers/services.ts` (MODIFY — locate the update/create procedures)

- Add `availablePaymentPlans` to input schema: `z.array(z.enum(['full', 'half', 'quarterly'])).optional()`
- Add `installmentIntervalDays` to input schema: `z.number().int().min(1).optional()` (defaults to 30 in DB)
- Pass both to service layer on create/update

#### Task 1.18: Extend package instance creation to generate installments

**File:** `packages/api/src/routers/package-instances.ts` (MODIFY)

- Add `paymentPlanType` to create input schema: `z.enum(['full', 'half', 'quarterly']).optional()`
- After creating package instance, call `createInstallmentSchedule` if `paymentPlanType` is provided
- For "full" plan: auto-confirm first (and only) installment if `paymentStatus` is 'paid'

#### Task 1.19: Add payment plan toggles + interval input to packages form (web)

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx` (MODIFY)

- In the create/edit sheet, add "Payment Plans" section after existing fields
- Three toggle switches (shadcn Switch component) for Full / Half / Quarterly
- Below toggles: "Installment Interval (days)" number input — shown only when Half or Quarterly is toggled on; defaults to 30
- Pre-populate both from `service.availablePaymentPlans` and `service.installmentIntervalDays` when editing
- Include both in mutation payload

#### Task 1.20: Create new Payment Settings page

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/payment/view.tsx` (NEW)

- New page at `/dashboard/settings/payment`
- Shows "Installment Settings" card with:
  - "Grace Period (days)" number input — load/save `installment_grace_period_days` via `client.organizationSettings`
- Save button with success toast
- Add "Payment Settings" nav link to sidebar under Settings group (`apps/web/src/components/app-sidebar.tsx`)
- Add route to `routeTree.gen.ts` (auto-generated by TanStack Router on next dev run)

**Acceptance criteria:**
- Admin can toggle payment plans on/off for any service package in the web UI — end-to-end (Journey 1)
- Admin can set grace period days in settings — end-to-end (Journey 2)
- All new tables exist in schema and are recognized by Drizzle
- Migration generated, embedded, and applies cleanly to tenant DB
- `calculateCreditsUnlocked` returns correct values for all plan types
- `createInstallmentSchedule` creates correct number of installment rows with proper amounts and due dates
- Type check passes: `bun check-types`

---

### Phase 2: Purchase Flow with Plan Selection

**Goal:** Clients can select a payment plan during package purchase, and installment schedule is auto-generated.

**Delivers:** Journey 3 (Client purchases with installment plan) — end-to-end.

**Dependencies:** Phase 1 complete

#### Task 2.1: Update native purchase flow context

**File:** `apps/native/contexts/purchase-flow-context.tsx` (MODIFY)

- Add to state: `paymentPlanType: 'full' | 'half' | 'quarterly' | null`
- Add to state: `availablePaymentPlans: string[]` (carried from selected service — set during `setup.tsx`)
- Add to state: `installmentIntervalDays: number` (carried from service, default 30)
- Add action to set payment plan

#### Task 2.2: Create plan selection screen in native purchase flow

**File:** `apps/native/app/(app)/dashboard/buy-package/plan.tsx` (NEW)

- **Placement:** After `info.tsx`, before `terms.tsx` (so client knows their plan before signing)
- If `availablePaymentPlans` is empty or has only "full", auto-select "full" and skip this screen entirely (navigate directly to terms)
- Display each available plan as a selectable card:
  - Plan name, installment count, per-installment amount (computed client-side from service price ÷ installments, post-tax for display), credits unlocked per installment
  - e.g., "Full Payment — RM 1,000 • All 10 credits unlocked on confirmation"
  - "Half Payment — RM 500 × 2 • 5 credits per payment"
  - "Quarterly — RM 250 × 4 • 2 credits per payment"
- Client taps a card → it highlights → taps "Continue" → navigates to terms
- Updates `purchaseFlowContext.paymentPlanType`

#### Task 2.3: Update native payment screen

**File:** `apps/native/app/(app)/dashboard/buy-package/pay.tsx` (MODIFY)

- Show selected plan summary at top: "Plan: Half Payment (2×) | First installment: RM 500"
- Payment method selector: "Manual Transfer" or "Cash" only (no Stripe)
- On confirm: pass `paymentPlanType` and `intervalDays` (from context) to `client.packageInstances.create`
- Success: navigate to `done.tsx`

#### Task 2.4: Update purchase flow step navigation

**File:** `apps/native/app/(app)/dashboard/buy-package/_layout.tsx` (MODIFY)

- Insert `plan` step between `info` and `terms` in the step sequence
- Step order: setup → schedule → info → **plan** → terms → sign → pay → done
- Step indicator (if shown) updates count accordingly
- `plan.tsx` skips itself (calls `router.replace('../terms')`) when only one plan option available

**Acceptance criteria:**
- Client sees only the plans enabled for the selected service; plan screen is skipped if only one option
- Plan selection screen appears after info step, before terms step
- Client can select a plan and complete purchase
- Package instance is created with correct `paymentPlanType`, `installmentsTotal`, `creditsUnlocked = 0`
- Correct number of installment rows created with proper amounts and due dates (using service's `installmentIntervalDays`)
- All plans (including full) require admin payment confirmation before credits unlock

---

### Phase 3: Payment Confirmation, Locking & Admin Actions

**Goal:** Admins can confirm payments, credits unlock automatically, packages lock on non-payment, manual override works.

**Delivers:** Journey 4 (Admin confirms payment), Journey 7 (System locks package), Journey 8 (Admin manual unlock), Journey 9 (Admin refund) — end-to-end.

**Dependencies:** Phase 2 complete

#### Task 3.1: Create admin installment dashboard page

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx` (NEW)

- Table view with columns: Client Name, Package, Plan, Progress, Next Due, Amount, Status
- Status filter tabs: All / Active / Overdue / Locked
- Sort by due date (ascending — soonest first)
- Uses `client.installments.adminOverview()`

#### Task 3.2: Create installment detail drawer

**File:** `apps/web/src/components/installment-detail-drawer.tsx` (NEW)

- Shows package info, client info, plan type
- Installment timeline/table: number, amount, status, due date, paid date
- Credits visualization: unlocked / used / available / total
- Action buttons:
  - "Confirm Payment" (for pending installments)
  - "Manual Unlock" (for locked packages)
  - "Process Refund"
  - "View Audit Log"

#### Task 3.3: Payment confirmation dialog

**File:** `apps/web/src/components/confirm-payment-dialog.tsx` (NEW)

- Dialog with: payment method selector, notes field, confirmation button
- Calls `client.installments.confirmPayment()`
- Shows success toast with credits unlocked count

#### Task 3.4: Manual unlock dialog

**File:** `apps/web/src/components/manual-unlock-dialog.tsx` (NEW)

- Dialog with mandatory reason textarea
- Calls `client.installments.manualUnlock()`
- Shows success toast

#### Task 3.5: Refund dialog

**File:** `apps/web/src/components/refund-dialog.tsx` (NEW)

- Dialog with refund amount (pre-filled), mandatory reason textarea
- Calls `client.installments.processRefund()`
- Shows success toast

#### Task 3.6: Check-on-access locking (replaces cron approach)

**Decision:** No cron endpoint. Package locking is evaluated lazily at access time only.

**File:** `packages/services/src/installment.service.ts` (MODIFY — add to existing)

- Add `evaluateAndLockIfOverdue(tenantDb, packageInstanceId, gracePeriodDays)` that:
  1. Reads the package instance
  2. If `isLocked` already → return early (already locked)
  3. If `paymentPlanType IS NULL` or `installmentsPaid >= installmentsTotal` → no locking needed
  4. If `nextDueDate < NOW()` and `gracePeriodEndsAt IS NULL` → start grace: set `gracePeriodEndsAt = nextDueDate + gracePeriodDays`, mark next pending installment as `overdue`, log `grace_period_started` event
  5. If `gracePeriodEndsAt < NOW()` → lock: set `isLocked = true`, `lockedAt = NOW()`, `lockedReason = 'non_payment'`, log `package_locked` event
  6. Returns updated package instance state

- Wire into `createAppointment` in `appointment.service.ts` (Task 1.12): call `evaluateAndLockIfOverdue` before the lock check, passing `gracePeriodDays` fetched from `organization_settings`
- Also call from `listByPackageInstance` router procedure so the status is always fresh when admin views

**Tradeoff acknowledged:** Packages are only locked when someone tries to book or view them, not proactively. Acceptable for V1.

#### Task 3.8: Add installments link to sidebar

**File:** `apps/web/src/components/app-sidebar.tsx` (MODIFY)

- Add "Installments" nav item under the Packages group
- Link to `/dashboard/packages/installments`

**Acceptance criteria:**
- Admin can view all installment packages in bulk table with filters
- Admin can confirm payment → credits unlock → client sees updated credits
- Overdue packages enter grace period → lock after expiry
- Admin can manually unlock with reason → audit logged
- Admin can process refund with reason → package cancelled, audit logged
- All events visible in audit log

---

### Phase 4: Dashboards, Notifications & Coach Visibility

**Goal:** Complete client-facing dashboard, notification triggers, and coach visibility.

**Delivers:** Journey 5 & 6 (Client dashboards), Journey 10 (Coach visibility), Journey 11 (Notifications) — end-to-end.

**Dependencies:** Phase 3 complete

#### Task 4.1: Extend native packages screen with installment info

**File:** `apps/native/app/(app)/dashboard/packages/index.tsx` (MODIFY)

- For packages with `paymentPlanType`, show on card:
  - Lock status badge (Active / Overdue / Locked)
  - Credits breakdown: "X of Y unlocked • Z used • W available"
  - Installment progress: "Installment M of N paid"
  - Next due date and amount

#### Task 4.2: Create native package installment detail screen

**File:** `apps/native/app/(app)/dashboard/packages/[id].tsx` (NEW or MODIFY)

- Full installment timeline
- Credits visualization
- Payment history per installment
- "Request Early Payment" button (when credits exhausted, more installments remain)
  - Creates a notification to admin: "[Client] requests early payment for [Package]"

#### Task 4.3: Extend web package instances page

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx` (MODIFY)

- Add columns for installment packages: Plan Type, Credits Unlocked, Progress, Next Due, Lock Status
- Click row → detail drawer showing installment info (read-only for non-admin, action buttons for admin)

#### Task 4.4: Create notification trigger service

**File:** `packages/services/src/installment-notification.service.ts` (NEW)

Functions:
- `sendUpcomingPaymentNotifications(tenantDb, daysBeforeDue)` — sends 14d/3d/1d reminders
- `sendOverdueReminders(tenantDb)` — weekly reminders during grace
- `sendLockNotification(tenantDb, packageInstanceId)` — on lock
- `sendUnlockNotification(tenantDb, packageInstanceId)` — on unlock
- `sendPaymentConfirmedNotification(tenantDb, installmentId)` — on payment confirm

Each function:
1. Creates notification row(s) for recipients (client + coach where applicable)
2. Logs `notification_sent` event in `installment_events`

#### Task 4.5: Wire notifications into cron endpoint

**File:** `apps/server/src/routers/installment-cron.ts` (MODIFY)

- Add notification checks to the cron handler:
  - Call `sendUpcomingPaymentNotifications` for 14d, 3d, 1d
  - Call `sendOverdueReminders` for weekly during grace
- Notifications are idempotent (check if notification already sent for this trigger+date)

#### Task 4.6: Wire notifications into payment confirmation

**File:** `packages/services/src/installment.service.ts` (MODIFY)

- In `confirmInstallmentPayment`: after updating credits, call `sendPaymentConfirmedNotification`
- In `unlockPackage`: call `sendUnlockNotification`
- In `checkAndLockOverduePackages`: call `sendLockNotification`

#### Task 4.7: Coach client payment status visibility

**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx` (MODIFY)

- For coaches viewing their assigned clients, add payment status column/badge
- Query: join package instances for clients assigned to this coach's recent appointments
- Badge: Active (green) / Overdue (yellow) / Locked (red) / No Package (gray)
- Click badge → shows package detail (read-only)

#### Task 4.8: Extend package instance list for coach view

**File:** `packages/api/src/routers/installments.ts` (MODIFY)

- Add `coachClientOverview` procedure:
  - Input: `organizationId`
  - Returns: installment summary for clients the coach has appointments with
  - Permission: `service_management:read` OR coach role

**Acceptance criteria:**
- Client sees full installment details in native app and web
- Client can request early payment
- Notifications fire at correct trigger points (14d, 3d, 1d before, weekly during grace, on lock/unlock/payment)
- Coach sees payment status of their clients
- `bun check-types` passes

---

## 5. Impact & Breakage Analysis

### 5.1 Modified Tables

#### `package_instances` — 9 new columns added

**Callers/importers:**
- `packages/services/src/package-instance.service.ts` — creates/reads instances
- `packages/api/src/routers/package-instances.ts` — API layer
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx` — admin table
- `apps/native/app/(app)/dashboard/packages/index.tsx` — client package list
- `apps/native/app/(app)/dashboard/buy-package/pay.tsx` — purchase flow
- `apps/native/contexts/purchase-flow-context.tsx` — purchase state
- `apps/native/app/(app)/dashboard/index.tsx` — dashboard active package display

**Backward compatibility:** All new columns have defaults (`DEFAULT false`, `DEFAULT 0`, `DEFAULT 1`, nullable). Existing package instances without installments continue to work — `creditsUnlocked = NULL` means "all credits available" (no installment control), `isLocked = false`, `paymentPlanType = NULL`.

**Risk:** The `creditsUnlocked` NULL-means-legacy logic must be consistently applied everywhere credits are checked. If any code path checks `creditsUnlocked < creditsUsed` without handling NULL, legacy packages will break.

#### `services` — 1 new column

**Callers:**
- `packages/services/src/service.service.ts` — CRUD
- `packages/api/src/routers/services.ts` — API
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx` — admin packages
- Multiple native app screens (service selection in purchase/booking flows)

**Backward compatibility:** `available_payment_plans DEFAULT '{}'` — empty array means no installment plans configured (legacy behavior). No breaking change.

### 5.2 Modified Services

#### `appointment.service.ts` — createAppointment gets new validation

**Callers:**
- `packages/api/src/routers/appointments.ts` — appointment creation endpoint
- `apps/web/src/components/calendar/add-appointment-modal.tsx` — web booking
- `apps/native/` — native booking flow

**Risk:** If `getPackageInstanceById` import fails or the package instance lookup changes behavior, appointments without packages could be blocked. The check guards on `if (params.packageInstanceId)` so null/undefined is safe.

#### `package-instance.service.ts` — new `updatePackageInstance` function

**Risk:** Low. New function, no existing callers changed.

### 5.3 Deployment Coupling

| Phase | Can deploy independently? | Notes |
|---|---|---|
| Phase 1 (Schema + services + admin config) | Yes | New columns have defaults, new endpoints + UI for admin config |
| Phase 2 (Purchase flow) | Needs Phase 1 deployed | Native app reads `availablePaymentPlans` from API |
| Phase 3 (Admin dashboard + locking) | Needs Phase 1 deployed | New page, new endpoints |
| Phase 4 (Notifications + client dashboards + coach) | Needs Phase 3 deployed | Extends existing pages, adds notification logic |

### 5.4 Return Type Changes

- `packageInstances.create` return type gains new fields — existing destructuring is safe since new fields are additive
- `services.create/update` return type gains `availablePaymentPlans` — additive, safe
- No existing return types are narrowed or removed

### 5.5 Blocking Prerequisites

1. **Tenant migration must apply before any API/frontend work** — Phase 1, Task 1.8 must complete first

**Resolved decisions (no longer blocking):**
- **Cron mechanism** → check-on-access only (`evaluateAndLockIfOverdue` called at booking + admin view). No cron endpoint needed for V1.
- **Due date interval** → per-service `installmentIntervalDays` column (default 30). Admin can override at payment confirmation via `nextIntervalDays` input.
- **Settings page** → new page at `/dashboard/settings/payment/view.tsx`, not an existing page.
- **Plan step placement** → after `info.tsx`, before `terms.tsx` in native purchase flow.
- **Credit decrement gap** → fix in Task 1.12 as part of Phase 1. Prerequisite for correct installment credit formula.

**Still open:**
- **Coach identification** — no explicit coach→client assignment table. Current approach: derive from `appointments.trainerId` for the client's active package instances. Confirm this is acceptable before implementing Phase 4 Task 4.7.

---

## 6. Cross-Cutting Concerns

### Error Handling

- All installment operations wrapped in try/catch at the router level
- Business rule violations (locked package, insufficient credits) throw descriptive `Error` messages
- Router converts to `ORPCError("BAD_REQUEST", { message })` for client-facing errors
- Audit events logged even on error paths (e.g., failed payment confirmation attempt)

### Testing Approach

**Unit tests** (`apps/server/src/tests/unit/services/`):
- `installment.service.test.ts` — credit calculation, amount splitting, schedule generation
- `organization-settings.service.test.ts` — get/upsert settings
- Mock `tenantDb` using existing `createMockTenantDb()` factory

**Integration tests** (`apps/server/src/tests/integration/`):
- Full flow: create package → generate installments → confirm payment → verify credits
- Locking flow: create overdue installment → run check → verify lock
- Manual override flow: lock → manual unlock → verify state

**Frontend tests** (`apps/web/src/__tests__/`):
- Admin installment dashboard: renders table, filters work
- Payment confirmation dialog: form validation, API call
- Client installment display: shows correct credits breakdown

### Migration Plan

1. Generate migration SQL via `bunx drizzle-kit generate --config=drizzle.tenant.config.ts`
2. Embed in `packages/db/src/migrate-tenant.ts` as `MIGRATION_XXXX_<name>`
3. Add to `TENANT_MIGRATIONS` array
4. Apply to all tenants via `apps/server/scripts/migrate-all-tenants.ts`
5. Verify via `bun db:studio`

### Rollback Strategy

- All new columns are additive with defaults — can be ignored if feature is disabled
- Feature can be gated: if `paymentPlanType` is NULL, all installment logic is skipped
- If rollback needed: remove frontend references, keep schema (dropping columns from production is risky)
- Installment data is isolated in new tables — can be truncated if needed

### Performance Considerations

- `checkOverdueInstallments` query should use indexes on `next_due_date` and `is_locked`
- Admin overview query joins package instances + services + (optionally users) — add appropriate indexes
- Notification idempotency check: index on `(packageInstanceId, eventType, createdAt)` in `installment_events`
- Cron endpoint should process tenants sequentially to avoid connection pool exhaustion

---

## 7. Open Questions / Risks

### Open Questions

1. **Cron trigger mechanism:** How should the daily overdue check run? Options:
   - Cloudflare Workers Cron Trigger (if server is on Workers)
   - External cron service (e.g., Vercel Cron)
   - Check-on-access only (lazy, no separate cron needed, but notifications won't fire if client doesn't access)
   - **Recommendation:** Hybrid — check-on-access for immediate enforcement + lightweight cron for notifications

2. **Coach→Client assignment:** The spec references "assigned coach" but no dedicated assignment table exists. Current options:
   - Derive from `appointments.trainerId` where `packageInstanceId` matches
   - Add explicit `coachId` field to `package_instances`
   - **Recommendation:** Derive from recent appointments for V1, add explicit assignment later

3. **Notification channel:** V1 uses in-app notifications only. Email/push to be added later. Confirm this is acceptable for launch.

4. **Tax calculation:** Spec says tax applied only at display time. The `services` table has `taxPercentage`. Confirm: installment amounts stored pre-tax, tax calculated on-the-fly for display using the service's tax rate?

5. **Early payment trigger:** Spec says client can "trigger early payment" when credits exhausted. In manual-only mode (no Stripe), this likely means: client taps "Request Early Payment" → notification sent to admin → admin confirms when transfer received. Confirm this flow.

6. **Multiple active packages:** Spec says packages are tracked independently. Current UI shows packages in a list, which handles this naturally. No additional work needed unless the booking flow needs a package selector when multiple are active.

7. **`payments` table limitation:** The existing `payments` table has `stripePaymentIntentId NOT NULL`, so manually confirmed installment payments cannot create rows there. The `installments` table tracks payment data independently. This means installment revenue will **not** appear in existing payment reports/dashboards until the `payments` table is adapted (add nullable `stripePaymentIntentId`, or create a separate `manual_payments` table). For V1, the admin installment dashboard is the source of truth for installment revenue.

### Risks

1. **Credit rounding edge cases:** `Math.floor` for credit allocation means clients get slightly fewer credits per installment (business-favorable). For packages where `creditsTotal % installmentsTotal !== 0`, the final installment unlocks more credits than earlier ones. This is by design but should be documented for admin training.

2. **Race condition on payment confirmation:** If two admins try to confirm the same installment simultaneously, the second should fail gracefully. Use optimistic locking: check installment status is still `pending` before updating.

3. **Timezone handling:** All `dueDate` and `nextDueDate` stored with timezone. Display should respect the organization's timezone (currently not configurable — defaults to server timezone). May need timezone setting in `organization_settings` later.

4. **Native app deployment lag:** If the backend deploys with installment support before the native app update reaches clients, clients on old versions won't see plan selection. Ensure the purchase flow gracefully handles the absence of `availablePaymentPlans` (treat as full-payment-only).
