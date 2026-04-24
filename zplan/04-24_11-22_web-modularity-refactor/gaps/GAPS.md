# Swarm Audit — GAPS.md

**Session:** 04-24_11-22_web-modularity-refactor
**Run at:** 2026-04-24 11:22 (local)
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 29 (3 critical · 9 high · 9 medium · 6 low · 2 info)

---

## Priority Fix Order

### P1 — Critical (block execution — fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 1 | schema + api | `organizations.defaultCurrency` does NOT exist. Plan's `useUserContext().currentOrganization.defaultCurrency` path is fictional — `useUserContext` returns `organizations[]` + `currentOrganizationId`, no `currentOrganization` singleton, and the column is absent from `packages/db/src/schema/control-panel/organizations.ts`. | `plan/plan.md §3.2, §3.4, §6, Task 1.5` | Remove currency-from-context dependency; hard-fallback to `"MYR"` in `formatPrice` default and `moneyColumn` default. If per-tenant currency is truly needed, that's a separate backend session (explicitly out of scope). |
| 2 | api + doc | `EnhancedPermissionMatrix.tsx` is at `components/access-control/permission-matrix/EnhancedPermissionMatrix.tsx`, not `components/access-control/`. `permissions-tab.tsx` lives under `components/pages/access-control/`. | `plan/plan.md §1, §3.5, Phase 6C, §6 "Callers to trace"` | Correct both paths. Update Phase 6C file references and the split topology table. |
| 3 | doc | Phase 5 lists `trainers` as a `columns.tsx` to migrate — no `components/tables/trainers/` directory exists; trainer table code lives inside the `trainers/view.tsx` mega-file being split in Phase 6B. | `plan/plan.md §Phase 5 Task 5.1` | Remove `trainers` from Phase 5 list. Trainer columns become a Phase 6B extraction. |

### P2 — High (fix before merging)

| # | Lens | Finding | Fix |
|---|------|---------|-----|
| 4 | api | Plan's "pure wrapper refactor" premise vs sonner usage: only 5 files currently import `toast` from `"sonner"`. The 299 `toast.error` calls likely use a different toast source. | Grep `toast.error` call sites to confirm actual toast library(s) before Phase 1. If multiple libraries, scope to one OR wrap library-agnostic. |
| 5 | test | `bun test` does NOT run web tests — no root test script, no turbo task. Success criterion "`bun test` green after every phase" silently passes today. | Add a `test:web` script at root (or `turbo test --filter=web`) and make it part of the per-phase acceptance command. |
| 6 | test | No lint host for Phase 3 / 7 CI rule. Project uses oxlint + biome; neither supports custom rules. | Replace with a grep-based CI guard script (`scripts/check-no-raw-mutation-toast.ts`) wired into the existing lint step. |
| 7 | type | `useApiMutation` signature uses 3 generics; TanStack's `UseMutationOptions` has 4. Real issue: `TVariables` inference relies on `mutationFn` — wrapper must keep `mutationFn` on the options object. Plan doesn't specify. | Explicitly define `mutationFn` placement in Task 1.4. Unit-test both idioms: custom-closure (`useUserAssignment.ts`) AND `orpc.X.mutationOptions()` spread. |
| 8 | type | `add-appointment-modal.tsx` contains 8 `as any` casts on oRPC results that will leak into the extracted hook; `trainers/view.tsx` has 1. | Add an explicit pre-split task in Phase 6A: type oRPC query results properly before extraction. |
| 9 | perf | `invalidate: string[]` prefix API won't match oRPC-generated query-key shapes (`orpc.members.list.key()`) or hand-rolled array keys — silent missed invalidations. | Redesign API to accept `QueryKey[]` (array of arrays) or `(() => QueryKey)[]`. Document interop with `orpc.X.key()`. |
| 10 | perf | Undefined `invalidate` footgun: if wrapper falls through to `queryClient.invalidateQueries()` with no args, it nukes every cache. Precedent exists at `utils/orpc.ts:14`. | Phase 1 wrapper MUST invalidate nothing when `invalidate` is undefined. Add explicit unit test. |
| 11 | test | 3 of 4 mega-files have ZERO existing RTL tests (only `installments-page.test.tsx` exists). Phase 6 acceptance "existing tests pass" is vacuously true. | Add sub-task at start of each Phase 6 block: write baseline RTL smoke test BEFORE the split. |
| 12 | api | C1's fix (adding `defaultCurrency` to userContext) would contradict the plan's "no oRPC contract changes" scope. P1-#1 fix keeps scope intact. | Accept MYR hardcode; document this as a known limitation. |

### P3 — Medium (fix before shipping)

| # | Lens | Finding | Fix |
|---|------|---------|-----|
| 13 | test | MSW not installed. Plan §7 calls for it, but existing convention is `vi.mock("@/utils/orpc")` with `mockClient`. | Remove MSW from Task 1.4; use existing mock pattern. |
| 14 | test | Invalidation-key-drift ("mirror existing `invalidateQueries` exactly") is untestable in unit tests alone. | Require a before/after diff report per migrated file in PR description; OR add per-file cache-behavior test. |
| 15 | type | Plan says `parseMoneyInput` "throws on invalid" but `zMoneyInput` uses `.transform` — throwing inside a zod transform escapes zod. | Return `Result<number, string>` from `parseMoneyInput`, and in `zMoneyInput` use `ctx.addIssue` on error. Specify in Task 1.1. |
| 16 | type | `zPercentageBp` handles stored basis points, but forms collect `"8.00"` strings. Missing a string-transform variant. | Add `zPercentageInput` parallel to `zMoneyInput` in Task 1.3. |
| 17 | perf | Phase 4 codemod regex scoped to `price|amount|cents|rm` misses `total|subtotal|discount|tax|fee|refund|commission|payout|deposit|installment|credit`. | Expand identifier allowlist in the codemod. Manual review still required. |
| 18 | doc | §6 has a broken Windows-absolute/relative hybrid markdown link to `feedback_stale_permission_cache.md`. | Fix link to standard relative path or remove. |
| 19 | test | ≥90% coverage claim has no enforcement — `test:coverage` exists but no threshold config. | Either enforce via vitest `coverage.thresholds` in `apps/web/vitest.config.ts`, or soften claim to "meaningful coverage". |

