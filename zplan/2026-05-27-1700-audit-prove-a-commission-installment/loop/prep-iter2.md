# Iteration-2 prep notes (written while F-PAY-6 agent runs)

## Already-fixed (drop from worklist on next approval prompt)
- **F-PAY-1** — `apps/web/src/components/pages/commissions/liability-tab.tsx:308-309` already contains `payoutKeys.list(organizationId ?? "")` in the invalidate array with comment `// F-PAY-1: invalidate payouts list so Payouts tab refreshes after markPaidBatch`. Most likely from in-flight uncommitted edits carried onto this remediation branch. **Status: VERIFIED-FIXED**, no further work needed.

## Mechanical fixes (1-3 LOC each, low risk)
- **F-INS-1** — `packages/services/src/installment.service.ts:78-89`. Change line 86 from `i === 0 ? base + remainder : base` to `i === installmentsTotal - 1 ? base + remainder : base`. Also update the JSDoc comment on line 75 ("The first installment absorbs any rounding remainder" → "The last installment absorbs..."). Aligns with tax-remainder convention (already on last per audit note re :247-249).

- **F-INS-4** — `packages/api/src/routers/installments.ts`. Replace `if (context.member.role !== "admin") throw FORBIDDEN` patterns with `await requirePermissionOrpc(context.tenantDb, context.member, "installment_management", "write")` on the 7 mutations the auditor identified. Need to grep the file to enumerate exact lines.

## Service-layer surgery (riskier — read carefully first)
- **F-COM-B** — `packages/services/src/commission-calculator.service.ts:614-639`. The `.insert(commissionSplits).values({...})` call omits `configVersionId`. Need to:
  1. Locate where the config-version row is resolved for the matched condition (likely in `_buildSplits` upstream around the condition-matching step).
  2. Pass that `configVersionId` (or `conditionVersionId`) into the insert payload.
  3. Verify `applyCommissionCaps`'s INNER JOIN now sees the row.
  Risk: a recent migration may have removed the column or renamed it. Verify schema before editing.

- **F-COM-C** — `packages/services/src/commission-splits.service.ts:2044-2066`. `reverseForRefund` currently only computes a partial ratio when `split.packageInstanceId && partialRatios.has(split.packageInstanceId)`. Need to extend to:
  - When `split.salesOrderId && refundIsPartial`, compute `salesOrderPartialRatio` from refund lines / order total and apply same `Math.min(unreversed, Math.round(split.calculatedAmount * ratio))` logic.
  - Need a way to know which sales-order lines were refunded vs which were not — input `params` already carries `refundedLineIds` or similar (read the function signature first).

- **F-COM-D** — `packages/api/src/routers/category-commission.ts` upsert + delete handlers. Add `writeAudit({...})` call mirroring the existing pattern in `commission-calculator.service.ts:588-597`. The `_actor` param is already piped through; just call `writeAudit` with `action: "category_commission_config.upsert"` / `.delete`.

## Bigger refactors (defer to fresh batch after iteration 2)
- **F-PAY-3** — Two divergent mark-paid pipelines. Need an architectural decision: make Liability route through `payouts.service.runBatch` (single source of truth) OR have Liability create a synthesized payouts row inside `markPaidBatch`. Recommendation: route through runBatch. Significant change in `commission-splits.markPaidBatch` and the Liability tab's mutation.

- **F-PAY-4** — Math.abs on reversal rows. Surgical change in `payouts-tab.tsx` (NOT while F-PAY-6 agent is editing the same file — must do AFTER F-PAY-6 lands).
