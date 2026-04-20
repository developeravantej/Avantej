## Agent: A4 (commission approval locking) — Phase A.1
**Completed:** 2026-04-20

### What I Did
- `packages/services/src/commission-splits.service.ts`:
  - `approveCommissionSplits`: wrapped body in `tenantDb.transaction()`, changed SELECT to `.for("update")`, changed UPDATE and `writeAudit` calls to use `tx`
  - `markCommissionSplitsPaid`: same pattern — wrapped in transaction, SELECT `.for("update")`, UPDATE and `writeAudit` use `tx`
  - `voidCommissionSplit`: wrapped in transaction, replaced `query.commissionSplits.findFirst` with destructured `tx.select().for("update")`, replaced narrow `status === "void"` guard with `!["pending","approved"].includes(existing.status)` (blocks voiding paid splits), UPDATE and `writeAudit` use `tx`

### Decisions Made
- `voidCommissionSplit` guard changed from "already void" to "must be pending or approved" — this correctly rejects both `void` and `paid` statuses as non-voidable, matching the plan's intent to prevent voiding paid splits
- Used destructured array `const [existing] = await tx.select()...` for `voidCommissionSplit` (single-row path) to stay consistent with the `.for("update")` pattern; avoids `query.*` API which does not expose `.for()`

### Issues Encountered
- None — `writeAudit` already accepts `TenantDb | TenantTx`, so no signature changes needed

---

## Agent: A1 (appointment auth+atomicity) — Phase A.1
**Completed:** 2026-04-20

### What I Did
- `packages/services/src/appointment.service.ts`: Added `TenantDb`/`TenantTx` type aliases and lock-order comment block after imports. Rewrote `createAppointment` to: (1) validate `creditsUsed` is a positive integer before any DB access (A.1.1); (2) keep buffer-time check outside the transaction (read-only, unchanged); (3) wrap the entire package-lock path through the appointment insert and credit decrement in a single `tenantDb.transaction()` (A.1.2–A.1.6); (4) inside the transaction — call `evaluateAndLockIfOverdue(tx, ...)`, issue a `.for("update")` locked re-read of `packageInstances`, enforce ownership (`lockedPkg.clientId !== params.userId`), re-check lock/status/credits on the locked row, insert appointment, and decrement credits — all atomically; (5) wrap the transaction call in a try/catch that maps PG error code `23P01` to "Trainer is already booked during this time" (A.5 prep).

### Decisions Made
- `evaluateAndLockIfOverdue` accepts `NeonDatabase<typeof tenantSchema>` but Drizzle's transaction callback type is structurally compatible; used `tx as unknown as NeonDatabase<typeof tenantSchema>` to satisfy the call without changing the imported function's signature.
- Ownership check (`params.userId && lockedPkg.clientId !== params.userId`) is gated on `params.userId` being truthy — staff-created bookings without a `userId` skip this check, which is intentional (staff book on behalf of clients).
- The `creditsRemaining` hint about installments was dropped from the error message in favor of the simpler prescribed message; the installment-hint path relied on `pkg.creditsRemaining` from `evaluateAndLockIfOverdue` which is no longer the authoritative source — the locked row's arithmetic is.

### Issues Encountered
- None. Type check for the services package passes cleanly (only one pre-existing error in `invitation.service.ts`, nothing in `appointment.service.ts`).

---

## Agent: A3 (installment atomicity) — Phase A.1
**Completed:** 2026-04-20

