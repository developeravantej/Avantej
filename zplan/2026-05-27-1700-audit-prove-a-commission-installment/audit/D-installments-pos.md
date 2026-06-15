# Domain D — Installments (Plans, Schedule, Sweep, POS first-installment)

Scope: `installmentPlansRouter` + `installmentsRouter`, `installment-plan.service`, `installment.service`, `installment-sweep.service`, payment list UI.

Owned source files (read-only):
- `packages/api/src/routers/installment-plans.ts`
- `packages/api/src/routers/installments.ts`
- `packages/services/src/installment-plan.service.ts`
- `packages/services/src/installment.service.ts`
- `apps/server/src/services/installment-sweep.service.ts`
- `apps/server/src/services/installment-sweep.test.ts`
- `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx`

Cross-checked (read-only, for caller wiring / contract):
- `apps/server/src/index.ts` (cron dispatch)
- `apps/server/wrangler.jsonc` (cron triggers)
- `packages/api/src/routers/base-router.ts` (router exposure)
- `packages/api/src/routers/package-instances/create.procedures.ts` (one caller of `createInstallmentSchedule`)
- `packages/services/src/pos.service.ts` lines 600–770 (POS first-installment-at-counter flow)
- `packages/api/src/context.ts` (`installmentLockOnOpen` flag wiring)

---

## 1. Endpoints

### `installmentPlansRouter` — `installment-plans.ts`
Mounted at `base-router.ts:125` as `installmentPlans`.

| Procedure | Verb | Auth / Permission | Notes |
|---|---|---|---|
| `list` | query | tenant + `service_management:read` (skipped for role `"client"`) | `installmentPlansRouter.list` :16-37 |
| `getById` | query | same as list | :39-64 |
| `getByCode` | query | same as list | :66-85 |
| `create` | mutation | `service_management:update` | :87-145; maps unique/duplicate → `CONFLICT`, validation → `BAD_REQUEST` |
| `update` | mutation | `service_management:update` | :147-206; `code` immutable (TS `code?: never`) |
| `setDefault` | mutation | `service_management:update` | :208-224 |
| `deactivate` | mutation | `service_management:delete` | :226-242 |
| `reactivate` | mutation | `service_management:update` | :244-256 |

### `installmentsRouter` — `installments.ts`
Mounted at `base-router.ts:124` as `installments`.

| Procedure | Verb | Auth / Permission | Notes |
|---|---|---|---|
| `confirmPayment` | mutation | `service_management:update` | :32-57 |
| `listByPackageInstance` | query | owner-OR-staff (custom); staff also needs `service_management:read` | :59-108; opportunistically calls `evaluateAndLockIfOverdue` when `context.installmentLockOnOpen !== false` |
| `manualUnlock` | mutation | role === `"admin"` (NOT permission-based) | :110-143 |
| `processRefund` | mutation | role === `"admin"` | :145-182 |
| `adminOverview` | query | `service_management:read` | :184-216 |
| `getEvents` | query | `service_management:read` | :218-237 |
| `suggestRefund` | query | role === `"admin"` | :239-259 |
| `adjustCredits` | mutation | role === `"admin"` | :261-302 |
| `setOverdraft` | mutation | role === `"admin"` | :304-338 |
| `reschedule` | mutation | role === `"admin"` | :340-360 |
| `waive` | mutation | role === `"admin"` | :362-380 |
| `resetOverride` | mutation | `service_management:update` (NOT admin-only — inconsistent w/ other override mutations) | :382-392 |

---

## 2. Logic Functions

### `installment-plan.service.ts`
| Function | Purpose | Caller(s) | Status |
|---|---|---|---|
| `listInstallmentPlans` :28 | List plans, optional activeOnly | `installmentPlansRouter.list` | wired |
| `getInstallmentPlanById` :44 | Lookup by id | router.getById | wired |
| `getInstallmentPlanByCode` :53 | Lookup by code (used during POS) | router.getByCode + POS code path | wired |
| `createInstallmentPlan` :63 | Create, validates bps + numInstallments, clears prior default in tx | router.create | wired |
| `updateInstallmentPlan` :105 | Patch update; `code` excluded at type level | router.update | wired |
| `setDefaultInstallmentPlan` :144 | Atomic swap-default tx | router.setDefault | wired |
| `deactivateInstallmentPlan` :168 | Soft-deactivate; clears `isDefault` (LC-M6 in-tx existence check) | router.deactivate | wired |
| `reactivateInstallmentPlan` :202 | Restore isActive | router.reactivate | wired |