### P4 — Low / Info

- **(test)** Infra confirmed present: `vitest.config.ts`, `setup.ts`, `mock-client.ts`, `render-with-providers.tsx`.
- **(type)** `@tanstack/react-table@^8.21.3` installed — matches existing tables. OK.
- **(type)** `lib/currency.ts` only exports `formatPrice`; shim plan is complete.
- **(type)** `formatPrice(cents, currency = "MYR")` default is safe — all ~39 callers pass it.
- **(perf)** React Profiler verification lacks baseline/threshold — specify a concrete render-count delta target.
- **(perf)** Wrapper-overhead benchmark unspecified — pick a tool (e.g. `vitest bench`) or drop claim.
- **(doc-INFO)** All 4 sibling sessions exist; the two gating sessions are correctly still IN-PROGRESS.
- **(perf-INFO)** TanStack v5 prefix matching confirmed (`^5.85.5`, no `exact: true` usage in repo).
- **(schema-INFO)** Web-only claim verified — no phase touches `packages/db` or server schemas.
- **(schema-INFO)** `zPercentageBp` basis-points convention matches existing `tax-rates`, `promotions`, `commission-tier-rates`, `installment-plans` schemas.

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift   | 1 | 0 | 0 | 0 | 2 | complete |
| api-surface    | 2 | 1 | 1 | 1 | 0 | complete |
| test-coverage  | 0 | 2 | 3 | 2 | 0 | complete |
| doc-consistency| 0 | 2 | 2 | 2 | 1 | complete |
| type-safety    | 0 | 2 | 2 | 1 | 0 | complete |
| scalability    | 0 | 2 | 1 | 0 | 2 | complete |

*(P1 count is 3 because findings 1 and 2 deduplicate schema/api and api/doc overlap respectively.)*

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| P1-#1 MYR hardcode | plan.md only | 300–500 | Remove 3 references to `defaultCurrency`. |
| P1-#2 path corrections | plan.md only | 200 | Two string replacements. |
| P1-#3 trainers→6B | plan.md only | 200 | Move bullet across phases. |
| P2-#4 toast investigation | plan.md + grep output | 400 | Quick reconnaissance; no code yet. |
| P2-#5 test:web script | root `package.json`, `turbo.json` | 300 | Small additive change. |
| P2-#6 grep guard script | new `scripts/check-no-raw-mutation-toast.ts` + plan update | 800–1200 | New file ~40 lines. |
| P2-#7 wrapper generics fix | plan.md §3.1 rewrite | 500 | Add mutationFn placement spec + tests. |
| P2-#8 pre-split typing (6A) | plan.md + ~8 casts | 600 | Plan update only; code work in Phase 6A. |
| P2-#9 invalidate QueryKey[] redesign | plan.md §3.1 + test spec | 500 | API shape change. |
| P2-#10 undefined-invalidate guard | plan.md §3.1 + test spec | 250 | One behaviour rule + test. |
| P2-#11 baseline RTL tests | 3 new test files in Phase 6 | 1500–3000 | Deferred to Phase 6; plan-only update now. |
| P3 medium items (5 fixes) | plan.md edits | 1500 | All plan rewrites. |

**Total plan rewrite cost: ~6000 tokens.** Downstream code work unchanged.

---

## Auto-fixable findings

Purely mechanical fixes safe for `--apply`:

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| 2 | api/doc | `EnhancedPermissionMatrix.tsx` path | plan.md (multiple) | Replace `components/access-control/EnhancedPermissionMatrix.tsx` → `components/access-control/permission-matrix/EnhancedPermissionMatrix.tsx` |
| 2b | doc | `permissions-tab.tsx` path | plan.md §6 | Replace `components/access-control/permissions-tab.tsx` → `components/pages/access-control/permissions-tab.tsx` |
| 3 | doc | Remove `trainers` from Phase 5 list | plan.md Phase 5 Task 5.1 | Strike-through + move to Phase 6B |
| 18 | doc | Broken markdown link | plan.md §6 | Fix or remove |
| 13 | test | MSW mention | plan.md Task 1.4 | Replace "MSW-mocked oRPC" → "`vi.mock('@/utils/orpc')` with `mockClient`" |

All other findings require design judgment (how to handle absent `defaultCurrency`, how to design `invalidate` API, etc.) and should NOT be auto-applied.

---

## Recommendation

**DO NOT run `/execute` until P1 findings are resolved.** P1-#1 alone (defaultCurrency) would cause every `moneyColumn` and `formatPrice` call to read `undefined` and silently format nothing. P1-#2 and P1-#3 are mechanical doc errors that would waste agent time during execution.

Next step: run `/audit-apply` or update the plan manually to address the 3 P1s + 9 P2s, then re-audit a subset of lenses before executing.
