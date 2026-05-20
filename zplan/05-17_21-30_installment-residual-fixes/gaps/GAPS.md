# Swarm Audit — GAPS.md
**Session:** zplan/05-17_21-30_installment-residual-fixes/
**Run at:** 2026-05-17T22:15:00Z
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 37 (4 critical · 18 high · 9 medium · 3 low · 3 info)

---

## Priority Fix Order

### P1 — Critical (block execution — fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| C1 | scalability | `processRefund` leaves phantom pending installments — no bulk cancel of remaining rows | `installment.service.ts:764` | Add `UPDATE installments SET status='cancelled' WHERE package_instance_id=? AND status IN ('pending','overdue')` inside the refund tx |
| C2 | scalability | `processRefund` lacks `FOR UPDATE` on packageInstances — concurrent payment race | `installment.service.ts:764` | Add `SELECT...FOR UPDATE` on packageInstances as first statement in the tx |
| C3 | scalability | `rescheduleInstallment` has no transaction or `FOR UPDATE` — double-reschedule race | `installment.service.ts:818` | Wrap entire body in `tenantDb.transaction()`, add `.for("update")` installment first then package (matching confirmInstallmentPayment order) |
| C4 | type-safety | POS `paymentMethod` enum mismatch — `bank_transfer` written at POS but service expects `manual_transfer` | `pos.ts:61`, `installment.service.ts:292` | Add `.transform(v => v==="bank_transfer"?"manual_transfer":v)` to POS router Zod enum |

---

### P2 — High (fix before merging)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| H1 | doc-consistency | Migration 0066 already taken (`0066_commission_condition_between_check.sql`) — plan must renumber to 0067/0068/0069 | `packages/db/src/migrations/tenant/` | Rename all three migration references in plan.md: 0066→0067, 0067→0068, 0068→0069 |
| H2 | doc-consistency | `syncPackagePaymentStatus` missing — blocks Phases A, B, F | `installment.service.ts` (missing) | Block execution until completeness plan Phase 1 merges |
| H3 | doc-consistency | `waiveInstallment` missing — blocks Phases E, F | `installment.service.ts` (missing) | Block Phase E/F until completeness plan Phase 4 merges |
| H4 | doc-consistency | `RescheduleDialog` component missing — blocks Phase E frontend | `installments-page.tsx` (missing) | Block Phase E.4 until completeness plan Phase 2 merges |
| H5 | doc-consistency | `"partially_paid"` not in Zod schema — blocks Phase A | `package-instances.ts:45` | Block Phase A until completeness plan Phase 1 Task 1.9 merges |
| H6 | doc-consistency | Phase G env flag `c.env.*` not accessible from shared router package | `installments.ts` router | Thread env flag through `createContext` or move flag-check to server-side Hono layer |
| H7 | api-surface | `resetCreditsOverride` procedure missing from router | `installments.ts` router | Add procedure in Phase F.4 |
| H8 | api-surface | `rescheduleProcedure` missing — Phase E hardening has nothing to harden | `installments.ts` router | Rebase/merge from completeness plan before Phase E |
| H9 | api-surface | `processRefundProcedure` returns `{ success: true }` not new shape | `installments.ts:165` | Capture return value from updated service, reshape to `{ cancelledInstallmentIds, finalPackageStatus }` |
| H10 | api-surface | POS `paymentMethod` enum not unified (`bank_transfer` only, missing `manual_transfer`, `fpx`, `stripe`) | `pos.ts:61` | Expand enum + add `.transform()` per Phase I.2 |
| H11 | scalability | `rescheduleInstallment` rejects "today" — `<= now` should be `< startOfDayUTC(now)` | `installment.service.ts:848` | Change comparison to use `startOfDayUTC` helper (Phase E.2) |
| H12 | scalability | `evaluateAndLockIfOverdue` only marks first overdue installment (findFirst not bulk UPDATE) | `installment.service.ts:530` | Replace `findFirst` with bulk `UPDATE...RETURNING id`, then batch-insert events |
| H13 | scalability | Composite index `idx_installments_pkg_status_due` missing — Phase D EXISTS subquery unoptimized | `installments.ts` schema | Create migration 0069 (renumbered) + add `.index()` to Drizzle schema file |
| H14 | type-safety | Unsafe `tx as unknown as TenantDb` cast in pos.service.ts — Phase H not implemented | `pos.service.ts:635` | Implement Phase H.1: broaden `createInstallmentSchedule` signature to `TenantDb \| TenantTx` |
| H15 | type-safety | `creditsUnlocked` is nullable — inconsistent guards across arithmetic callers | `package-instances.ts:85`, `installment.service.ts:358, 699` | Declare `.notNull().default(0)` in schema and remove guard inconsistency |
| H16 | test-coverage | Phase A — no test for insert-time `paymentStatus = "partially_paid"` | N/A (file missing) | Create `pos.installment.integration.test.ts` |
| H17 | test-coverage | Phase B — no test for refund cancelling remaining installments | N/A (file missing) | Create `installment-refund.integration.test.ts` |
| H18 | test-coverage | Phase C — no test for multi-overdue evaluator sweep | N/A (file missing) | Create `installment-evaluator.integration.test.ts` |
| H19 | test-coverage | Phase D — no test for overdue filter without prior evaluator run | N/A (file missing) | Create `installment-overview.integration.test.ts` |