No orphans. No stubs/TODO/FIXME.

### `installment.service.ts`
| Function | Purpose | Caller(s) | Status |
|---|---|---|---|
| `getGracePeriodDaysForPackage` :42 | Read service-level grace days, fallback `DEFAULT_GRACE_PERIOD_DAYS=7` | `evaluateAndLockIfOverdue` | wired |
| `calculateCreditsUnlocked` :63 | Pure math: prorated credits | `createInstallmentSchedule`, `confirmInstallmentPayment`, `waiveInstallment`, `resetCreditsOverride`, POS auto-confirm | wired |
| `calculateInstallmentAmounts` :78 | Pure: split total into N — **first installment absorbs rounding remainder** (not last) | `createInstallmentSchedule`, POS parity test | wired (gap below) |
| `calculateSuggestedRefund` :120 | Pure refund math | `getSuggestedRefund` | wired |
| `logInstallmentEvent` :171 | Insert installment_events row | many internal | wired |
| `createInstallmentSchedule` :222 | Build N installments + update pkg `nextDueDate`; `opts.inTransaction` flag | POS (`pos.service.ts:720`), `package-instances/create.procedures.ts:147` | wired |
| `confirmInstallmentPayment` :315 | Mark paid w/ row lock + pkg row lock; recompute credits via `Math.max` against admin override; recompute `nextDueDate`; writeAudit; calls `markCompleteIfFinal` post-tx | router.confirmPayment | wired |
| `evaluateAndExpireIfOverdue` :475 | Mark pkg expired if `expiresAt < now` | `evaluateAndLockIfOverdue` (pre-tx) | wired |
| `evaluateAndLockIfOverdue` :509 | Bulk-mark overdue installments, start grace, then lock if grace expired | sweep service, `listByPackageInstance` (opportunistic) | wired |
| `evaluateOverdueLock` (private) :657 | SP-02: re-evaluate state after waive/reschedule; auto-unlock when fully resolved | `rescheduleInstallment`, `waiveInstallment` | wired |
| `unlockPackage` :755 | Admin manual unlock; idempotent guard rejects "not locked" | router.manualUnlock | wired |
| `adjustCredits` :832 | Admin override creditsUnlocked/Used; sets `creditsAdminOverride=true` | router.adjustCredits | wired |
| `processRefund` :911 | Bulk-cancel remaining installments; mark pkg `cancelled`/`refunded`; writeAudit | router.processRefund | wired |
| `rescheduleInstallment` :987 | Lock-installment-then-pkg; reject paid/waived/locked; reject past dates (UTC start-of-day); `evaluateOverdueLock` after | router.reschedule | wired |
| `syncPackagePaymentStatus` :1074 | Sync pkg `paymentStatus` from installment counts; skips refunded/cancelled | `confirmInstallmentPayment`, `waiveInstallment`, POS auto-confirm | wired |
| `waiveInstallment` :1107 | Waive single installment; SP-02 allow-when-last-on-locked-pkg; auto-unlock via `evaluateOverdueLock` | router.waive | wired |
| `resetCreditsOverride` :1216 | Clear admin override; recompute formula credits clamped ≥ creditsUsed | router.resetOverride | wired |
| `setPackageOverdraft` :1278 | Toggle `allowCreditOverdraft`; idempotent no-op return | router.setOverdraft | wired |
| `getInstallmentsByPackageInstance` :1341 | List rows by pkg, ordered by `installmentNumber` | router.listByPackageInstance | wired |
| `getAdminInstallmentOverview` :1371 | Paginated admin grid; cross-DB join to control-panel `user` for name search/display | router.adminOverview | wired |
| `getSuggestedRefund` :1539 | Fetch state + delegate to `calculateSuggestedRefund` | router.suggestRefund | wired |

No orphans in service. No `// TODO` / `// FIXME` / `mock` stubs. Console-log statements remain (e.g. `:227`, `:447`, `:513`, `:608`).

