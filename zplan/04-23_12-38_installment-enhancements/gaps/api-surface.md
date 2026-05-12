# API Surface Audit
**Session:** zplan/04-23_12-38_installment-enhancements
**Findings:** 5 (0 critical · 0 high · 0 medium · 0 low · 5 info)

## Findings

### [INFO] installmentsRouter exists and is in baseRouter
**Plan claims:** `installmentsRouter` exported from `packages/api/src/routers/installments.ts` and included in `baseRouter`.
**Actual:** Confirmed. Imported at line 20 of `packages/api/src/routers/index.ts` and wired into `baseRouter` at line 113. ✓
**File:** `packages/api/src/routers/index.ts:20,113`
**Fix:** None.

---

### [INFO] All referenced procedures exist with correct auth pattern
**Plan claims:** `adminOverview`, `confirmPayment`, `manualUnlock`, `adjustCredits` exist in `installments.ts`; `manualUnlock` uses `protectedProcedure` + inline admin-role check.
**Actual:** All four procedures confirmed present. `manualUnlock` at line 143 uses `protectedProcedure` + inline `member.role === "admin"` guard — exactly the pattern `setOverdraft` should mirror. `adjustCredits` uses `Object.assign()` to attach `.code` to thrown errors (lines 631, 634) — the error-code pattern the plan references. ✓
**File:** `packages/api/src/routers/installments.ts:143,631,634`
**Fix:** None.

---

### [INFO] Current status enum does not include `due_soon` (expected)
**Plan claims:** Current enum is `["active", "overdue", "locked"]`; plan extends it to add `"due_soon"`.
**Actual:** Confirmed at line 214: `z.enum(["active", "overdue", "locked"])`. `"due_soon"` is not present yet — this is the correct pre-implementation state. ✓
**File:** `packages/api/src/routers/installments.ts:214`
**Fix:** None (extension is the Phase 1 work).

---

### [INFO] Frontend route file exists as legacy redirect
**Plan claims:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx` exists as "legacy redirect only".
**Actual:** File confirmed present. ✓
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx`
**Fix:** None.

---

### [INFO] Frontend component file exists
**Plan claims:** Main UI lives in `apps/web/src/components/pages/packages/installments-page.tsx`.
**Actual:** File confirmed present; imports oRPC client at line 49 via `@/utils/orpc`. ✓
**File:** `apps/web/src/components/pages/packages/installments-page.tsx:49`
**Fix:** None.

---

## Summary

No blocking issues found across any API surface check. All oRPC procedures the plan references or uses as patterns are present with correct signatures and auth levels. The `installmentsRouter` is properly registered in `baseRouter`. The frontend component and route files are in place. The new `setOverdraft` procedure can be safely added following the `manualUnlock` pattern at line 143, and the `due_soon` enum extension is a straightforward one-liner at line 214.