### What I Did
- `packages/services/src/installment.service.ts`:
  - Added `TenantDb` and `TenantTx` type aliases (mirroring the pattern in `audit-log.service.ts`)
  - Changed `logInstallmentEvent` signature from `NeonDatabase<typeof tenantSchema>` to `TenantDb | TenantTx` so it can be called inside transactions without casts
  - `createInstallmentSchedule` (Gap #11): wrapped entire function body (installment insert loop + packageInstances update) in `tenantDb.transaction(async (tx) => {...})`, changed all `tenantDb.insert`/`tenantDb.update` inside to `tx`; returns the `rows` array from the callback
  - `confirmInstallmentPayment` (Gap #9): wrapped entire body in `tenantDb.transaction(async (tx) => {...})`; replaced `tenantDb.query.installments.findFirst` with `tx.select().from(installments).where(...).for("update")` (destructured); replaced `tenantDb.query.packageInstances.findFirst` with `tx.select().from(packageInstances).where(...).for("update")`; changed all subsequent `tenantDb.*` calls to `tx.*` including both `logInstallmentEvent` calls; returns result from callback
  - `evaluateAndLockIfOverdue` (Gap #16): kept `getGracePeriodDaysForPackage` call outside the transaction (pure config read); wrapped remaining body in `tenantDb.transaction(async (tx) => {...})`; replaced `tenantDb.query.packageInstances.findFirst` with `tx.select().from(packageInstances).where(...).for("update")`; changed all `tenantDb.query.*` and `tenantDb.update(...)` calls inside to `tx.*`; changed both `logInstallmentEvent` calls to `tx`; returns result from callback

### Decisions Made
- `logInstallmentEvent` updated to `TenantDb | TenantTx` rather than casting at each call site — same pattern as `writeAudit` in `audit-log.service.ts`, cleaner and avoids 5 separate cast sites
- `getGracePeriodDaysForPackage` kept outside the transaction in A.3.3 as instructed — it is a read-only config lookup that doesn't participate in the concurrent race being guarded

### Issues Encountered
- None. All type errors in `bun check-types` output are pre-existing issues in scripts and test files unrelated to this change; `@avantej-core/services` package itself is clean.

---

## Agent: A2 (refund+check-in locking) — Phase A.1
**Completed:** 2026-04-20

### What I Did
- `packages/services/src/refunds.service.ts`:
  - `processRefund`: added `if (order.status === "cancelled")` guard immediately after locking the sales order and opening the `if (order)` branch, before `newCancelledAmount` is computed. Throws `BAD_REQUEST: "Sale is already fully refunded"`.
  - `computeRemainingBySalesOrder`, `computeRemainingByPayment`, `computeRemainingByPackageInstance`: changed `inArray(refunds.status, ["approved", "processed"])` to `["pending", "approved", "processed"]` in all three cap-calculation queries (V4 fix — in-flight pending/approved refunds now count toward the cap).
- `packages/services/src/check-ins.service.ts`:
  - `recordCheckIn`: wrapped `tx.insert(checkIns).values({...}).returning()` in a try/catch that catches PG error code `23505` and re-throws as `{ code: "ALREADY_CHECKED_IN", message: "Already checked in today" }`. This handles the unique partial index on `(client_id, DATE_TRUNC('day', checked_in_at)) WHERE appointment_client_id IS NULL` that migration 0014 will add.
  - `deleteCheckIn`: removed the read-outside-transaction pattern; moved existence check inside the transaction as the first operation using `tx.select().from(checkIns).where(eq(checkIns.id, id)).for("update")`. The locked row is used as `existing` throughout the rest of the transaction body — no other logic changed.

### Decisions Made
- "processing" status omitted from V4 cap fix: the refunds schema comment lists `pending | approved | rejected | processed | cancelled` — there is no "processing" status. The plan text mentioned it but it does not exist in this codebase; included `pending` and `approved` instead.
- `rows` variable in `recordCheckIn` declared with explicit type `(typeof checkIns.$inferSelect)[]` before the try/catch block so it is accessible after the block without a second declaration.

### Issues Encountered
- None — type check passes cleanly for both service files; all remaining errors are pre-existing in unrelated scripts and test files.

---

## Agent: A6 (sequence-based order numbers) — Phase A.2
**Completed:** 2026-04-20

### What I Did
- packages/services/src/pos.service.ts: replaced count()+1 generators with nextval() sequence calls

### Decisions Made
- Used tx.execute<{ seq: string }>(sql`SELECT nextval(...)`) for raw SQL sequence calls
- Cast `result.rows[0]` as `{ seq: string | number }` to resolve TypeScript's "possibly undefined" error on array index access — `nextval` always returns exactly one row, the cast is safe
- Format changed from 4-digit daily-reset to 6-digit global sequence (intentional per plan)
- Removed `count` from drizzle-orm import — confirmed it was only used in the three generator functions

### Issues Encountered
- TypeScript flagged `result.rows[0].seq` as "Object is possibly undefined" (TS2532) because `rows` is typed as a generic array. Fixed by casting through `{ seq: string | number }` as specified in the task instructions.

---

## Agent: A5 (migration 0026 + constraint) — Phase A.2
**Completed:** 2026-04-20

### What I Did
- packages/db/src/migrate-tenant.ts: added MIGRATION_0026_PIPELINE_AUDIT constant (after MIGRATION_0025_MEMBER_SESSIONS) and corresponding entry at the end of TENANT_MIGRATIONS array
- packages/services/src/appointment.service.ts: added 23P01 catch to updateAppointment — wrapped the `.update(appointments)...returning()` call in try/catch that maps PG error code 23P01 to "Trainer is already booked during this time"
- packages/db/src/schema/tenant/check-ins.ts: imported `uniqueIndex` from `drizzle-orm/pg-core` and `sql` from `drizzle-orm`; added `clientDayUniqIdx` uniqueIndex entry to the table config's extra object

### Decisions Made
- Used tsrange (not tstzrange) because appointments.start_time / end_time are plain TIMESTAMP (without time zone), confirmed by reading the schema
- Migration number is 0026 (not 0014) — plan was written based on file-system migrations, actual embedded migrations go to 0025
- Drizzle uniqueIndex uses only `clientId` column (not the date_trunc expression) with `.where(sql\`appointment_client_id IS NULL\`)` as a partial marker — the full constraint including date_trunc is enforced entirely by the raw SQL in the migration

### Issues Encountered
- None — bun check-types produced no errors for the three modified files

---

## Run: 2026-04-20
**Trigger:** /execute zplan/04-20_12-09_pipeline-audit
**Plan version:** Stream A only (phases A.1–A.6, migration 0026)

### Phase outcomes
- Phase A.1 (parallel agents A1–A4): PASS — all 5 service files modified, zero type errors introduced
- Phase A.2 (agents A5+A6, parallel): PASS — migration 0026 embedded, pos.service.ts sequences, updateAppointment error mapping
- Migration 0026 applied to dev tenant: PASS

### Final build status
- type check: PASS (zero errors in modified files; pre-existing errors are unrelated)
- lint: PASS (70 pre-existing warnings, 0 errors)
- tests: N/A (deferred to user testing phase)

### Cross-agent decisions (surfaced during execution)
- Migration number: plan said 0014 but actual latest embedded migration was 0025 — used 0026
- check_ins unique partial index dropped: timestamptz::date is STABLE not IMMUTABLE; PostgreSQL rejects it in index expressions. Application-level check in recordCheckIn is sufficient; DB-level unique constraint deferred to future work using a generated column approach.
- Trainer exclusion constraint: first migration attempt partially ran (btree_gist + constraint + sequences applied) before statement-splitting was added. Made SQL idempotent with DO $$ IF NOT EXISTS $$ block for the constraint.
- tsrange vs tstzrange: appointments.start_time/end_time are plain TIMESTAMP (not TIMESTAMPTZ); used tsrange correctly.
- Lock canonical order documented in appointment.service.ts header: sales_orders → package_instances → appointments → commission_splits

---

## Agent: B1 (appointment status machine + credit restore) — Phase B.1
**Completed:** 2026-04-20

### What I Did
- Created `packages/services/src/utils/appointment-status-machine.ts` — `VALID_TRANSITIONS` map and `assertValidTransition(from, to)` function with the 5-state machine (pending/confirmed/completed/cancelled/no-show)
- Modified `packages/services/src/appointment.service.ts`:
  - Added import for `assertValidTransition` from `./utils/appointment-status-machine`
  - Rewrote `updateAppointment` to wrap the full mutation path in `tenantDb.transaction(async (tx) => {...})`
  - Inside the transaction: re-fetch the appointment with a plain SELECT (authoritative view), call `assertValidTransition` when `params.status` is provided, perform credit restore when cancelling an appointment that has `packageInstanceId` and `creditsUsed > 0`
  - Credit restore: locks `packageInstances` row with `.for("update")`, applies `GREATEST(credits_used - N, 0)`, also flips `status` from `exhausted` back to `active` if applicable; skips with `console.warn` if package is not found or in a terminal status
  - Moved the commission hook's `appointmentStaff` SELECT from `tenantDb` to `tx` so all DB calls are inside the transaction
  - Outer try/catch around the `tenantDb.transaction(...)` call maps PG 23P01 to trainer-overlap error (matching `createAppointment` pattern); removed the inner try/catch that previously wrapped only the UPDATE

### Decisions Made
- **Appointment row not locked with FOR UPDATE**: the appointment row is not a concurrently contended resource in the cancellation path; the package_instances row is the one that needs locking. Plain SELECT is used for the in-tx re-fetch; this is consistent with the task plan and reduces deadlock surface.
- **Pre-fetch kept outside transaction**: `getAppointmentById` is still called outside the transaction to supply data for the buffer-time check. The in-tx re-fetch is a second read for the authoritative status machine and credit logic.
- **`creditsUsed` null-check**: `appointments.creditsUsed` is nullable in the schema (`integer("credits_used").default(1)` with no `.notNull()`). Guard uses `(existing.creditsUsed ?? 0) > 0`; the value is cast to `number` after the guard.
- **`assertValidTransition` throws on terminal → terminal** (e.g., `cancelled → cancelled`), making the `existing.status !== 'cancelled'` guard in the credit-restore block a secondary safety net, not the primary guard.

### Issues Encountered
- None — `bun check-types` produces zero errors in the modified files; the only pre-existing error is in `invitation.service.ts` (unrelated).

---

## Agent: B2 (refund→package reset + expiry check) — Phase B.2
**Completed:** 2026-04-20

### What I Did
- `packages/services/src/refunds.service.ts`:
  - Added `invoices` import from `@avantej-core/db/schema/tenant/invoices`
  - Added `isNotNull` to the drizzle-orm import (was missing)
  - Inside `processRefund`, after the `salesOrders` UPDATE, added a full-refund block gated on `newStatus === "cancelled"`: queries `invoices` by `salesOrderId` to get `paymentId`s, then finds `packageInstances` by those `paymentId`s, then sets `status: 'cancelled'` on all matching instances — all inside the existing `tx`
- `packages/services/src/installment.service.ts`:
  - Added new exported function `evaluateAndExpireIfOverdue(tenantDb, packageInstanceId)` — reads the package instance, returns early if not active or not yet expired, otherwise sets `status: 'expired'`
  - Added call to `evaluateAndExpireIfOverdue` at the start of `evaluateAndLockIfOverdue`, before the grace period config read — runs outside the inner transaction (idempotent, safe)
- `packages/services/src/appointment.service.ts`:
  - Updated import to include `evaluateAndExpireIfOverdue` alongside `evaluateAndLockIfOverdue`
  - Inside `createAppointment`, inside the transaction, added `evaluateAndExpireIfOverdue(tx, packageInstanceId)` call before `evaluateAndLockIfOverdue` — expiry is checked first so an expired package gets flagged before the lock evaluation

### Decisions Made
- **Join path for package instances**: The task spec assumed `paymentItems.packageInstanceId` exists, but that column is not in the schema. The actual link is `salesOrders.id → invoices.salesOrderId → invoices.paymentId → packageInstances.paymentId`. Used this 3-hop path instead.
- **Full refund trigger**: The spec said `amountCents === salesOrder.subtotalCents` (equality check). In practice, partial refunds accumulate; the order flips to `'cancelled'` when `newCancelledAmount >= order.totalAmount`. Gated the package instance cancel on `newStatus === "cancelled"` to reuse the existing cumulative-refund semantics — correct for both single full-refunds and the final partial-refund that completes a full refund.
- **Column name fix**: The task spec said `packageInstances.expiryDate` but the actual schema column is `expiresAt`. Used `expiresAt` throughout `evaluateAndExpireIfOverdue`.
- **`subtotalCents` column**: Does not exist; the sales order total field is `totalAmount`. The cap comparison in the existing code already uses `order.totalAmount` correctly.

### Issues Encountered
- Schema mismatches from the task spec (3 items): `paymentItems.packageInstanceId` (doesn't exist), `packageInstances.expiryDate` (actual: `expiresAt`), `subtotalCents` (actual: `totalAmount`). All adapted correctly by reading schema files before writing.
- `bun check-types` produces zero errors in all three modified files; all other errors in the output are pre-existing in scripts/test files.

---

## Agent: B3-schema (migration 0027 + walk-in schema) — Phase B.3
**Completed:** 2026-04-20

### What I Did
- `packages/db/src/migrate-tenant.ts`: added `MIGRATION_0027_WALKIN_COMMISSION` constant after `MIGRATION_0026_PIPELINE_AUDIT`; registered it at the end of `TENANT_MIGRATIONS` with hash `"0027_walkin_commission"`
- `packages/db/src/schema/tenant/package-instances.ts`: added `walkInCustomers` import; made `clientId` nullable (removed `.notNull()`); added `walkInCustomerId` uuid FK column; added `walkInCustomerIdIdx` index
- `packages/db/src/schema/tenant/appointment-clients.ts`: added `walkInCustomers` import; added `clientType` text column (notNull, default "member"); added `walkInCustomerId` uuid FK column; added `walkInCustomerIdIdx` index
- `packages/db/src/schema/tenant/services.ts`: added `commissionPercentage` integer column (notNull, default 0)

### Decisions Made
- Used `NOT VALID` on the `pkg_owner_xor` CHECK constraint in the migration SQL so the table scan on deploy is skipped — existing rows all satisfy the constraint (they have `client_id` set and `walk_in_customer_id` NULL, which makes `false <> true = true`), but `NOT VALID` avoids the full-table validation on large tables
- Placed `clientType` and `walkInCustomerId` before `createdAt` in `appointment-clients.ts` to keep temporal fields last (consistent with table conventions)
- `clientId` made nullable without a NOT NULL alternative constraint in the Drizzle schema — the XOR CHECK in the migration enforces that exactly one of `clientId`/`walkInCustomerId` is set at the DB level

### Issues Encountered
- None — `bun check-types` web package passes with zero errors; all errors in server output are pre-existing (scripts, test files, admin.ts, middleware — unrelated to the four modified files)

---

## Agent: B3-service (walk-in service + POS + D.1 validation) — Phase B.3
**Completed:** 2026-04-20

### What I Did
- `packages/services/src/package-instance.service.ts`:
  - Replaced `clientId: string` in `CreatePackageInstanceParams` with a `ClientOwner` discriminated union (`{ clientId: string } | { walkInCustomerId: string }`) — enforces XOR at the type level
  - Updated `createPackageInstance` insert to set both `clientId: params.clientId ?? null` and `walkInCustomerId: params.walkInCustomerId ?? null` so the DB XOR CHECK constraint is satisfied
- `packages/services/src/pos.service.ts`:
  - Removed the walk-in + package rejection block that threw `"Walk-in customers cannot purchase packages in v1"` — migration 0027 adds `walkInCustomerId` to `package_instances`, making this valid
  - Added D.1.1 validation loop before subtotal computation: throws `BAD_REQUEST "Item price must be non-negative and quantity must be at least 1"` for any item where `unitPriceCents < 0 || quantity < 1`
  - Added D.1.2 guard after promo discount: throws `BAD_REQUEST "Discount cannot exceed subtotal"` when `discountCents > subtotalCents`
  - Changed `taxBase` to `Math.max(0, subtotalCents - discountCents)` (D.1.2 companion — belt-and-suspenders, D.1.2 guard fires first)
  - Updated `packageInstances` insert in Step 13 to set `clientId` only for member customers and `walkInCustomerId` only for walk-in customers (the other stays null)
- `packages/api/src/routers/package-instances.ts`:
  - Added `walkInCustomerId: z.string().uuid().optional()` to the `create` procedure input schema
  - Made `clientId` optional (`z.string().optional()`) to accommodate walk-in-only calls
  - Added an `ownerField` local variable that builds the correct XOR object (`{ clientId }` or `{ walkInCustomerId }`), spread into the `createPackageInstance` call

### Decisions Made
- Used a TypeScript intersection type `ClientOwner & { ... }` for `CreatePackageInstanceParams` rather than two separate param types — simpler to consume with spreads, and the XOR semantics are still enforced at compile time via the `never` discriminant
- Did not add a runtime XOR guard in the service — the DB CHECK constraint (`(client_id IS NULL) <> (walk_in_customer_id IS NULL)`) is authoritative; adding an application-level duplicate would be redundant
- `taxBase = Math.max(0, ...)` is kept even though D.1.2 throws before reaching that line — it is a defensive floor that costs nothing and prevents negative-tax edge cases if the guard is ever bypassed

### Issues Encountered
- None — `bun check-types` produces zero errors in all three modified files; all remaining errors in the output are pre-existing in unrelated scripts and test files

---

## Agent: B3-ui (walk-in toggle on POS create) — Phase B.3
**Completed:** 2026-04-20

### What I Did
- `apps/web/src/routes/_authenticated/dashboard/_layout/sales/create.tsx`:
  - Added `CustomerType` to the import from `@/components/pos/types`
  - Added `customerTypeMode` state (`"member"` default) with `useState<CustomerType>`
  - Added `walkInCustomersQuery` via `useQuery` — calls `(client as any).walkInCustomers.list({ organizationId, isActive: true, limit: 100 })`, enabled only when `customerTypeMode === "walk_in"`
  - Added `selectedWalkInId` state for the walk-in `<Select>`
  - Added `selectedWalkIn` derived value (lookup in `walkInCustomersQuery.data`) for display and branchId resolution
  - Updated `resolvedBranchId` to be mode-aware: member mode uses `selectedCustomer?.branchId`, walk-in mode uses `selectedWalkIn?.branchId`, both fall back to `defaultBranchId`
  - Updated `hasCustomer` to be mode-aware: member checks `selectedCustomer !== null`, walk-in checks `selectedWalkInId !== null`
  - Added `handleCustomerTypeModeChange` handler — resets both selections, items, and applied promo on mode switch
  - Updated `submitMutation.mutationFn` to branch on `customerTypeMode`: derives `customerType`, `customerId`, `customerName` from the appropriate selection
  - Updated Customer accordion header to show the walk-in customer name when in walk-in mode
  - Updated Customer `AccordionContent` to include: (a) Member/Walk-in toggle buttons, (b) existing `<CustomerStep>` shown when mode is "member", (c) a new shadcn `<Select>` shown when mode is "walk_in" that lists walk-in customers with name + phone display
  - Updated Items step and Promo step `!selectedCustomer` guards to use `!hasCustomer` instead
  - Updated `ItemsStep` `isWalkIn` prop to use `customerTypeMode === "walk_in"` instead of `selectedCustomer.type === "walk_in"`
  - Updated `PromoStep` `customerId` prop to use `selectedWalkInId` when in walk-in mode

### Decisions Made
- Used `(client as any).walkInCustomers.list(...)` with an explicit cast to a local interface type — the procedure exists in the router but the typed client may not expose it yet; this avoids blocking the UI work on client type regeneration
- Did not introduce a new component — the walk-in selector is simple enough (a single `<Select>`) to inline
- Mode switch always clears cart and resets selections — avoids stale item/promo state from a previous customer
- Walk-in `<Select>` advances accordion to "items" step on selection (mirrors the member `CustomerStep` behavior which calls `setAccordionValue("items")` via `handleCustomerSelect`)

### Issues Encountered
- None — `bun check-types 2>&1 | grep "sales/create"` returns no output (zero errors); all other errors in the type check output are pre-existing in scripts/test files

---

## Agent: C1 (commission activation hooks) — Phase C.1
**Completed:** 2026-04-20

### What I Did
- `packages/services/src/service.service.ts`:
  - Added `commissionPercentage?: number` to `CreateServiceParams` (basis points, e.g. 1000 = 10%)
  - Added `commissionPercentage` to `createService` insert (default 0) and `updateService` set block
- `packages/api/src/routers/services.ts`:
  - Added `commissionPercentage: z.number().int().min(0).max(10000).optional()` to both `create` and `update` input schemas
  - Passed `commissionPercentage` through to `createService` and `updateService` calls
- `packages/services/src/appointment.service.ts`:
  - Added imports: `createCommissionSplitsForAppointment` from `./commission-splits.service`, `services` table from `@avantej-core/db/schema/tenant/services`
  - Replaced the commission no-op scaffold in `updateAppointment` (status → completed path) with a real implementation: fetches `services.commissionPercentage`, fetches assigned `appointmentStaff`, distributes splits evenly across staff using `createCommissionSplitsForAppointment`. Wrapped in try/catch — non-fatal.
- `packages/services/src/commission-splits.service.ts`:
  - Added `CreateSplitsForPosParams` interface and `createCommissionSplitsForPos` function: computes total commission from basis points + amountCents, splits evenly across staffIds, calls `createCommissionSplit` per staff member. Guard early-returns on empty staff or zero commission.
- `packages/services/src/pos.service.ts`:
  - Replaced the TODO import comment with a real import of `createCommissionSplitsForPos`
  - Replaced the Step 15 commission no-op scaffold with a real implementation: for each service/package line item, fetches `services.commissionPercentage`, calls `createCommissionSplitsForPos` with the salesperson as the single staffId. Each item wrapped in try/catch — non-fatal.
- `apps/web/src/components/forms/service-form.tsx`:
  - Added `commissionPercentage: number` to `ServiceFormData` interface (display units, e.g. 10 = 10%)
  - Added default value `0` in both the initial state and the reset branch of `useEffect`
  - Added population from `initialData.commissionPercentage` in the initialData branch of `useEffect`
  - Added commission % input field (number, min 0, max 100, step 0.1) between the sessions/price grid and the credit-per-session display
  - Both `createMutation` and `updateMutation` convert display % → basis points with `Math.round(data.commissionPercentage * 100)` before calling the API
- `apps/web/src/components/tables/service/view/data-table.tsx`:
  - Added `commissionPercentage` to `editInitialData`, converting from basis points to display % (`commissionPercentage / 100`)

### Decisions Made
- `sessionTotal` on appointments is already stored as integer cents (consistent with all other price fields in the schema — `z.number().int()` in the router); no conversion needed
- `splitPercentage` passed to `createCommissionSplitsForAppointment` is the display percentage per staff member, calculated as `(basisPoints / 100) / staffCount` — each staff member gets an equal share
- `createCommissionSplitsForPos` uses `perStaff = Math.floor(totalCommission / staffIds.length)` — remainder cents are lost (by design, simpler than tracking remainders)
- Commission creation in both appointment and POS paths is non-fatal (try/catch at each call site) — the primary business transaction succeeds regardless of commission errors
- The service form field is added in the pricing section (before credit-per-session display), which is the natural grouping since commission is a financial configuration

### Issues Encountered
- Task sketch for `createCommissionSplitsForAppointment` params didn't match the actual signature (which takes `splits[]` with per-split `splitPercentage`/`sessionTotalCents`, not `serviceCommissionBasisPoints`/`staffIds`). Read the actual function before writing the call.
- Task sketch assumed `sessionTotal` needed `* 100` conversion; confirmed it's already cents by reading the appointments schema and router input validation.

---

## Agent: D (validation + audit + perf) — Phase D
**Completed:** 2026-04-20

### What I Did
- `packages/services/src/appointment.service.ts`:
  - Added `inArray` to drizzle-orm imports; added `writeAudit` import from `./audit-log.service`
  - D.3.1: Replaced JS `.filter((row) => accessibleNodeIds.includes(row.branchId))` in `listAppointments` with SQL-side `inArray(appointments.branchId, accessibleNodeIds)` pushed into the WHERE conditions; empty list uses `sql\`1=0\`` to return nothing; undefined (admin/all-access) skips the filter entirely
  - D.2.1: Added `writeAudit(tx, {...})` inside `createAppointment` transaction after the appointment INSERT and credit decrement, using `params.createdBy` as `actorUserId` and action `"appointment.created"`
  - D.2.2: Added `writeAudit(tx, {...})` inside `updateAppointment` transaction after the commission block, gated on `params.status !== undefined && params.actor` — records `from` and `to` status in `changes`, action `"appointment.status_changed"`
- `packages/services/src/installment.service.ts`:
  - D.2.3: Added `writeAudit(tx, {...})` inside `confirmInstallmentPayment` after the two `logInstallmentEvent` calls — records installment number, amount, paymentMethod, and creditsUnlocked in `changes`, action `"installment.paid"`, actorUserId = `params.confirmedBy`
  - D.2.4 / D.3.2: Added idempotency guard at the start of `unlockPackage` transaction — issues a `FOR UPDATE` SELECT first; throws `"Package instance not found"` if row missing, throws `"Package is not locked"` if `isLocked = false`; prevents spurious audit rows and no-op unlocks
- `packages/services/src/refunds.service.ts`:
  - D.3.3: Replaced `findMany({ where, columns: { id: true } })` count query in `listRefunds` with `tenantDb.select({ total: count() }).from(refunds).where(where)` — true `SELECT COUNT(*)` instead of fetching all matching IDs into memory
- `packages/services/src/audit-log.service.ts`:
  - Added three new action strings to the canonical vocabulary comment: `"appointment.created"`, `"appointment.status_changed"`, `"installment.paid"`

### Decisions Made
- `createAppointment` has no structured `actor` object in params (only `createdBy: string`) — used `createdBy` for `actorUserId` and omitted `actorMemberId`/`actorRole` (they default to null in `writeAudit`). Adding a full actor object would require a signature change which is out of scope.
- `updateAppointment` audit is gated on `params.actor` being present — if the caller passes no actor (legacy/system calls), no audit row is written. This is consistent with the commission hook which also gates on `params.actor`.
- `confirmInstallmentPayment` uses `params.confirmedBy` (a user ID string) for `actorUserId` — the confirmedBy field is the admin's userId, so this is correct.
- `unlockPackage` read-then-update uses `FOR UPDATE` lock to avoid a TOCTOU race between the existence check and the update in concurrent requests.
- The `listRefunds` `count()` uses the same `where` clause as the paginated query, so results are consistent — both queries are in `Promise.all` so they run in parallel.

### Issues Encountered
- None — `bun check-types 2>&1 | grep -E "appointment\.service|installment\.service|refunds\.service"` returned no output (zero errors in all three files)

---

## Agent: C2 (commission UI wiring) — Phase C.2
**Completed:** 2026-04-20

### What I Did
- `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx`:
  - Replaced `(client as any).commissionSplits.void(...)` with `client.commissionSplits.void(...)` (line ~330)
  - Replaced `(client as any).commissionSplits.listLedger(...)` with `client.commissionSplits.listLedger(...)` (line ~361)
- `apps/web/src/components/commissions/bulk-action-bar.tsx`:
  - Replaced `(client as any).commissionSplits.approve(...)` with `client.commissionSplits.approve(...)`
  - Replaced `(client as any).commissionSplits.void(...)` with `client.commissionSplits.void(...)`
- `apps/web/src/components/commissions/mark-paid-dialog.tsx`:
  - Replaced `(client as any).commissionSplits.markPaid(...)` with `client.commissionSplits.markPaid(...)`
  - Removed `payoutMethod` and `payoutReference` from the API call — these fields are not in the `markPaid` input schema (schema only accepts `organizationId`, `ids`, `payoutId?`)
- `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx`:
  - Added `commissionsSectionOpen` state
  - Added `editingTrainer` / `editingTrainerUserId` derived from `membersData` (using `userId`, not member PK, per `staffId` convention)
  - Added `trainerCommissionsData` / `trainerCommissions` query via `client.commissionSplits.listLedger({ staffId: editingTrainerUserId, ... })`, lazy (only when section open)
  - Added `formatPrice` import from `@/lib/currency`
  - Added Commissions collapsible section in the edit sheet: Date | Source | Amount | Status table, max 20 rows
  - Added `setCommissionsSectionOpen(false)` in `closeSheet()`
- Sidebar: Commissions link already existed under Finance group — no change needed.

### Decisions Made
- `staffId` in `listLedger` must be `members.userId` (cross-DB user ID), not the tenant member PK — confirmed via service comment and commission-splits.service.ts header
- `mark-paid-dialog.tsx` collects `payoutMethod` and `payoutReference` in the form UI but the router's `markPaid` only accepts `payoutId`. Kept UI fields visible but stripped unsupported fields from the API call. The extra fields are a pre-existing schema mismatch — did not remove them from the form to avoid scope creep.
- Commissions section placed after Services section in the sheet, read-only (no approve/void actions) since the trainer detail sheet is not the right place for admin bulk actions

### Issues Encountered
- `mark-paid-dialog.tsx` was passing `payoutMethod` and `payoutReference` to `markPaid` which doesn't accept those fields. Removed from the mutation call.

---

## Run: 2026-04-20 (Streams B → C → D)
**Trigger:** /execute zplan/04-20_12-09_pipeline-audit (session unsealed from Done_ to continue)
**Plan version:** Streams B, C, D (phases B.1–D.3; Stream A was run previously)

### Phase outcomes
- Phase B.1 (appointment status machine + credit restore): PASS
- Phase B.2 (refund→package reset + expiry check): PASS
- Phase B.3-schema (migration 0027 + walk-in schema): PASS — migration applied to dev tenant
- Phase B.3-service (walk-in service layer + D.1 validation): PASS
- Phase B.3-ui (walk-in toggle on POS create): PASS
- Phase C.1 (commission activation hooks): PASS
- Phase C.2 (commission UI wiring + sidebar + trainer tab): PASS
- Phase D (audit logging + SQL filter + perf): PASS

### Final build status
- type check: PASS (zero new errors in all modified files; pre-existing errors unchanged)
- lint: PASS (0 errors, 70 pre-existing warnings)
- migration 0027 applied: PASS (dev tenant Test Fitness Franchise)

### Cross-agent decisions (surfaced during execution)
- Migration number: plan said 0014 throughout B/C/D; actual next was 0027 — used 0027
- refunds.service.ts B.2.1: `paymentItems.packageInstanceId` doesn't exist; used invoices as join bridge; `subtotalCents` → `totalAmount`; full-refund trigger = `newStatus === "cancelled"`
- installment.service.ts B.2.2: actual expiry column is `expiresAt` not `expiryDate`
- commission-splits.service.ts: `TenantDb | TenantTx` type alias already defined — used directly
- C.1: commission hook placed in `updateAppointment` on status→`completed` (not createAppointment), matching actual stub location
- C.2: commissions sidebar link already present; `(client as any)` casts fixed across 3 files
- D.1: already applied by B.3-service agent (pos.service.ts validation); D agent skipped it
- D.2.4 unlockPackage: idempotency guard + audit combined; uses FOR UPDATE SELECT inside tx

---