### `apps/server/src/services/installment-sweep.service.ts`
| Function | Purpose | Caller | Status |
|---|---|---|---|
| `runInstallmentSweep` :41 | Multi-tenant sweep — loop active orgs, find candidates (`status='active'`, not locked, on plan, `nextDueDate <= now`), call `evaluateAndLockIfOverdue` per row, error-isolated per row | `apps/server/src/index.ts:459-468` under cron `"0 2 * * *"` | **WIRED** (confirmed) |

Cron registered in `apps/server/wrangler.jsonc:33` (`"0 2 * * *"`), folded with Stripe reconciliation to fit 5-cron Workers Free cap (`index.ts:469-476`).

### POS first-installment flow (`pos.service.ts:639-770` — out-of-scope file but contract-critical)
Inside a single tenantDb transaction:
1. Insert sales_order + invoice + payment.
2. For each package item: insert `package_instances` w/ `paymentStatus = "partially_paid"`, `installmentsPaid = 0`, `creditsUnlocked = 0`.
3. Call `createInstallmentSchedule(tx, …, { inTransaction: true })`.
4. **Auto-confirm installment #1 by direct `UPDATE installments SET status='paid'` (lines 751-754)** — does NOT call `confirmInstallmentPayment`.
5. Update pkg `installmentsPaid=1`, `creditsUnlocked=creditsAfterFirst`, `nextDueDate=row[1]?.dueDate`.
6. Insert `installmentEvents` rows.
7. `syncPackagePaymentStatus(tx, pkg.id)`.

---

## 3. Gaps

### P1 — must fix to ship

#### P1-D-1 — Rounding remainder loaded onto FIRST installment, not last
- **File:line:** `packages/services/src/installment.service.ts:78-89`
- **Symptom:** `calculateInstallmentAmounts` puts the rounding remainder on installment `i=0`. Comments at the top of the function and at `:245-249` claim "Last installment absorbs the tax rounding remainder" (true for tax, NOT for principal). Audit brief explicitly says "Last installment must absorb cents-remainder."
- **Why it matters at POS:** installment #1 is auto-collected at the counter. Loading the remainder on #1 means the customer over-pays the "nice" round amount on their first invoice and under-pays later, contradicting the typical UX expectation of "RM 100/mo with a slightly larger last payment." Affects every plan whose `totalPrice % numInstallments != 0`.
- **Status:** real bug or intentional design decision (the code matches the comment "first installment absorbs"). Either way: it diverges from the documented invariant in the audit brief. `sum(amounts) === totalPrice` still holds (covered at `pos-installment-parity.test.ts`).
- **Testable:** true. Unit test on `calculateInstallmentAmounts(1001, 3)` — currently `[335, 333, 333]`, expected per brief `[333, 333, 335]`.
- **Persistence:** writes to `installments.amount` (1..N rows).

#### P1-D-2 — POS auto-confirm of installment #1 bypasses `confirmInstallmentPayment`, skipping audit + parts of contract
- **File:line:** `packages/services/src/pos.service.ts:738-770`
- **Symptom:** instead of calling `confirmInstallmentPayment` (which writes `audit_log` row at `installment.service.ts:432-445` and logs both `payment_received` + `credits_unlocked` events with metadata), POS inlines a direct `UPDATE installments` + `UPDATE packageInstances` + two `installmentEvents` inserts. No `audit_log` row for the inline first-installment payment is written by this path — only a single `sale.create` audit covers the whole order (`:775-797`).
- **Atomicity:** ✅ the inline path IS inside the outer POS tx, so it cannot fail mid-flight independently of order creation. But the missing audit row means installment-level audit trail for #1 is provided only by the order-level audit.
- **Drift risk:** any contract change in `confirmInstallmentPayment` (e.g. notification dispatch, side-effects, `markCompleteIfFinal` for 1-installment "plans") is silently missed at POS. `markCompleteIfFinal` is invoked POST-tx by `confirmInstallmentPayment` (`installment.service.ts:462`); POS's inline path never calls it.
- **Testable:** true — assert that after a POS sale, an `audit_log` row with `action="installment.paid"` exists for the first installment id.
- **Persistence:** writes `installments`, `package_instances`, `installment_events` (no `audit_log` for installment.paid).

