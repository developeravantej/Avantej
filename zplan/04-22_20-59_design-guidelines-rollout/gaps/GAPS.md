# Swarm Audit — GAPS.md
**Session:** 04-22_20-59_design-guidelines-rollout
**Run at:** 2026-04-22T22:15
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 37 (0 critical · 14 high · 14 medium · 6 low · 3 info)

---

## Priority Fix Order

### P1 — Critical (block execution — fix before any /execute)

*None.*

---

### P2 — High (fix before merging)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| H1 | api-surface | `commissions.bulkApprove` does not exist — wrong router. Procedure is **live** as `commissionSplits.approve` at `commission-splits.ts:217`. Plan §5.1 TODO and §6.5 are both wrong. | `packages/api/src/routers/commission-splits.ts:217` | Replace `client.commissions.bulkApprove` → `client.commissionSplits.approve` throughout plan |
| H2 | api-surface | `checkIns.create` does not exist — wrong procedure name. Actual: `checkIns.recordCheckIn`. | `packages/api/src/routers/check-ins.ts` | Replace `checkIns.create` → `checkIns.recordCheckIn` in plan §8.4 and Phase 5.2 |
| H3 | schema-drift | `expenses.ts` ORM source drift — migration `0014_expenses_currency_myr.sql` already fixed the DB column default to `'myr'`, but `packages/db/src/schema/tenant/expenses.ts:21` still says `.default("usd")`. Next `bun db:generate` will emit a revert migration. | `packages/db/src/schema/tenant/expenses.ts:21` | Update plan §1 problem statement and §8.8: migration already exists. Flag schema file as needing `.default("myr")` update — or file the schema fix as part of Phase 1.4 |
| H4 | type-safety | `"confirmed"` missing from `CanonicalStatus` — sales `columns.tsx:185` emits `"confirmed"`. StatusBadge will silently mis-map live sales rows. | `apps/web/src/components/tables/sales/view/columns.tsx:185` | Add `"confirmed"` to `CanonicalStatus` in plan §3.1 |
| H5 | type-safety | `"inactive"` and `"discontinued"` missing from `CanonicalStatus` — product status badge uses both. | `apps/web/src/components/tables/products/view/columns.tsx:25–52` | Add both to `CanonicalStatus` in plan §3.1 |
| H6 | type-safety | `ErrorState` backward-compat is broken — `StatusCalloutProps` uses `children: ReactNode`, but existing `ErrorStateProps` uses `message: string`. A re-export alias would type-error at every call site. | `apps/web/src/components/ui/error-state.tsx` | Plan Phase 0.4 must add a `message?: string` prop to `StatusCalloutProps` (renders as `children`), or rephrase "re-export" as "new component with migration adaptor" |
| H7 | doc-consistency | `customer-step.tsx:179` avatar fix is more complex than a class swap — the avatar element is shared in the same render loop for both member and walk-in results. Fix requires adding a `r.type === 'walk-in'` conditional, not just changing the CSS class. | `apps/web/src/components/pos/customer-step.tsx:179` | Update Phase 3.3 task description and J5 journey to reflect the conditional logic required |
| H8 | doc-consistency | §8.2 open question is now answerable: Biome 2.4.7 has no `noRestrictedClasses` rule. The `tools/lint-classes.ts` fallback script is confirmed necessary. | `biome.json` | Close §8.2 in plan with "Biome 2.4.7 — no support confirmed; use tools/lint-classes.ts via Husky" |
| H9 | test-coverage | No `.github/` directory exists — no CI workflows, no Actions pipelines. Phase 2 acceptance criterion "CI fails when a PR introduces `text-gray-500`" cannot be satisfied without creating the directory and a workflow. | (repo root) | Add Phase 2 tasks: "2.0 Create `.github/workflows/lint.yml`" as a prerequisite to 2.1 |
| H10 | test-coverage | No `.github/PULL_REQUEST_TEMPLATE.md` and no `.github/` directory. Phase 2.4 lists creating the PR template but the directory must be created first. | (repo root) | Absorbed by H9 fix — creating `.github/` unblocks both |
| H11 | test-coverage | Phase 5 UI acceptance criteria have zero test coverage. Server-side `ALREADY_CHECKED_IN` logic is tested in `check-ins.test.ts`, but no frontend test asserts the warning dialog renders. Commission bulk-approve Cancel path has no test. | `apps/web/src/__tests__/` | Add frontend test files for Phase 5 components to Phase 5.1 and 5.2 acceptance criteria |
| H12 | scalability | Bulk void is N sequential transactions with no cap — `bulk-action-bar.tsx` loops `client.commissionSplits.void` once per selected row ID; each call opens its own `SELECT FOR UPDATE` transaction. No server-side or frontend row-count limit. | `apps/web/src/components/commissions/bulk-action-bar.tsx` | Add Phase 5 sub-task: "5.0 Add batch endpoint to commission-splits router with 500-row cap before building bulk-approve/void dialog" |
| H13 | doc-consistency | `CommissionStatusBadge` line range is 91–116 in both `all-tab.tsx` and `mine-tab.tsx`, not 91–112 as cited. Plan §6.2 and Phase 4.F.5 have the wrong range. | `apps/web/src/components/pages/commissions/all-tab.tsx:91–116` | Correct line references in §6.2 and Phase 4.F.5 |
| H14 | test-coverage | Phase 0 primitive tests cannot exist until the primitives are created — correct by design, but the acceptance criterion "Unit tests pass: `bun test --filter ui-primitives`" references a filter that won't work: Vitest's `include` glob in `apps/web/vitest.config.ts` only covers `src/__tests__/**`. Tests co-located with the primitive files would be silently ignored. | `apps/web/vitest.config.ts` | Update plan Phase 0 acceptance criteria to use `bun test src/__tests__/` and ensure Phase 0.1–0.4 test files land in `apps/web/src/__tests__/components/ui/` |

