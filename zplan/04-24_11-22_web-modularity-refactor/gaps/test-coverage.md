# Test Coverage Audit — Web Modularity Refactor

Plan: `zplan/04-24_11-22_web-modularity-refactor/plan/plan.md`

## Summary

Frontend test infrastructure exists and is usable, but the plan makes two incorrect assumptions:
(a) `bun test` runs web tests — it doesn't; and (b) a lint rule can enforce Phase 3 / Phase 7 mutation-pattern bans — oxlint has no custom-rule hosting and biome rules are builtin-only. MSW is NOT installed; the existing `vi.mock("@/utils/orpc")` pattern works instead. Zero RTL coverage exists today for three of the four mega-files.

## Findings

### [HIGH] `bun test` does not run web tests
- Root `package.json` has no `test` script; turbo config has none either.
- `apps/web/package.json` has `"test": "vitest run"` — must be invoked via `cd apps/web && bun test` or a new root script.
- Success criterion "`bun test` (server + web) pass after every phase" (§1.Success Criteria) will silently skip web tests in CI unless a root-level script or turbo task is added.
- **Fix:** Add `"test": "turbo test"` to root and a `test` task in `turbo.json`, OR rewrite acceptance to `cd apps/web && bun test && cd ../server && bun test`.

### [HIGH] No lint host for Phase 3 / Phase 7 mutation-pattern ban
- Plan Task 3.3 / 7.2 proposes a CI rule that fails on `new try { await ... .mutate }` outside `useApiMutation`.
- Project uses **oxlint** (1.12.0) + **biome** (2.2.0). Neither supports custom/project-local AST rules today. `.oxlintrc.json` only toggles builtins.
- **Fix:** Either (a) write a `scripts/check-mutation-pattern.ts` grep-based guard invoked via `bun check`, or (b) drop the lint rule and rely on code review. The plan as written cannot be executed with current tooling.

### [MEDIUM] MSW not installed — plan §7 mentions MSW for `useApiMutation` tests
- Testing approach says "useApiMutation tested with MSW-mocked oRPC responses". `package.json` has no `msw` dep.
- Existing convention (22 test files) is `vi.mock("@/utils/orpc")` returning `mockClient`. This is simpler and already proven.
- **Fix:** Update plan to say "tested by mocking `@/utils/orpc` via `vi.mock` (existing pattern) — no MSW required." Saves a dep + setup-file expansion.

### [MEDIUM] Zero existing RTL coverage for 3 of 4 mega-files
- Present: `__tests__/pages/packages/installments-page.test.tsx` (1 file for mega-file #2).
- Missing: `add-appointment-modal`, `trainers/view`, `EnhancedPermissionMatrix` — no tests grep-match.
- Phase 6 acceptance says "any existing RTL tests" pass — vacuously true. The plan needs to **require new** smoke tests per split, not just preserve existing ones.
- **Fix:** Add explicit Task 6A.6 / 6B.4 / 6C.5 "write baseline RTL smoke test BEFORE splitting" so the split has a regression net.

### [MEDIUM] Drift-detection for invalidation keys is untestable
- §6 breakage table: "Must mirror existing manual `invalidateQueries` keys exactly per call site." No test strategy proposed.
- A unit test for `useApiMutation` can assert it calls `queryClient.invalidateQueries` with the keys passed in — but it cannot verify the caller passed the *same* keys it was manually invalidating before migration.
- **Fix:** Either (a) add a one-time codemod-assisted diff report in Phase 2 PR description listing before/after invalidation keys per file, or (b) add per-migrated-file cache-behavior RTL test. Plan should acknowledge this is a review-gate, not a test-gate.

### [LOW] Infra files confirmed present and correct
- `apps/web/vitest.config.ts` — exists.
- `apps/web/src/__tests__/setup.ts` — exists.
- `helpers/mock-client.ts` — exists, mocks surface of `@/utils/orpc` (22 test files consume via `vi.mock("@/utils/orpc")`). Correct path.
- `helpers/render-with-providers.tsx` — exists, wraps in `QueryClientProvider` with retry disabled. Suitable for `useApiMutation` tests.

### [LOW] ≥90% coverage claim unverifiable without coverage gate
- `test:coverage` script exists but no threshold config in `vitest.config.ts` or CI.
- **Fix:** Add `coverage.thresholds` to vitest config targeting the new files, or downgrade acceptance to "coverage report attached to PR" (qualitative).

### [INFO] Tooling inventory
- Vitest 4.0.18, @testing-library/react 16.3.2, jsdom 28, user-event 14 — all installed and current.
- No Playwright at web level (root has `@playwright/test` 1.59 for E2E but plan doesn't invoke it).

## Priority Actions

1. **HIGH**: Pick a Phase 3/7 enforcement mechanism that matches the toolchain (script-based guard, not a lint rule) OR drop the CI guard from acceptance.
2. **HIGH**: Fix `bun test` invocation — add root `test` script via turbo, or rewrite success criteria.
3. **MEDIUM**: Delete the MSW reference; rely on existing `vi.mock("@/utils/orpc")` pattern.
4. **MEDIUM**: Add "write baseline RTL smoke test before split" as a prerequisite task in Phases 6A/6B/6C.
5. **LOW**: Add coverage threshold config if the ≥90% target is load-bearing.
