# Installment System — Hardening Plan

> Generated: 2026-04-15
> Scope: Five improvements to the existing installment system. All improvements layer onto the current schema/flows rather than reworking them.

---

## 1. Overview

### Problem Statement

The installment system (shipped in the `13-04_17-00_installment-credit-unlocking` plan) works end-to-end but has gaps that create operational pain:

1. **Grace period is org-wide.** A single `installment_grace_period_days` setting controls every service. A high-value PT package and a cheap group class use the same grace window. Service owners need per-service control.
2. **Refund amount is free-form.** `processRefund()` trusts whatever number the admin types. There's no calculation of what's actually fair based on `installmentsPaid`, `creditsUsed`, and the original price. Admins end up doing math in a spreadsheet.
3. **`creditsRemaining` dual-tracking.** Both `creditsUnlocked` and `creditsRemaining` live on `package_instances`. Booking atomically decrements `creditsRemaining`; installment confirmation recalculates it. If these ever diverge (e.g., a partially-failed write), the balance is silently wrong with no way to detect it.
4. **No installment rescheduling.** The only way to shift a future due date is the `nextIntervalDays` hack inside `confirmPayment`, which is logged as `payment_received` — not as a reschedule. Admin can't push a due date back without confirming a payment.
5. **Installment `notes` field exists but is never displayed.** Notes entered during `confirmPayment` sit in the DB unread.

### Goals & Success Criteria

- **G1:** Admin sets a grace period per service (replacing the org-wide setting). Existing org-wide setting is removed.
- **G2:** `creditsRemaining` is a single source of truth — computed from `creditsUnlocked - creditsUsed` at the database level. It cannot drift.
- **G3:** When refunding, the admin sees a suggested amount with a breakdown (paid, used, unused value) pre-populated in the dialog.
- **G4:** Admin reschedules any pending installment via a dedicated "Reschedule" action with a mandatory reason. Logged as a distinct event type.
- **G5:** Notes entered during payment confirmation are visible in the admin timeline.

### Scope

**In scope:**
- Per-service grace period column + UI + service-layer plumbing.
- Removing the org-wide grace period setting, Payment Settings page, and sidebar link.
- Migration of `creditsRemaining` to a Postgres generated column (`GENERATED ALWAYS AS`).
- New `calculateSuggestedRefund()` service function + exposed procedure + updated refund dialog.
- New `rescheduleInstallment()` service function + `installments.reschedule` procedure + UI dialog.
- Admin detail sheet surfaces installment notes.

**Out of scope (explicitly excluded by the user):**
- Email/push notifications for due/overdue/locked events.
- Native packages screen surfacing installment status (still a known gap).
- Online payment method integration (Stripe/FPX).
- Partial payment support, per-package grace period overrides.
- Backfilling historical audit data.

---

## 2. Technical Architecture

### 2.1 Schema Changes

**`packages/db/src/schema/tenant/services.ts`**
Add one column:
```typescript
// Grace period before a package locks after an installment becomes overdue.
// Null means "use the platform default" (7 days, constant in installment.service.ts).
gracePeriodDays: integer("grace_period_days"),
```
- Nullable by design so existing services don't need a backfill.
- No index needed — it's only read together with a service lookup that already has an index on `id`.

**`packages/db/src/schema/tenant/package-instances.ts`**
Convert `creditsRemaining` from a plain integer to a Postgres generated column:
```typescript
// REMOVED: creditsRemaining: integer("credits_remaining").notNull(),
// REPLACED WITH:
creditsRemaining: integer("credits_remaining")
  .generatedAlwaysAs(
    sql`COALESCE(credits_unlocked, credits_total) - credits_used`,
    { mode: "stored" },
  )
  .notNull(),
```
- `COALESCE(credits_unlocked, credits_total)` preserves legacy-package semantics (null `creditsUnlocked` means "all credits available").
- Stored (not virtual) so existing indexes over derived values still work and the column is queryable like any other integer.
- The generated column cannot be written — all INSERTs/UPDATEs that currently set `creditsRemaining` will fail at runtime. This is caught up-front in Phase 2.

