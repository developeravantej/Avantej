# API Surface Audit
**Session:** zplan/05-17_21-30_installment-residual-fixes/
**Findings:** 5 (0 critical · 2 high · 2 medium · 0 low · 1 info)

## Findings

### [HIGH] Missing procedure: `resetCreditsOverride`
**Plan claims:** New endpoint `installments.resetCreditsOverride` (Phase F.4) — admin-only, input `{ organizationId, packageInstanceId, reason }`, returns updated package row.
**Actual:** Procedure does not exist in `installments.ts` router export. Plan specifies this as a **required** journey-blocking feature (Journey 2: "Admin clears a stale credit override").
**File:** packages/api/src/routers/installments.ts:422–432 (export block has no `resetCreditsOverride` entry)
**Fix:** Add `resetCreditsOverride` procedure to router. Requires: (1) service function in `packages/services/src/installment.service.ts`, (2) protectedProcedure with admin-only auth in router, (3) Phase F DB migration `0066_installments_waived_counter.sql` to add `installments_waived` column.

---

### [HIGH] Missing procedure: `rescheduleProcedure`
**Plan claims:** Procedure `installments.rescheduleProcedure` exists and is hardened in Phase E (accept today, race-safe via `FOR UPDATE`, refuse waived). The completeness plan added this; residual plan hardens it.
**Actual:** Procedure does not exist in codebase. Grep across all `.ts` files returns zero matches. Router export (lines 422–432) has no `reschedule` entry.
**File:** packages/api/src/routers/installments.ts:422–432 (missing from export)
**Fix:** Check completeness plan (`zplan/05-17_20-46_installment-system-completeness/`) to confirm `rescheduleProcedure` was completed. If completed, merge/rebase. If not, this plan depends on it (blocking issue). Phase E tasks require the procedure already in place.

---

### [MEDIUM] Incomplete return shape: `processRefundProcedure`
**Plan claims:** Modified return shape `{ cancelledInstallmentIds: string[]; finalPackageStatus: string }` (Phase B.2, section 200–208).
**Actual:** Current return is `{ success: true }` (line 208). No `cancelledInstallmentIds` or `finalPackageStatus` fields. Plan requires these to support Journey 1 (refund dialog shows "This will cancel {N} pending installments").
**File:** packages/api/src/routers/installments.ts:165–209 (return statement at line 208)
**Fix:** Update handler to return result from `processRefund` service directly (after service update). Service signature per plan: `processRefund(...) => Promise<{ cancelledInstallmentIds: string[]; finalPackageStatus: string }>`.

---

### [MEDIUM] POS `paymentMethod` enum mismatch with plan
**Plan claims:** Modified schema (Phase H, line 194): `z.enum(["cash", "card", "manual_transfer", "fpx", "stripe", "bank_transfer"])` with `.transform()` to migrate `bank_transfer → manual_transfer`.
**Actual:** Current schema is `z.enum(["cash", "card", "bank_transfer"])` (line 61, pos.ts). Missing `manual_transfer`, `fpx`, `stripe`, and the transform deprecation guard.
**File:** packages/api/src/routers/pos.ts:61
**Fix:** Expand enum to include all payment methods and add `.transform(v => v === "bank_transfer" ? "manual_transfer" : v)` per plan. Supports unification of POS and confirmation endpoints.

---

### [INFO] Environment variable `INSTALLMENTS_LOCK_ON_OPEN` not yet documented
**Plan claims:** Phase G.3 specifies `INSTALLMENTS_LOCK_ON_OPEN` should be documented in `apps/server/wrangler.jsonc` and `.dev.vars` (default `"true"`).
**Actual:** `wrangler.jsonc` shows only `NODE_ENV` in vars; no `INSTALLMENTS_LOCK_ON_OPEN` entry. Not yet read in router (Phase G.1 task pending).
**File:** apps/server/wrangler.jsonc:8–12
**Fix:** Add `INSTALLMENTS_LOCK_ON_OPEN: "true"` to `vars` block. Update `packages/api/src/routers/installments.ts` `listByPackageInstance` to check `c.env.INSTALLMENTS_LOCK_ON_OPEN` (Phase G.2).

---

## Summary
The codebase is missing two critical procedures (`resetCreditsOverride`, `rescheduleProcedure`) and has incomplete return shapes (`processRefundProcedure`). The `rescheduleProcedure` absence may indicate a missing rebase from the completeness plan (blocking Phase E). The POS payment-method enum is not yet unified with the confirmation endpoint. The environment variable for disabling lock-on-open side effects is not yet documented in the config. All findings block delivery of the user journeys specified in the plan.
