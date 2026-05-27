# Iteration 1 — orchestrator checkpoint

Branch: `audit-prove-a/commission-installment-20260527-1700`
Approved at start: `F-COM-A`, `F-PAY-6`; skipped (deferred-human): `F-SAAS-1`, `F-SAAS-2`, `F-SAAS-3`, `F-INS-3`.
Added mid-iteration with explicit user approval: `F-INS-1`.

## Build gate
Initial RED — 7 errors traced to stale `apps/server/dist/` artifacts (deleted source files still in tsbuildinfo). Cleared dist; gate GREEN. Type-check green after every fix.

## Fixes applied
| Target | Files | Result |
|---|---|---|
| F-COM-A | `read.procedures.ts:85` + `commission-splits.service.ts` param renamed `memberId` → `userId` | ✅ code correct |
| F-PAY-6 | `payouts-tab.tsx` (PayoutRowActions + Actions column) + `features/payouts/api.ts` (4 mutation hooks) + 2 linter-side-effect files | ✅ all 3 packages type-check |
| F-INS-1 | `installment.service.ts:78-89` (last installment absorbs remainder) | ✅ POS first-installment shrinks by remainder; parity test holds |
| F-PAY-1 | Already-fixed in carried branch state (`liability-tab.tsx:308-309`) | ✅ verified, no work needed |

## Proof spec run
`bunx playwright test -c gap-prove-commission-installment.config.ts` → 1 failed (multiple soft asserts).

Remaining soft-fail assertions after iter-1 fixes:
- F-COM-A step — `getMyCommissions` returned 0 rows. Code path correct; tenant-admin seed has no commission_splits where staffId === tenant-admin's userId. **Spec-fixture gap, NOT code regression.**
- F-PAY-6 step — Payout row-action button found nothing. UI correct; Payouts tab has 0 rows for tenant-admin, so no PayoutRowActions component renders. **Spec-fixture gap, NOT code regression.**
- GP-01 — KPI strip / empty-state didn't appear within 15s. Possibly related to Payouts tab re-render. Reinspect in iter-2.

## Skipped (deferred to human in final report)
F-SAAS-1, F-SAAS-2, F-SAAS-3, F-INS-3 — see audit/REPORT.md.