**Deletions:**
- No rows are deleted, but the control-panel-level setting key `installment_grace_period_days` (stored in `organization_settings` table via `organization-settings.service.ts`) is no longer read. We leave the row in place — it's harmless — and note it in the service docstring for anyone who stumbles onto it later.

### 2.2 API Contracts

All new endpoints follow the existing oRPC pattern. Router: `packages/api/src/routers/installments.ts`.

**`installments.reschedule`** — admin-only
```typescript
input: {
  installmentId: string (uuid),
  newDueDate: string (ISO date),
  reason: string (min 1, max 500)
}
output: { id, dueDate, updatedAt }
errors: FORBIDDEN (not admin), NOT_FOUND, CONFLICT (already paid), BAD_REQUEST (date in past)
```

**`installments.suggestRefund`** — admin-only, read-only
```typescript
input: { packageInstanceId: string (uuid) }
output: {
  totalPaid: number,            // sum of paid installment amounts (cents)
  totalPaidTax: number,         // sum of paid installment tax amounts (cents)
  creditsTotal: number,
  creditsUnlocked: number,
  creditsUsed: number,
  pricePerCredit: number,       // cents, floor(totalPrice / creditsTotal)
  unusedCreditValue: number,    // cents, pricePerCredit × (creditsUnlocked - creditsUsed)
  suggestedRefund: number,      // min(unusedCreditValue, totalPaid)
  suggestedRefundTax: number,   // proportional share of totalPaidTax
  reasoning: string             // one-sentence breakdown for UI display
}
```
This is a pure function over existing DB state — no side effects.

**`installments.processRefund`** — already exists; no API changes, but the frontend now calls `suggestRefund` first to pre-populate the amount.

### 2.3 Key Technical Decisions

| Decision | Rationale |
|---|---|
| Per-service grace period, not per-package | Services are the configuration surface admins already use. Per-package overrides add UI complexity the user explicitly didn't ask for. |
| Keep `gracePeriodDays` nullable + fall back to constant `DEFAULT_GRACE_PERIOD_DAYS = 7` | No backfill required; services created before this change get sensible default; admins opt in per service. |
| Postgres generated column for `creditsRemaining` | Database-enforced invariant — impossible to drift. Beats application-level "always recalculate through this function" patterns, which depend on discipline. |
| Explicit `installment_rescheduled` event type | Distinguishes deliberate schedule shifts from payment-driven due-date updates in the audit trail. |
| Delete the Payment Settings page entirely | Cleaner than leaving a dead-end page that appears to work but controls nothing. |

---

## 3. User Journeys

### Journey A — Admin configures per-service grace period

**Who:** Tenant admin
**Trigger:** Editing a service via the existing Service form
**Steps:**
1. Admin opens `/dashboard/service/view` → clicks a service row → edit sheet opens on the right.
2. Admin scrolls to the "Payment Plans" section (existing section with the checkbox toggles).
3. Below "Installment Interval (days)" a new field "Grace Period (days)" appears → current value (or blank showing placeholder "Default: 7").
4. Admin types `14` → clicks Save → toast "Service updated" → sheet closes.
5. Re-opens service → field shows `14`.
6. **Backend:** `services.update` mutation persists `gracePeriodDays` on the services row.
**Where it lives:** Existing service edit sheet (`apps/web/src/components/forms/service-form.tsx`). No new page.

### Journey B — Admin processes refund with suggested amount

**Who:** Tenant admin
**Trigger:** Opening a package instance in the admin installments detail sheet
**Steps:**
1. Admin opens `/dashboard/packages/installments/view` → clicks a row → detail sheet opens.
2. Admin clicks "Process Refund" → dialog opens.
3. Dialog shows a new breakdown block at the top:
   ```
   Customer paid: RM 500.00 (of RM 1,000.00)
   Credits used: 3 of 10 (2 of 5 unlocked)
   Unused value: RM 200.00 (2 unused credits × RM 100.00)
   Suggested refund: RM 200.00
   ```