#### P1-D-3 — Opportunistic lock evaluation on `listByPackageInstance` is a race + DoS vector
- **File:line:** `packages/api/src/routers/installments.ts:100-105`
- **Symptom:** Every read of installments by an owner/staff fires `evaluateAndLockIfOverdue` (which takes a row `FOR UPDATE` lock on `package_instances`) unless `INSTALLMENTS_LOCK_ON_OPEN=false`. The env var defaults to `"true"` (`apps/server/wrangler.jsonc:10`).
- **Race window:** user opens the page (eval starts grace), staff opens it within the same second (already evaluated, no-op fast path). Acceptable. But if cron is also running at 02:00 UTC on the same package, both holders compete for the same `FOR UPDATE` lock. With Neon + Workers concurrency this can serialize but the second waiter is the user-facing request → unbounded wait. Mark-overdue mid-payment race: `confirmInstallmentPayment` and `evaluateAndLockIfOverdue` both lock `package_instances`, then `evaluateAndLockIfOverdue` updates `installments.status='overdue'` for pending rows — but `confirmInstallmentPayment` locks `installments` first (line 332). Different lock orders. **Potential deadlock**: cron path takes pkg-lock then installment-table-update; payment path takes installment-row-lock then pkg-row-lock. The cron's `UPDATE installments … WHERE status='pending'` excludes the row currently locked by an in-flight payment (which is moving to `paid`), so in practice PostgreSQL row-lock ordering + status predicate avoid most deadlocks — but the ordering is not documented and depends on the predicate.
- **Testable:** partially. Concurrency test with two transactions can demonstrate ordering; deadlock risk is hard to assert deterministically.
- **Persistence:** `installments` (status), `package_instances` (grace/lock fields), `installment_events`.

#### P1-D-4 — `manualUnlock` and other admin-only mutations use `role === "admin"` instead of permission system
- **File:line:** `packages/api/src/routers/installments.ts:124, 160, 252, 277, 319, 350, 371`
- **Symptom:** Seven mutations gate on `context.member.role !== "admin"` rather than `requirePermissionOrpc`. Bypasses the RBAC layer entirely — a custom role with explicit permissions cannot perform these actions. Conversely, `resetOverride` :390 uses `service_management:update` which is **less restrictive** than the others. Inconsistent.
- **Testable:** true — auth fixture with a non-admin role + the required permission should be expected-allow, currently expected-deny.
- **Persistence:** N/A (auth-only).

### P2 — significant

#### P2-D-1 — Schedule generation `intervalDays` semantics differ between callers
- **File:line:** POS uses `installmentPlan.defaultIntervalDays ?? 30` (`pos.service.ts:719`). `package-instances/create.procedures.ts:153` uses `effectiveIntervalDays` (resolved upstream). The schedule helper at `installment.service.ts:251` always uses `(i-1) * intervalDays`, so installment #1 dues today (day 0). Documented at `:250`.
- **Implication:** consistent for the moment, but `defaultIntervalDays` is overridable at plan level and there's no per-package override checked at POS. If product wants "first installment due in 30 days" (not "today"), the schedule helper can't express that.
- **Testable:** true (input/output check on schedule helper).
- **Persistence:** `installments.dueDate`.

#### P2-D-2 — Refund interaction does NOT reverse paid installments
- **File:line:** `installment.service.ts:911-973` (`processRefund`)
- **Symptom:** Only `pending`/`overdue` installments are bulk-cancelled (`inArray(installments.status, ["pending","overdue"])` at :935). Already-`paid` installments stay paid. The package is marked `paymentStatus="refunded"`, `status="cancelled"`. There's no row-level "reversed" status, no Stripe refund call from here, and no recomputation of `creditsUnlocked`. A subsequent admin re-querying `getSuggestedRefund` will still see paid amounts.
- **Testable:** true — call `processRefund` after one installment paid; assert paid installment status unchanged and pkg `paymentStatus="refunded"`.
- **Persistence:** `installments` (cancel pending/overdue only), `package_instances`, `installment_events`, `audit_log`.

#### P2-D-3 — Partial payment / overpayment apportionment
- **File:line:** `installment.service.ts:315-465` — `confirmInstallmentPayment` accepts no amount parameter; it always marks the row `paid` at its full `installments.amount`. No splitting, no carrying excess to next installment.
- **Symptom:** If a customer wants to pay RM 250 against an installment of RM 200, there is no mechanism to apportion the extra RM 50 to installment #2. UI/router never exposes a partial-amount input.
- **Testable:** true (negative test — assert API rejects partial / has no such param).
- **Persistence:** N/A (gap, no write path).