---

### P3 — Medium (fix before shipping)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| M1 | schema-drift | `"no-show"` (hyphen) vs `"no_show"` (underscore) — `appointments.ts:36` stores the hyphenated form; plan §3.1 `CanonicalStatus` defines underscore. StatusBadge will silently mis-map appointment status values. | `packages/db/src/schema/tenant/appointments.ts:36` | Change `CanonicalStatus` to `"no-show"` (match the DB), or note that appointment status normalization is required at the API boundary |
| M2 | schema-drift | §8.3 `void` open question is answerable from the codebase — `commission-splits.ts` documents `"void"` as a distinct terminal state. Already in `CanonicalStatus`. | `packages/api/src/routers/commission-splits.ts` | Close §8.3 in plan: "void confirmed load-bearing; keep in CanonicalStatus, do not merge to cancelled" |
| M3 | api-surface | `previousCheckInAt` is not in the structured CONFLICT response — `minutesAgo` lives in the error message string, not the `data` object. Option A (pre-flight `checkIns.list`) works today; Option B requires a one-line server change. | `packages/api/src/routers/check-ins.ts` | Update Phase 5.2 to specify Option A explicitly, or flag Option B as requiring a router change |
| M4 | type-safety | Payment mode values (`cash`/`card`/`online`/`transfer`) are not statuses — plan §6.2 lists `payment/view columns` as a `StatusBadge` migration target, but the column displays *payment mode* not status. Forcing mode values into `CanonicalStatus` is conceptually wrong. | `apps/web/src/components/tables/payment/view/columns.tsx:165–182` | Update Phase 4.F.8 to note payment mode is a separate enum — either extend `StatusBadge` with a `mode` prop or keep the mode column as a bespoke pill with documented exception |
| M5 | type-safety | `"void"` — type-safety agent notes this may be missing from CanonicalStatus in practice; schema-drift confirms it's load-bearing. Cross-check that the plan's `CanonicalStatus` definition (§3.1) carries it into the implementation. | plan §3.1 | Verify `"void"` is included when implementing `status-badge.tsx` (it is in the plan text; flag as implementation check) |
| M6 | type-safety | Three inline `BranchCombobox` copies have divergent props — `transfers-tab.tsx`, `requests-tab.tsx`, and `rooms/view.tsx` each define their own interface. Migrating them to `BranchSelector` requires prop reconciliation, not just a rename. | `components/pages/stock/transfers-tab.tsx`, `requests-tab.tsx`, `rooms/view.tsx` | Update Phase 0.6 note and the §3.5 BranchSelector migration note with a sub-task to audit and reconcile props across the three inline copies before deletion |
| M7 | scalability | Anti-duplicate pre-flight read is outside the transaction — `recordCheckIn` lines 275–305 do the 30-min window check before `tenantDb.transaction()` at line 308. Two concurrent drop-ins can both pass the guard. | `packages/services/src/check-ins.service.ts:275–308` | Update Phase 5.2 to add: "move duplicate-check read inside the transaction (with `SELECT FOR UPDATE` on the customer's most recent check-in), or add a partial unique index on `(customerId, check-in timestamp within 30 min)`" |
| M8 | scalability | `approveCommissionSplits` is live and has an unbounded `SELECT FOR UPDATE WHERE id IN (ids)` with no row-count cap. | `packages/services/src/commission-splits.service.ts` | Add to Phase 5 sub-task H12: server-side 500-row cap applies to approve as well as void |
| M9 | doc-consistency | `sales/view/columns.tsx` status map line range should be ~180–193, not 182–189. | `apps/web/src/components/tables/sales/view/columns.tsx` | Correct range in Phase 4.F.1 task description |
| M10 | doc-consistency | `payment/view/columns.tsx` mode map line range should be ~165–182, not 167–176. | `apps/web/src/components/tables/payment/view/columns.tsx` | Correct range in Phase 4.F.8 task description |
| M11 | doc-consistency | Phase 5 dependency on 4.F and 4.H is overstated — both are soft/parallel dependencies, not hard blockers. Commission dialog does not require Phase 4.F tokens to be complete; it only requires the mutation name (H1). | plan §5 | Relax Phase 5 dependency note: "Depends on Phase 0; 4.F and 4.H recommended before shipping but not required to start Phase 5" |
| M12 | doc-consistency | §9 appendix conflates the 13 existing `{area}/view/data-table.tsx` files with the generic `data-table.tsx` wrapper Phase 3.6 proposes to create. They are different files. | plan §9 | Add a note in §9 distinguishing the 13 per-area data-tables from the proposed generic wrapper in Phase 3.6 |
| M13 | test-coverage | ErrorState migration unenforceable — no CI hook to verify import count drops to 0. | plan Phase 0.5 AC | Add to Phase 0.5 acceptance criteria: "CI grep step confirms 0 imports of `error-state` in `apps/web/src/` (add to `lint.yml` once Phase H9 lands)" |
| M14 | test-coverage | No Storybook — plan's Phase 0 AC says "Storybook entries if project uses Storybook — verify". It does not. | `apps/web/package.json` | Close the open bracket in Phase 0 AC: "Project has no Storybook; JSDoc comments on each primitive suffice per §0 of spec" |