4. Amount field is pre-populated with `200.00`. Admin can override.
5. Admin enters reason → clicks Confirm → `installments.processRefund` fires with the (possibly adjusted) amount.
6. Toast "Refund processed" → dialog closes.
**Where it lives:** Existing "Process Refund" dialog inside the installments detail sheet.

### Journey C — Admin reschedules a pending installment

**Who:** Tenant admin
**Trigger:** Opening a package instance's detail sheet
**Steps:**
1. Admin opens the detail sheet (same as Journey C, step 1).
2. In the installment timeline, pending rows now show a new "Reschedule" icon button next to the existing "Confirm Payment" button.
3. Admin clicks "Reschedule" → small dialog opens with: date picker (defaults to current due date), reason textarea (required), Confirm / Cancel.
4. Admin picks a new date in the future, enters reason → Confirm.
5. `installments.reschedule` mutation runs → installment's `dueDate` updated; if this is the next pending installment, `packageInstances.nextDueDate` updates too; `installment_rescheduled` event logged.
6. Toast "Installment rescheduled" → dialog closes → timeline refreshes with new date.
**Where it lives:** Inline dialog within the existing detail sheet.

### Journey D — Admin reads payment notes (micro-journey)

**Who:** Tenant admin
**Trigger:** Viewing installment timeline in the detail sheet
**Steps:**
1. Admin opens detail sheet.
2. For any paid installment, if `notes` is non-empty, a small muted-foreground italic block appears under the row: `"Paid by bank transfer, ref #12345"`.
**Where it lives:** Existing timeline component. Rendering-only change.

### Journey F — Removal: old Payment Settings page

The existing `/dashboard/settings/payment/view` page is **deleted**, not migrated. The sidebar link is removed. Any bookmarked URL returns the 404 page. This is acceptable because (a) the setting it controlled is being replaced by the service-level control, and (b) the key mismatch bug meant the page was never functional for its intended purpose anyway.

---

## 4. Phased Implementation

Phases are ordered so each one delivers a complete journey and later phases can build on earlier ones. Each phase is independently deployable.

### Phase 1 — Per-service grace period (Journey A)

**Goal:** Replace the org-wide grace period with a per-service column. Delete the old settings page.

**Tasks:**

**1.1** Schema: add `gracePeriodDays` nullable integer to services table.
- Edit `packages/db/src/schema/tenant/services.ts` (after line 81).
- Run `bun db:generate` to emit a migration (will be `packages/db/src/migrations/tenant/NNNN_*.sql`).
- Embed the new migration number constant in `packages/db/src/migrate-tenant.ts` following the existing `MIGRATION_0007_SHORT_KORATH` pattern.
- Run `bun db:push` against dev.

**1.2** Introduce `DEFAULT_GRACE_PERIOD_DAYS = 7` constant in `packages/services/src/installment.service.ts` (top of file, after imports). Export it.

**1.3** Add a service helper `getGracePeriodDaysForPackage(tenantDb, packageInstanceId)` in `installment.service.ts`:
- Joins `package_instances → services` on `service_id`.
- Returns `services.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS`.
- Does **not** query `organization_settings` at all.

**1.4** Change `evaluateAndLockIfOverdue()` signature from `(tenantDb, packageInstanceId, gracePeriodDays: number)` to `(tenantDb, packageInstanceId)`. Internally call `getGracePeriodDaysForPackage` to resolve the days. Keep it idempotent.

**1.5** Update callers:
- `packages/services/src/appointment.service.ts:210-211` — remove `getGracePeriodDays` import (line 19), remove the `const gracePeriodDays = ...` line, drop the third argument.
- `packages/api/src/routers/installments.ts:112-116` — same cleanup.

