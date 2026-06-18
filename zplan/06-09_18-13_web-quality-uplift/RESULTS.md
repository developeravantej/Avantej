# Web Quality Uplift — Execution Results

> Executed 2026-06-09 · Branch `test/unit-suite-green-and-ci-fix` · apps/web only

## Outcome: all 4 phases complete, apps/web fully green

- `cd apps/web && bun run test` → **410 passed, 3 skipped (54 files)** (baseline was 382/51).
- `cd apps/web && bun run check-types` → **0 errors**.

> NOTE — the package script is `bun run test` (= `vitest run`). Plain `bun test` invokes
> Bun's native runner and sweeps up the Playwright e2e specs (hundreds of false failures).

## Phase 1 — Test coverage (+28 tests, 3 new files)
- `src/__tests__/components/pos/pos-workflow.test.tsx` (4) — installment amount shown (RM100, not RM300 full price), cart total, commission routes to trainer on BOTH rotation-queue and requested paths (asserted at the `pos.recordSale` payload boundary).
- `src/__tests__/components/pages/access-control/members-tab.test.tsx` (16) — list/empty/loading/error, `canMoveBranch` role gating, invite/deactivate/reactivate/softDelete/updateRole flows. (Finding: this component has NO `hasPermission`/`hasRole` gating — only role-derived `canMoveBranch`; no dedicated error UI.)
- `src/__tests__/features/payouts/payouts.test.tsx` (8) — batch list + empty + reversal row, markPaid transition, invalidation + toast.

## Phase 2 — Data-fetching standardization
Each site was checked against its QUERY side first (invalidate does prefix matching) to avoid introducing stale-list bugs. Result:
- **Real bug fixes** (plain keys matched no orpc query → silent stale lists):
  - `commissions/bulk-action-bar.tsx` — `["commissions"]` → `orpc.commissionSplits.{listPendingReview,listLedger,liabilitySummary,getMyCommissions}.key()`.
  - `forms/hierarchical-branch-form.tsx` — `["branches", org]` → `orpc.hierarchy.{listNodesWithStats,listNodes}.key()`; left `["user-context"]` (matches the hand-written useUserContext query).
  - `refunds/partial-refund-dialog.tsx` — kept `["refunds"]`/`["packageInstances"]` (match hand-written queries) and ADDED `orpc.packageInstances.listAll.key()` for the orpc consumer.
  - `features/payouts/api.ts` — migrated all `[[...]]` + dead plain keys to `orpc.*.key()`; removed dead `["commissions"]`/`["commissionLiability"]` no-ops.
  - `reports/schedule-report-dialog.tsx` — migrated query + 3 invalidations to `orpc.scheduledReports.list.queryOptions`.
- **Correctly left unchanged** (current invalidation already works; query side is hand-written elsewhere — swapping would BREAK it):
  - `calendar/appointment.tsx` (`["appointments"]` matches the route's flat-key query).
  - `platform-admin/bulk-actions-bar.tsx` (`["platformAdminTenants"]` matches hand-written list query).
- Verified: **zero `queryKey: [["` remaining** in `apps/web/src`.
- Follow-up (multi-file, deferred): the appointments + platformAdminTenants query SURFACES are hand-keyed; to fully standardize, migrate their queries to `orpc.*.queryOptions` first, then their invalidators together. `useOccurrenceActions.ts` already uses an orpc key that does NOT match the route's flat appointments query (latent stale-calendar bug).

## Phase 3 — Architecture decomposition (4 god route files → thin shells)
| Route | Before | After (shell) | New dir |
|---|---|---|---|
| `appointment/class-slots/view.tsx` | 1460 | **15** | `components/pages/class-slots/*` |
| `reports/view.tsx` | 1292 | **13** | `components/pages/reports/*` |
| `announcements/view.tsx` | 1211 | **12** | `components/pages/announcements/*` |
| `branch/view.tsx` | 1135 | **17** | `components/pages/branch/*` |
Structural-only, verbatim moves. Page components remain large but route files are now far under the 400-LOC CI cap.

## Phase 4 — UX edge-state uniformity (additive only)
Added genuinely-missing error states via `StatusCallout variant="error"` + `onRetry`:
- `packages/installments-page.tsx`, `packages/instances-page.tsx`, `access-control/roles-tab.tsx`, `access-control/permissions-tab.tsx`.
- Left untouched (already complete): `packages/memberships-page.tsx`, `customers/v2/packages-tab.tsx`.

## Test-infra fixes (needed by the above)
- `__tests__/helpers/mock-client.ts` — typed `mockOrpc` properly (`as unknown as AppRouterClient` instead of `as never`) so `.key()`/`.queryOptions()` type-check at call sites. Runtime unchanged.
- `__tests__/features/payouts/payouts.test.tsx` — updated invalidation assertions to the new `orpc.*.key()` outputs (Phase 1 had locked in the old string keys as a Phase-2 flag).
- `__tests__/routes/uom.test.tsx` — switched its bespoke partial orpc mock to the shared `mockOrpc` after a concurrent session migrated `uom/units-tab.tsx` + `conversions-tab.tsx` to `orpc.queryOptions`.

## IMPORTANT: shared working tree / concurrent session
This branch was being edited SIMULTANEOUSLY by another session (`zplan/06-09_apps-quality-uplift/`) in the SAME working tree (no worktree isolation). Many modified files in `git status` (`features/approvals/*`, `features/refunds/*`, `attendance/*`, `useTrainerActions.ts`, `uom/*`, `packages/api/*`, `packages/services/*` incl. new `member-context.ts`) are THAT session's work, not this one's. Consequences:
- The monorepo-wide `bun check-types` may be RED due to the other session's in-flight `packages/services/commission-splits.service.ts` — out of THIS task's `apps/web` scope; do not "fix" it here.
- Full-suite results reflect the COMBINED tree. As of last run it was green.
