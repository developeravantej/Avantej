# Audit: 05-27_02-01_quality-remediation

**Audited:** 2026-05-27 02:15
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 4 (3 pre-execution new files + 1 real stale path) |
| Missing impact | 3 files with unlisted callers |
| Unresolved questions | 0 |
| Execution state | not started |

---

## Findings

### Structural gaps

None. All 8 plan sections are present with substantive content.

---

### Broken references (plan → codebase)

**Expected (pre-execution — these files don't exist yet, by design):**
- `apps/server/src/tests/helpers/hono-context.factory.ts` — Task 1.1 will create it
- `apps/web/src/__tests__/lib/permissions.test.ts` — Task 3.1 will create it
- `apps/web/src/__tests__/hooks/useUserContext.test.tsx` — Task 3.2 will create it

**Real errors that must be fixed before execution:**

1. **`apps/server/src/routers/index.ts` (§6.2 "consumed by" list)** — does not exist. The real entry that imports `paymentsRouter` is `apps/server/src/index.ts` line 20.

2. **`apps/web/src/components/pages/checkout/*` (§6.2)** — directory does not exist. Actual frontend callers of the payments procedures are:
   - `apps/web/src/features/appointments/components/ChargeDialog.tsx`
   - `apps/web/src/features/appointments/components/PaymentSection.tsx`
   - `apps/web/src/features/customers-detail/components/OverviewTab.tsx`
   - `apps/web/src/features/customers-detail/components/SavedCardsSection.tsx`
   - `apps/web/src/features/installments/components/adjust-credits-dialog.tsx`
   - `apps/web/src/routes/_authenticated/billing.connect.tsx`

3. **`apps/web/src/features/installments/api.ts` (§6.2)** — does not exist. The `installments/` feature has `components/`, `hooks/`, `types.ts`, `utils.ts` but no `api.ts`.

4. **Procedure names in Task 2.2** — Plan lists `confirmPaymentIntent` and `refundPaymentIntent` as procedures to refactor. Neither name exists. The actual procedures in `payments.ts` are: `createPaymentIntent`, `sendPaymentLink`, `getPaymentStatus`, `refund`, `createSetupIntent`, `listSavedCards`, `chargeSavedCard`, `createSalesOrderPaymentLink`, `purchasePackage` (9 total). **All 9** have context cast blocks — the plan's scope of "4 procedures" is wrong.

5. **`as any` count in `payments.ts` (§3.2 and §1 Overview)** — Plan states "15 `as any` casts." Reality is 15 `as any` + 7 `as unknown` = 22 total casts. The refactor touches more lines than planned.

6. **`as any` in `auth.ts` and `subscriptions.ts` (Task 2.4)** — Plan says both have "a single `as any` cast." Reality: `auth.ts` has 0 `as any` (1 `as unknown` only); `subscriptions.ts` has 0 `as any` (1 `as unknown` only). Only `admin.ts` correctly has 1 `as any`. Task 2.4 should say "1 `as unknown`" for these two files, not "1 `as any`".

---

### Missing impact

**`packages/api/src/context.ts` (Task 2.1 adds `controlPanelDb?`)** — the following importers of `Context` are not listed in §6.1:
- `packages/api/src/guards.ts`
- `packages/api/src/index.ts`
- `packages/api/src/lib/context-helpers.ts`
- `packages/api/src/test-utils/mock-context.ts`
- Several routers in `packages/api/src/routers/`

The field addition is additive/optional so these callers won't break, but `mock-context.ts` should expose the new field for test completeness.

**`apps/server/src/routers/customer-profiles.ts` (Task 2.3)** — `apps/server/src/index.ts` (imports as `serverCustomerProfilesRouter`) is not listed in §6.1. Low risk (behavioral-neutral refactor) but omitted.

---

### Domain Logic Warnings

**Warning 1 — `controlPanelDb`-on-`Context` conflicts with existing helper:**
`packages/api/src/lib/context-helpers.ts` already documents: *"Always call this helper instead of accessing `context.controlPanelDb` (which does not exist)."* The existing `getControlPanelDb(context)` helper is what `payments.ts` already imports (line 35). The casts exist only because `context` is typed as `{ tenantDb?: unknown }` — once `assertTenantContext(context)` narrows it to the real `Context`, `getControlPanelDb(context)` works with zero casts and zero infrastructure changes.

**Plan's proposed solution (add `controlPanelDb` to `Context`) is unnecessary and conflicts with the helper's documented contract.** Drop Task 2.1; the helper-based approach already covers this.

**Warning 2 — Task 3.1 names wrong exports:**
Task 3.1 says test "`hasPermission`, `hasAnyPermission`, `hasRole` from `lib/permissions.ts`." These functions are not exported from `lib/permissions.ts` — they are closures returned inside `useUserContext()`. The actual exports of `lib/permissions.ts` are `flattenUserPermissions`, `checkUserPermission`, and `checkUserRole`. A developer following Task 3.1 literally will spend hours looking for non-existent exports.

**Warning 3 — Task 2.2 effort estimate is too low:**
Plan says "4 procedures, 4–5 hours." Actual: 9 procedures, each with a cast block, plus 7 `as unknown` casts at call sites. Realistic estimate: 7–9 hours.

---

### Unresolved questions

None found (no TBD/TODO/??? markers). The 3 items in §8.1 all have stated resolution paths.

---

### Execution & verification gaps

- No `execute/log.md` → plan has not been executed yet (expected — just written)
- No `chrome-test/` → appropriate (pure refactor sprint, no UI to verify in browser)
- No `research/` → appropriate (audit served as research)

---

## Priority Actions

1. **Fix §6.2 caller list:** replace `apps/server/src/routers/index.ts` → `apps/server/src/index.ts`; replace checkout/installments paths with actual callers listed above.
2. **Drop Task 2.1 (`controlPanelDb` on `Context`):** the existing `getControlPanelDb(context)` helper already works once the type is narrowed by `assertTenantContext`. No new field needed. Update §3.2, Task 2.2, and §6.1 accordingly.
3. **Fix Task 2.2 procedure list:** replace `confirmPaymentIntent`/`refundPaymentIntent` with the actual 9 procedure names; update effort to 7–9 hours.
4. **Fix Task 3.1 function names:** replace `hasPermission`/`hasAnyPermission`/`hasRole` with `flattenUserPermissions`/`checkUserPermission`/`checkUserRole` (actual exports of `lib/permissions.ts`), or clarify that those helpers live in the hook and are tested in Task 3.2.
5. **Fix `as any` count in §1 and §3.2:** 22 total (15 `as any` + 7 `as unknown`), not "15 `as any`".
6. **Task 2.4 language:** change "single `as any`" to "single `as unknown`" for `auth.ts` and `subscriptions.ts`.

## Status rationale

8/8 sections present and 0 unresolved plan markers → not `critical`. However 4 broken real-file refs (stale paths + wrong procedure names), 3 missing impact callers, and 3 domain logic warnings (one of which makes Task 2.1 entirely unnecessary) → `needs-attention`.