---

### P4 — Low / Info

- **schema-drift / INFO**: `"partially_received"` and `"ordered"` (PO-specific pgEnum values) are not in `CanonicalStatus`. Low priority — Phase 4.F.12 purchase-orders refactor will surface these; add them then.
- **api-surface / INFO**: `expenses.list({ status })` confirmed working as plan expects. No action.
- **test-coverage / LOW**: Vitest `include` glob only covers `src/__tests__/**`; co-located unit tests would be silently ignored. Absorbed by H14 fix (ensure Phase 0 tests land in `src/__tests__/`).
- **doc-consistency / LOW**: Three `<!-- TODO (audit): ... -->` markers in plan remain unresolved (expenses dir, commissions.bulkApprove×2). H1 and the expenses marker should be closed after applying the fixes above.
- **doc-consistency / LOW**: `payment-step.tsx:208` and `branch/create.tsx:33` confirmed accurate — no action.
- **type-safety / LOW**: `LucideIcon` export confirmed available in `lucide-react@0.473.0` — no action.
- **scalability / LOW**: Payouts 50-row default confirmed pre-existing, not introduced by this plan. No action.
- **scalability / INFO**: N/A claims in §7.5 verified; bundle size estimate for 4 primitives is consistent with existing UI component file sizes.

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 0 | 1 | 2 | 0 | 1 | ⚠️ needs fixes |
| api-surface | 0 | 2 | 1 | 0 | 1 | ⚠️ needs fixes |
| test-coverage | 0 | 4 | 2 | 1 | 0 | ⚠️ needs fixes |
| doc-consistency | 0 | 3 | 4 | 3 | 0 | ⚠️ needs fixes |
| type-safety | 0 | 3 | 3 | 1 | 0 | ⚠️ needs fixes |
| scalability | 0 | 1 | 2 | 1 | 1 | ⚠️ needs fixes |
| **TOTAL** | **0** | **14** | **14** | **6** | **3** | |

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| P2 H1–H2: procedure name corrections in plan | 2 plan sections | ~200 | Auto-fixable |
| P2 H3: expenses schema note + §8.8 | 1 plan section | ~150 | Auto-fixable |
| P2 H4–H5: add 3 statuses to CanonicalStatus | 1 plan section (§3.1) | ~100 | Auto-fixable |
| P2 H6: ErrorState compat fix description | 1 plan section (Phase 0.4) | ~150 | Auto-fixable |
| P2 H7: customer-step conditional note | 1 plan section (Phase 3.3, J5) | ~100 | Auto-fixable |
| P2 H8: close §8.2 | 1 plan section | ~80 | Auto-fixable |
| P2 H9–H10: add `.github/workflows/lint.yml` phase task | 1 plan section (Phase 2) | ~200 | Auto-fixable (plan annotation) |
| P2 H11: Phase 5 test tasks | 1 plan section | ~150 | Auto-fixable (plan annotation) |
| P2 H12: add Phase 5 batch endpoint sub-task | 1 plan section | ~150 | Auto-fixable (plan annotation) |
| P2 H13: correct CommissionStatusBadge line range | 2 plan sections | ~80 | Auto-fixable |
| P2 H14: Vitest test path note | 1 plan section | ~80 | Auto-fixable |
| P3 M1–M14: medium fixes | ~8 plan sections | ~800 | Mix of auto-fixable and annotation |
| **Total** | | **~2,200 tokens** | All plan edits, no source code |