---

### P3 — Medium (fix before shipping)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| M1 | schema-drift | `installments_waived` column absent from Drizzle schema | `package-instances.ts` | Add `installmentsWaived: integer("installments_waived").default(0).notNull()` |
| M2 | schema-drift | `installments.status` comment missing `"cancelled"` | `installments.ts:15` | Update comment to include `'cancelled'` after migration created |
| M3 | schema-drift | `paymentStatus` comment missing `"partially_paid"` | `package-instances.ts:40` | Update comment to include `"partially_paid"` |
| M4 | schema-drift | Composite index `idx_installments_pkg_status_due` absent from Drizzle schema (only planned in migration SQL) | `installments.ts:24` | Add `.index("idx_installments_pkg_status_due").on(table.packageInstanceId, table.status, table.dueDate)` |
| M5 | scalability | `processRefund` partial-refund mode missing — always sets `status: 'cancelled'` | `installment.service.ts:777` | Add `opts?: { partialRefund?: boolean }` param, conditionally skip package cancellation |
| M6 | scalability | `evaluateAndLockIfOverdue` lock path does not clear `gracePeriodEndsAt` | `installment.service.ts:573` | Add `gracePeriodEndsAt: null` to SET clause when `isLocked = true` |
| M7 | doc-consistency | Four open questions without formal `DECIDED:` markers | `plan.md:655-661` | Add `DECIDED:` or `UNRESOLVED:` status line to each question |
| M8 | doc-consistency | `sales.service.ts` usage of `createInstallmentSchedule` unverified for Phase H impact | `sales.service.ts` | Grep all call sites before Phase H.1; document in Phase H.1 task |
| M9 | type-safety | `installmentsWaived` column not in schema — runtime reads will be `undefined` | `package-instances.ts` (missing field) | Add Drizzle column definition (same fix as M1) |

---

### P4 — Low / Info