**1.6** Delete the deprecated `getGracePeriodDays` function in `packages/services/src/organization-settings.service.ts` (lines 62-67) and its export from `packages/services/src/index.ts:235`. Leave `getSetting`/`upsertSetting` in place (they're generic).

**1.7** Expose `gracePeriodDays` in the `services` router input schemas:
- `packages/api/src/routers/services.ts` — add to both `create` (around line 171-172) and `update` (around line 284-285) input Zod schemas:
  ```typescript
  gracePeriodDays: z.number().int().min(0).max(90).nullish(),
  ```

**1.8** Update the Service form:
- `apps/web/src/components/forms/service-form.tsx` — add `gracePeriodDays: number | null` to form state (near line 22-23).
- Render a number input labeled "Grace Period (days)" below the installment interval field (around line 627). Show helper text: "How many days after an overdue installment before the package locks. Leave blank to use the default of 7 days."
- Include the value in both create (line 74-75) and update (line 102-103) mutation payloads.

**1.9** Delete:
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/payment/view.tsx`
- The Payment Settings entry in `apps/web/src/components/app-sidebar.tsx:237`
- After deletion, run `bun --filter web tsr generate` (or whatever the project's route-gen script is; `routeTree.gen.ts` will regenerate via the TanStack Router plugin on `bun dev:web`).

**1.10** Tests:
- Unit test `getGracePeriodDaysForPackage` — returns service value when set, default when null, default when service missing grace field.
- Unit test: `evaluateAndLockIfOverdue` uses the per-service value (fixture: service with `gracePeriodDays = 14` → package overdue by 10 days → not locked; by 15 days → locked).
- Update existing tests in `apps/server/src/tests/unit/services/` that pass `gracePeriodDays` as an argument.

**Files affected:** 9 production files + test files.
**Dependencies:** None (foundational).
**Acceptance:** Journey A is fully exercisable end-to-end. Old sidebar entry gone. `bun check-types` passes.

---

### Phase 2 — `creditsRemaining` single source of truth (silent refactor)

**Goal:** Convert `creditsRemaining` to a generated column. No user-visible change; eliminates a class of data-corruption bugs.

This phase is deliberately early because it touches hot paths (booking, purchase) and we want it stable before the later additive phases.

**Tasks:**

**2.1** Audit every code path that writes `creditsRemaining`. From the existing grep, the files are:
- `packages/services/src/package-instance.service.ts` (create path)
- `packages/services/src/installment.service.ts` (confirmPayment recalc, line ~240-260)
- `packages/services/src/appointment.service.ts` (booking decrement)
- `apps/native/app/(app)/dashboard/buy-package/pay.tsx` (sets to 0 for installment plans)
- `apps/web/src/components/tables/package-instances/view/columns.tsx` (read-only, no change needed)
- Seed scripts in `apps/server/scripts/`

For each writer, remove the write. Instead, ensure the relevant input fields (`creditsUnlocked`, `creditsUsed`, `creditsTotal`) are set correctly.

**2.2** For the booking hot path (`appointment.service.ts:258-268`): the current atomic update does
```sql
UPDATE package_instances SET credits_remaining = credits_remaining - N, credits_used = credits_used + N
```
Change to:
```sql
UPDATE package_instances SET credits_used = credits_used + N
```
The generated column recomputes automatically. But the existing row-level check (ensuring `creditsRemaining >= N` before the UPDATE) must still occur. Keep that read → assert → write pattern, just drop the `creditsRemaining` from the SET clause.

**2.3** For `installment.service.ts confirmInstallmentPayment`: remove the `creditsRemaining` from the SET clause. Keep updating `creditsUnlocked`, `installmentsPaid`, `nextDueDate`.

**2.4** For `package-instance.service.ts create`: when inserting a new row, don't pass `creditsRemaining`. Pass `creditsUnlocked` (or leave null for legacy), `creditsTotal`, `creditsUsed: 0`.

**2.5** For `apps/native/app/(app)/dashboard/buy-package/pay.tsx:72-75`: remove the conditional that sets `creditsRemaining: 0` for installment plans. The server-side create already sets `creditsUnlocked: 0` for installment plans, which is what matters.

**2.6** Migration: convert `creditsRemaining` to generated column.
- Drizzle doesn't currently support altering a column to generated; the migration must be hand-edited SQL:
  ```sql
  ALTER TABLE package_instances DROP COLUMN credits_remaining;
  ALTER TABLE package_instances ADD COLUMN credits_remaining INTEGER
    GENERATED ALWAYS AS (COALESCE(credits_unlocked, credits_total) - credits_used) STORED NOT NULL;
  ```
- Caveat: dropping and re-adding breaks any view or index depending on it. Verify nothing uses the column in a view.
- Create the migration by running `bun db:generate`, then hand-edit the generated SQL, then embed the new migration in `migrate-tenant.ts` as a `MIGRATION_NNNN_*` constant (matching existing pattern).

**2.7** Update the Drizzle schema (`package-instances.ts:44`) to use `.generatedAlwaysAs(...)`.

**2.8** Tests:
- Add integration test: create package with `creditsTotal=10, creditsUnlocked=null` → `creditsRemaining` reads as 10.
- Create installment package with `creditsUnlocked=0` → `creditsRemaining` reads as 0.
- Book an appointment (decrement `creditsUsed`) → `creditsRemaining` auto-decrements.
- Attempt to write `creditsRemaining` directly → Postgres error.

**Deployment coupling:** **Phase 2 must ship as a single atomic deploy.** Code writing to `creditsRemaining` after the migration will fail. If split, a rolling deploy leaves some instances still writing to the now-generated column → errors. Lock-step deploy: migrate DB + ship new code together.

**Files affected:** ~6 writers + schema + migration.
**Dependencies:** Phase 1 ideally deployed first (smaller blast radius if something goes wrong).
**Acceptance:** Integration test proves `creditsRemaining` cannot be written. Booking a session still decrements it. No regression in the installment credit-unlock test suite.

---

### Phase 3 — Refund suggestion (Journey B)

**Goal:** Suggested refund amount with breakdown in the existing refund dialog.

**Tasks:**

**4.1** New pure helper `calculateSuggestedRefund(pkg, paidInstallments)` in `installment.service.ts`. Pure function over DB state — no DB writes. Signature:
```typescript
export function calculateSuggestedRefund(input: {
  creditsTotal: number;
  creditsUnlocked: number;
  creditsUsed: number;
  totalPrice: number;      // cents
  paidAmount: number;      // sum of paid installment amounts, cents
  paidTaxAmount: number;   // sum of paid installment tax, cents
}): {
  pricePerCredit: number;
  unusedCredits: number;
  unusedCreditValue: number;
  suggestedRefund: number;
  suggestedRefundTax: number;
  reasoning: string;
}
```
Logic:
- `pricePerCredit = Math.floor(totalPrice / creditsTotal)`
- `unusedCredits = creditsUnlocked - creditsUsed` (clamp to ≥ 0)
- `unusedCreditValue = pricePerCredit × unusedCredits`
- `suggestedRefund = Math.min(unusedCreditValue, paidAmount)` — cap at what was actually paid
- `suggestedRefundTax = paidTaxAmount × (suggestedRefund / paidAmount)` if paidAmount > 0, else 0
- `reasoning` = human-readable one-liner for UI.

**4.2** Wrapper `getSuggestedRefund(tenantDb, packageInstanceId)`:
- Fetch package instance.
- Fetch paid installments, sum `amount` and `taxAmount`.
- Call `calculateSuggestedRefund`.
- Return all inputs + outputs (frontend needs inputs for the breakdown block).

**4.3** oRPC procedure `installments.suggestRefund` in `packages/api/src/routers/installments.ts`. Admin-only. Shape per §2.2.

**4.4** Frontend:
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx` — find the refund dialog (should be a child component or inline). When the dialog opens, fire `useQuery` for `installments.suggestRefund`.
- Render the breakdown block at the top of the dialog.
- Set the amount input's initial value to the suggested amount (in the display unit — RM, not cents).
- Keep the existing override behaviour: admin can type any amount.

**4.5** Tests:
- Unit test `calculateSuggestedRefund` with the three canonical cases:
  - Fully paid, no usage: `suggestedRefund === totalPrice`
  - Half paid, 3 credits used out of 5 unlocked: `suggestedRefund === 2 × pricePerCredit`
  - Fully used: `suggestedRefund === 0`
- Integration test: seed package with 2 paid installments of $500 each, 3 of 10 credits used → `suggestRefund` returns $700.

**Files affected:** `installment.service.ts`, `installments.ts` router, `installments/view.tsx` + refund dialog component.
**Dependencies:** Phase 2 (needs `creditsRemaining` to be reliable, though this uses `creditsUnlocked - creditsUsed` directly).
**Acceptance:** Journey B complete. Admin opens refund dialog → sees pre-populated amount + breakdown.

---

### Phase 4 — Installment rescheduling + notes display (Journeys C, D)

**Goal:** Dedicated reschedule action + surface existing notes.

**Tasks:**

**5.1** New service function `rescheduleInstallment(tenantDb, installmentId, newDueDate, actorId, reason)`:
- Find the installment. If not pending (status = paid or not-yet-due-evaluated-as-overdue is OK, already-locked package is NOT OK), throw `CONFLICT`.
- Validate `newDueDate > now`. If not, throw `BAD_REQUEST`.
- Update `installments.dueDate = newDueDate, updatedAt = now`, and set `status = "pending"` (clears `overdue` if it was).
- Check if this installment is the next pending one for the package (lowest `installmentNumber` with `status = "pending"`). If yes, update `packageInstances.nextDueDate = newDueDate` and clear `gracePeriodEndsAt` (we've moved the goalposts).
- Log `installment_rescheduled` event with `metadata` JSON `{ oldDueDate, newDueDate }` and the reason.

**5.2** oRPC procedure `installments.reschedule` in `packages/api/src/routers/installments.ts`. Admin-only. Shape per §2.2.

**5.3** Frontend dialog component `RescheduleInstallmentDialog` (co-located with existing confirm-payment dialog in the installments view file). Date picker + reason textarea + Confirm/Cancel. Disables Confirm when reason is empty or date is in the past.

**5.4** In the installments timeline, add a small icon button (calendar icon) next to pending rows. Opens the reschedule dialog.

**5.5** Notes display (Journey D): in the same timeline, for any installment row, if `notes` is non-empty, render it in `text-sm italic text-muted-foreground` under the row. No new API call — notes are already returned by `installments.listByPackageInstance`.

**5.6** Tests:
- Unit test `rescheduleInstallment`:
  - Reschedule next pending installment → `packageInstances.nextDueDate` updates, `gracePeriodEndsAt` clears, event logged.
  - Reschedule a later pending installment → only the installment row changes, `packageInstances.nextDueDate` untouched.
  - Reschedule a paid installment → `CONFLICT` error.
  - Reschedule with past date → `BAD_REQUEST`.
- Frontend test: open reschedule dialog → pick date, enter reason, confirm → mutation fires with correct payload.

**Files affected:** `installment.service.ts` (+1 function), `installments.ts` router (+1 proc), `installments/view.tsx` (dialog + icon + notes render).
**Dependencies:** Phase 1 (so the flow touches the new per-service grace period when clearing `gracePeriodEndsAt`).
**Acceptance:** Journeys C and D complete. Admin reschedules a pending installment → timeline shows new date and event appears in `installment_events`. Notes appear under paid installment rows.

---

### Phase Summary Table

| Phase | Delivers Journey | Files Touched (approx) | Risk |
|---|---|---|---|
| 1. Per-service grace | A | 9 prod + tests | Low (additive, with deletion) |
| 2. creditsRemaining refactor | — (invisible) | 6 prod + migration | **High — must deploy atomically** |
| 3. Refund suggestion | B | 3 files | Low |
| 4. Reschedule + notes | C, D | 3 files | Low |

---

## 5. Impact & Breakage Analysis

### 5.1 Removed code (what breaks if we miss a caller)

**`getGracePeriodDays(tenantDb)` in `organization-settings.service.ts`**
Callers confirmed via grep:
- `packages/services/src/appointment.service.ts:19, 210`
- `packages/api/src/routers/installments.ts:15, 112`
- `packages/services/src/index.ts:235` (barrel export)

After Phase 1, these are all removed. A stray caller would break `bun check-types`. **Verification gate:** full type-check must pass before merging Phase 1.

**`organization_settings` row with key `installment_grace_period_days`**
Not deleted from DB (no migration). Stays as orphaned data. Note this in the Phase 1 commit message so ops doesn't wonder about the stale row.

**`/dashboard/settings/payment/view` route**
Callers: `app-sidebar.tsx:237` (removed in Phase 1), any bookmarked URL will now 404. Acceptable.

### 5.2 `creditsRemaining` write sites — exhaustive list

Phase 2 must touch all of these. Grep confirmed:

| File | Current behaviour | Change |
|---|---|---|
| `packages/services/src/package-instance.service.ts` | Inserts with explicit `creditsRemaining` value | Stop passing it — auto-computed |
| `packages/services/src/installment.service.ts` (confirmPayment) | Sets `creditsRemaining = newUnlocked - creditsUsed` | Remove from SET clause |
| `packages/services/src/appointment.service.ts:258-268` | Atomic decrement | Only update `creditsUsed` now |
| `apps/native/app/(app)/dashboard/buy-package/pay.tsx:72-75` | Sets `creditsRemaining: 0` for installment plans | Remove this; server sets `creditsUnlocked: 0` |
| `apps/server/scripts/seed-app-data.ts`, `seed-business-data.ts`, `test-write-endpoints.ts` | Seed data with explicit value | Remove from seed payloads |
| `apps/server/src/tests/unit/services/package-instance.test.ts` | Tests that create fixtures | Update fixtures |
| `apps/server/src/tests/helpers/fixtures.ts` | Mock factory | Remove from factory |

**Reads** (no change needed, just verify they still work):
- `apps/web/src/components/tables/package-instances/view/columns.tsx` — displays `creditsRemaining`. Still works because the column still exists (now generated).
- `apps/native/app/(app)/dashboard/packages/index.tsx` — displays remaining credits on package cards. Still works.

### 5.3 `evaluateAndLockIfOverdue` signature change

Function signature drops the `gracePeriodDays` parameter in Phase 1. Callers:
- `appointment.service.ts:211` — fix in Phase 1.
- `installments.ts router:113-116` — fix in Phase 1.
- Any test mocks — fix in Phase 1.

After Phase 1, all existing callers use the simplified two-argument signature.

### 5.4 Deployment coupling

| Phase | Must deploy with | Why |
|---|---|---|
| 1 | Standalone OK | Service-layer change; API backward-compatible |
| 2 | **Atomic** (migration + code) | Generated column; code that writes to `creditsRemaining` will fail after migration |
| 3 | Standalone OK | Purely additive |
| 4 | Standalone OK | Purely additive |

### 5.5 Nullable/optional field assumptions

- `services.gracePeriodDays` — **nullable**, read as `?? DEFAULT_GRACE_PERIOD_DAYS`. Any code that assumes non-null is a bug. The only reader is `getGracePeriodDaysForPackage`.
- `package_instances.creditsUnlocked` — **remains nullable** after Phase 2. The generated column's `COALESCE(credits_unlocked, credits_total)` handles null. Do NOT make this NOT NULL — legacy packages rely on null-semantics.
- `installments.notes` — **nullable**. Rendering must short-circuit on empty/null.

### 5.6 Return type changes

- `evaluateAndLockIfOverdue` still returns `typeof packageInstances.$inferSelect` — no shape change, just fewer parameters.
- `services` router `create`/`update` now return rows that include `gracePeriodDays`. Frontend reads it via the form's prefill. No destructure breakage.

### 5.7 Blocking prerequisites

None. Every phase can be started immediately once the prior one is merged. No external vendor decisions, no schema review needed outside the team.

---

## 6. Cross-Cutting Concerns

### 6.1 Error handling

- Reschedule: validate date is in the future on both client and server; client validation is UX, server is security.
- Refund suggestion: if `creditsTotal` is 0 (data corruption), return `pricePerCredit: 0` and `suggestedRefund: 0`; don't throw.

### 6.2 Testing approach

- **Unit:** pure calc functions (`calculateSuggestedRefund`, `getGracePeriodDaysForPackage` with mocks).
- **Integration:** backed by a real tenant DB branch. Priority targets: generated-column behaviour, reschedule side-effects.
- **E2E:** out of scope for this plan unless Playwright suite is already hooked. Manual verification per the `docs/INSTALLMENT_TESTING.md` journey steps is sufficient.

### 6.3 Migration plan

- Phase 1: standard Drizzle migration via `bun db:generate` + embed in `migrate-tenant.ts`. Nullable column — zero downtime.
- Phase 2: **hand-edited migration** (Drizzle can't express "convert column to generated"). Requires a brief table-level lock. Verify in a dev environment first. Coordinate with prod ops for a deploy window; table should be fast to rewrite (generated STORED column is populated at migration time).
- Phases 3, 4: no migration.

### 6.4 Rollback strategy

- **Phase 1:** revert code + drop `gracePeriodDays` column (optional). Re-add `getGracePeriodDays` caller. Takes ~15 min.
- **Phase 2:** most complex. Rollback = re-add plain `creditsRemaining` column, backfill from `COALESCE(credits_unlocked, credits_total) - credits_used`, revert code. Takes ~30 min + data backfill. **Recommendation:** deploy Phase 2 early in a week with a rollback drill done in staging first.
- **Phases 3, 4:** pure code revert. Near-instant.

### 6.5 Performance considerations

- Generated column: Postgres recomputes on INSERT/UPDATE of dependency columns. For our write pattern (decrement `creditsUsed` on booking), this is a no-op cost.
- Refund suggestion: one extra query per dialog open. Negligible.

---

## 7. Open Questions / Risks

### Open questions

1. **Refund tax proportionality.** The plan proportionalises tax by `suggestedRefund / paidAmount`. If jurisdictions require tax to be refunded based on tax-inclusive service value instead, the formula changes. Confirm with the finance stakeholder before shipping Phase 3.

### Risks

- **R1 (high):** Phase 2's generated column migration is a one-shot operation. Test in staging with production-sized data first. Rollback is possible but painful.
- **R2 (low):** Service owners setting `gracePeriodDays = 0` effectively disables grace period for that service. Document this intentional behaviour in the UI helper text and Phase 1 Task 1.8.
- **R3 (low):** Reschedule clears `gracePeriodEndsAt`. If the admin reschedules to a date that is already past due, the next booking attempt will restart the grace-period flow — acceptable idempotent behaviour.

---

## Appendix: Changed-file inventory

**New files:**
- Phase 1 migration SQL (generated)
- Phase 2 migration SQL (hand-edited)

**Modified — backend:**
- `packages/db/src/schema/tenant/services.ts`
- `packages/db/src/schema/tenant/package-instances.ts`
- `packages/db/src/migrate-tenant.ts` (2 new migration constants)
- `packages/services/src/installment.service.ts` (+3 functions, 1 signature change)
- `packages/services/src/organization-settings.service.ts` (−1 function)
- `packages/services/src/appointment.service.ts` (caller update, write-path update)
- `packages/services/src/package-instance.service.ts` (write-path update)
- `packages/services/src/index.ts` (export updates)
- `packages/api/src/routers/services.ts` (input schema fields)
- `packages/api/src/routers/installments.ts` (+2 procedures, 1 caller update)

**Modified — frontend:**
- `apps/web/src/components/forms/service-form.tsx`
- `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx`
- `apps/native/app/(app)/dashboard/buy-package/pay.tsx`

**Deleted — frontend:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/payment/view.tsx`

**Tests:**
- `apps/server/src/tests/helpers/fixtures.ts`
- `apps/server/src/tests/unit/services/package-instance.test.ts`
- `apps/server/src/tests/unit/services/installment.test.ts` (new assertions)