---

## Auto-fixable findings

Purely mechanical edits to `plan/plan.md` — safe to apply immediately.

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| AF1 | api-surface | `client.commissions.bulkApprove` → `client.commissionSplits.approve` | plan §5.1, §6.5 TODO comments | Replace both occurrences |
| AF2 | api-surface | `checkIns.create` → `checkIns.recordCheckIn` | plan §8.4, Phase 5.2 | Replace both occurrences |
| AF3 | schema-drift | Close §8.3: `void` is confirmed load-bearing, already in CanonicalStatus | plan §8.3 | Replace open question with decision |
| AF4 | doc-consistency | Close §8.2: Biome 2.4.7 confirmed no `noRestrictedClasses` — use fallback script | plan §8.2 | Replace open question with confirmed decision |
| AF5 | type-safety | Add `"confirmed"`, `"inactive"`, `"discontinued"` to `CanonicalStatus` definition | plan §3.1 | Insert three status values into the union |
| AF6 | schema-drift | Add note to §8.8 / Phase 1.4: currency migration already exists | plan §8.8 and Phase 1.4 | Annotate: migration `0014_expenses_currency_myr.sql` exists; schema source needs `.default("myr")` |
| AF7 | doc-consistency | Fix CommissionStatusBadge line range 91–112 → 91–116 | plan §6.2, Phase 4.F.5 | Two string replacements |
| AF8 | doc-consistency | Fix sales columns line range 182–189 → 180–193 | plan Phase 4.F.1 | One string replacement |
| AF9 | doc-consistency | Fix payment columns line range 167–176 → 165–182 | plan Phase 4.F.8 | One string replacement |
| AF10 | test-coverage | Close Storybook question in Phase 0 AC | plan Phase 0 AC | Replace "if project uses Storybook — verify" with "no Storybook; JSDoc comments suffice" |
| AF11 | doc-consistency | Relax Phase 5 dependency note | plan Phase 5 dependencies | Replace "Depends on Phase 4.F and 4.H" with softer language |