#### P2-D-4 — UI `payment/view.tsx` is invoice-list-only; no installment schedule UI
- **File:line:** `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx:1-97`
- **Symptom:** This page shows invoice rows only (`client.invoices.list`). It does **not** display: per-installment schedule, per-row paid/overdue status, mark-paid action, reschedule, waive, manual-unlock, override toggles, suggested refund. None of the 12 `installmentsRouter` mutations are reachable from this page. Permission guard is `payments:read` (`:19`) which doesn't gate any of the installment-management actions anyway.
- **Where the installment UI lives instead:** `getAdminInstallmentOverview` exists server-side and assumes a different page consumes it. `apps/web/src/components/pages/payment/` directory does not exist (verified). No POS first-installment confirmation UI was found under `pos/`.
- **Testable:** true (page render assertion + accessibility-tree probe for installment controls).
- **Persistence:** N/A (UI gap).

#### P2-D-5 — `creditsAfterFirst` recomputed locally in POS rather than via `calculateCreditsUnlocked`
- **File:line:** `pos.service.ts:741` does call `calculateCreditsUnlocked(service.sessionCount!, 1, installmentsTotal)` — good. But unlike `confirmInstallmentPayment:378` which uses `Math.max(pkg.creditsUnlocked ?? 0, formulaCredits)` to respect admin overrides, POS does not need that protection (new package). Verified — not a real gap, noted for completeness.
- **Testable:** n/a.

### P3 — polish

- **P3-D-1** — Console-log noise in production hot path: `installment.service.ts:227, 271, 281, 322, 447, 513, 532, 538, 543, 589, 608`. Filter at logger layer.
- **P3-D-2** — `installments.ts:43-46, 74-76, 119-122` etc. show empty blank lines from removed agent-telemetry blocks; cosmetic.
- **P3-D-3** — `getAdminInstallmentOverview` "due_soon" hardcodes 14 days (`installment.service.ts:1398`). No config knob.
- **P3-D-4** — `INSTALLMENTS_LOCK_ON_OPEN` feature flag is still on in production (`wrangler.jsonc:10`). Plan H notes it should be flipped after one week of clean cron runs; check whether that's overdue.
- **P3-D-5** — `installment-sweep.test.ts` uses mocked DB; no integration test asserts the cron path actually loops orgs against a real schema. Integration coverage is at `apps/server/src/tests/integration/installment-evaluator.integration.test.ts` (out-of-scope file) — sweep wrapper itself is unit-only.
- **P3-D-6** — `confirmInstallmentPayment` accepts `paymentMethod` enum but POS first-installment writes whatever `input.paymentMethod` is — including `"stripe"` even though the POS code at `pos.service.ts:625-628` sets the invoice to `status="pending"` when Stripe (i.e. unpaid). Inline auto-confirm at `:751-754` does not guard against `paymentMethod === "stripe"` → could mark installment #1 paid before Stripe webhook confirms. Worth re-verifying against the Stripe flow gate in a sibling domain audit.

---

## Permission gate summary

| Action | Current gate | Notes |
|---|---|---|
| Read plans (incl. client) | `service_management:read`, role=client allowed | OK |
| Mutate plans | `service_management:update` / `:delete` | OK |
| List installments by pkg | owner-or-staff w/ `service_management:read` | OK |
| Confirm payment | `service_management:update` | OK |
| Manual unlock / refund / adjust credits / overdraft / reschedule / waive / suggest | `member.role === "admin"` | **Inconsistent** — should be permission-based (see P1-D-4) |
| Reset override | `service_management:update` | **Inconsistent** (should match neighbours) |
| Admin overview / events | `service_management:read` | OK |

---

## Findings index (testable)

| ID | testable |
|---|---|
| P1-D-1 rounding remainder | true |
| P1-D-2 POS audit gap | true |
| P1-D-3 lock race | true (partial) |
| P1-D-4 role-vs-permission | true |
| P2-D-1 intervalDays | true |
| P2-D-2 paid installments not reversed on refund | true |
| P2-D-3 no partial payment | true |
| P2-D-4 UI missing | true |
| P2-D-5 (non-gap) | n/a |
| P3-D-* | mostly false (polish) |
| P3-D-6 Stripe first-installment | true |

**Testable:true count: 9**