- **L1 (type-safety):** `(err as any).code` casts at `installment.service.ts:832, 843, 850` — replace with `Object.assign(new Error(msg), { code })` pattern (already noted in Phase E.1 task).
- **L2 (type-safety):** `TenantTx` type redefined in both `installment.service.ts:25` and `pos.service.ts:39` — centralize in `packages/db/src/types.ts`.
- **L3 (test-coverage):** Phase E and F test files missing (lower priority than A–D) — create `installment-reschedule.integration.test.ts` and `installment-credits.integration.test.ts`.
- **I1 (api-surface):** `INSTALLMENTS_LOCK_ON_OPEN` env var not yet in `wrangler.jsonc` — add when implementing Phase G.
- **I2 (scalability):** Lock order for `processRefund` vs `confirmInstallmentPayment` — `processRefund` needs only a package lock (no installment-level lock needed); document this explicitly in code to avoid future confusion.
- **I3 (test-coverage):** Neon pool concurrency assumption for Phase E.5 concurrent reschedule test — document `max` connection assumption in test file.

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 0 | 4 | 4 | 0 | 0 | Migration collision (0066 taken) + 3 schema comments + missing Drizzle column/index |
| api-surface | 0 | 2 | 2 | 0 | 1 | 2 missing procedures, 1 return type mismatch, 1 enum gap |
| test-coverage | 0 | 4 | 2 | 1 | 1 | All 7 planned test files absent; helper infra adequate |
| doc-consistency | 0 | 5 | 2 | 0 | 0 | Migration collision + 3 missing completeness-plan deps + Zod gap + env access design issue |
| type-safety | 1 | 2 | 2 | 2 | 0 | Bank_transfer enum mismatch CRITICAL; cast + nullable guard HIGH |
| scalability | 3 | 3 | 2 | 1 | 1 | 3 CRITICAL concurrency bugs fixed in code; bulk-update, date guard, index HIGH |

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| P1 C1+C2 — processRefund bulk cancel + FOR UPDATE | 1 service file | ~400 | Surgical additions inside tx body |
| P1 C3 — rescheduleInstallment wrap + FOR UPDATE | 1 service file | ~500 | Wrap entire function + lock order |
| P1 C4 — POS Zod transform | 1 router file | ~150 | One-line .transform() addition |
| P2 H1 — Migration renumber 0066→0067/0068/0069 | plan.md only | ~200 | Find-replace across plan file |
| P2 H2–H5 — Completeness plan dependency gates | 0 (blocked) | 0 | Add gate notes to phase headers |
| P2 H6 — Phase G env flag context threading | 2 files | ~400 | createContext + procedure handler |
| P2 H7+H8 — Add missing router procedures | 1 router file | ~800 | resetCreditsOverride + confirm rescheduleProcedure from completeness plan |
| P2 H9 — processRefundProcedure return shape | 1 router file | ~200 | Reshape return value |
| P2 H10 — POS enum unification | 1 router file | ~150 | Expand enum + transform |
| P2 H11 — startOfDayUTC date guard | 1 service file | ~200 | Helper + guard change |
| P2 H12 — evaluateAndLockIfOverdue bulk sweep | 1 service file | ~300 | findFirst → bulk UPDATE + batch events |
| P2 H13 — Composite index in schema + migration | 2 files | ~200 | .index() call + SQL file |
| P2 H14 — Phase H TenantTx signature | 2 files | ~400 | Signature + withTx helper + call site |
| P2 H15 — creditsUnlocked notNull | 1 schema file | ~100 | Schema declaration change |
| P2 H16–H19 — Integration test files A–D | 4 new files | ~4000 | ~1000 tokens per test file |
| P3 M1–M4 — Schema drift fixes | 2 schema files | ~300 | Column defs + comment updates |
| P3 M5–M6 — processRefund partial + gracePeriodEndsAt | 1 service file | ~300 | Optional param + null clear |
| P3 M7 — Resolve open questions | plan.md only | ~200 | Add DECIDED: markers |

---

## Auto-fixable findings

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| 1 | doc-consistency | Migration 0066→0067, 0067→0068, 0068→0069 throughout plan | plan.md (all migration references) | Replace `0066_installments_waived` → `0067_installments_waived`, `0067_payment_method` → `0068_payment_method`, `0068_installments_due` → `0069_installments_due`; update §7 migration order list |
| 2 | doc-consistency | Open question 2 resolution — add `DECIDED:` marker | plan.md:658 | Add `**DECIDED:** Refuse with CONFLICT if creditsUsed > newCredits — no approver required (defensive code path)` |
| 3 | doc-consistency | Open question 3 resolution — add `DECIDED:` marker | plan.md:660 | Add `**DECIDED:** Default = "true" (conservative) — flip to "false" post-cron validation` |
