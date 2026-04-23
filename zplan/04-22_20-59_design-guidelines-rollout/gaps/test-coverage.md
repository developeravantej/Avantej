# Test Coverage Audit
**Session:** 04-22_20-59_design-guidelines-rollout
**Findings:** 7 (0 critical · 4 high · 2 medium · 1 low · 0 info)

## Findings

### [HIGH] Phase 0 primitives do not exist — no tests possible yet
**Plan claims:** Unit tests pass for PageCard, StatusBadge, EmptyState, StatusCallout, BranchSelector. Every `StatusBadge.KNOWN_STATUSES` value asserted.
**Actual:** None of the five Phase 0 primitives exist anywhere under `apps/web/src/`. The names `PageCard`, `StatusBadge` (shared), `EmptyState`, `StatusCallout`, and `BranchSelector` have no corresponding component files. There are several local `StatusBadge` inline functions (e.g. in `today-bookings.tsx`, `waitlist-panel.tsx`, `commissions/all-tab.tsx`) but none is the canonical shared primitive the plan refers to. No test files exist for any of them.
**File:** `apps/web/src/components/ui/` — no PageCard, StatusBadge, EmptyState, StatusCallout, BranchSelector files present
**Fix:** Create the five primitive component files before writing tests; the plan's Phase 0.1–0.5 implementation work must precede any test authoring.

---

### [HIGH] No CI enforcement for `text-gray-500` — Phase 2 acceptance criterion unmet
**Plan claims:** CI fails when a PR introduces `text-gray-500` in any in-scope file. CI passes on `main` at time of merge (violations grandfathered).
**Actual:** There is no `.github/` directory at the project root, therefore no GitHub Actions CI workflow exists at all. There is no custom Biome lint rule restricting className values; `biome.json` only has `useSortedClasses` (a sort/order rule, not a value restriction). The `.oxlintrc.json` has no Tailwind className content rules. There are currently 35 occurrences of `text-gray-500` in `apps/web/src/` — the baseline — and nothing would block new ones from being merged.
**File:** `C:\Project\Avantej\biome.json` — no className restriction; no `.github/workflows/` directory exists
**Fix:** Create a GitHub Actions CI workflow (or extend the existing pre-commit hook) that runs `rg "text-gray-500"` on staged/changed files and fails if any new occurrences appear outside grandfathered files.

---

### [HIGH] No PR template — Phase 2 acceptance criterion unmet
**Plan claims:** PR template visible on any new PR.
**Actual:** No `.github/PULL_REQUEST_TEMPLATE.md` or `.github/PULL_REQUEST_TEMPLATE/` directory exists at the repository root. The `.github/` directory itself is absent.
**File:** `C:\Project\Avantej\` root — `.github/` directory missing entirely
**Fix:** Create `.github/PULL_REQUEST_TEMPLATE.md` with the checklist defined in the plan.

---

### [HIGH] Phase 5 UI acceptance criteria have no automated tests
**Plan claims:** (a) Bulk-approve on commissions opens a confirmation dialog with count + total; clicking Cancel does not fire the mutation. (b) Attempting a repeat check-in within 30 min surfaces a warning dialog, not a silent no-op.
**Actual:** The server-side check-in anti-duplicate logic is well-tested in `apps/server/src/tests/unit/services/check-ins.test.ts` (the `ALREADY_CHECKED_IN` error is covered). However, there are zero frontend tests that verify the UI presents a warning dialog rather than silently swallowing the error. The bulk-approve commission dialog + Cancel-does-not-fire-mutation path has no test — neither in `apps/web/src/__tests__/` nor in the server integration tests.
**File:** `apps/web/src/__tests__/` — no commission bulk-approve test; no check-in warning-dialog test
**Fix:** Add two frontend component tests: one that mounts the commissions page and asserts the confirmation dialog appears with the correct count/total when bulk-approve is triggered and Cancel does not call the mutation; one that simulates the `ALREADY_CHECKED_IN` error response and asserts a warning dialog renders.

---

### [MEDIUM] `ErrorState` migration grep count not verifiable — plan's Phase 0.5 criterion is untracked
**Plan claims:** "`ErrorState` consumers all migrated (grep count = 0 after 0.5)" — meaning Phase 0.5 replaces all existing `ErrorState` usages with the new `StatusCallout` primitive.
**Actual:** `ErrorState` (from `apps/web/src/components/ui/error-state.tsx`) currently has 0 import consumers across `apps/web/src/` (confirmed by grep). However, the component itself exists and is used inline via the path directly. More importantly, the new `StatusCallout` primitive (which is supposed to replace it) does not exist yet, so the "grep count = 0" criterion cannot be evaluated. There is no automated check that enforces this at CI or test level.
**File:** `apps/web/src/components/ui/error-state.tsx` — component exists, 0 named imports, no enforcement mechanism
**Fix:** After Phase 0.5 creates `StatusCallout`, add a one-line grep assertion in CI (or a test helper) that fails if `error-state` is imported anywhere; the `ErrorState` file itself should be deleted.

---

### [MEDIUM] Storybook absent — Phase 0 acceptance criterion partially unfulfillable
**Plan claims:** "Storybook entries (if project uses Storybook — verify; if not, docs comments on the component suffice)."
**Actual:** No Storybook dependency appears in `apps/web/package.json` or the root `package.json`. No `.storybook/` directory exists and no `*.stories.*` files are present anywhere in the project. The plan's fallback ("docs comments on the component suffice") becomes the only viable path. This needs to be documented as a decision so reviewers don't block on missing Storybook entries.
**File:** `apps/web/package.json` — storybook not listed in dependencies or devDependencies
**Fix:** No action required on Storybook itself; explicitly note in Phase 0 component files that JSDoc comments serve as the documentation substitute, and update the acceptance criteria to remove the Storybook mention.

---

### [LOW] `vitest.config.ts` `include` glob does not cover a potential `src/components/ui/*.test.tsx` pattern outside `__tests__/`
**Plan claims:** Unit tests for UI primitives pass via `bun test --filter ui-primitives` (or equivalent).
**Actual:** `apps/web/vitest.config.ts` specifies `include: ["src/__tests__/**/*.test.{ts,tsx}"]`. This means any test file placed co-located with components (e.g. `src/components/ui/StatusBadge.test.tsx`) would be silently ignored by the test runner. If the plan author intends primitive tests to live alongside the component files, the config must be updated.
**File:** `apps/web/vitest.config.ts:11` — `include` pattern restricts tests to `src/__tests__/` subtree only
**Fix:** Either keep all primitive tests under `src/__tests__/components/ui/` (no config change needed) or broaden `include` to also match `src/**/*.test.{ts,tsx}` — and document the convention for primitive tests.

---

## Summary

The test infrastructure itself is solid: `vitest.config.ts` is correctly configured, the `src/__tests__/` directory has 22 test files covering routes, components, hooks, and utilities, and the server has 46 integration tests plus 144+ unit tests including thorough check-in anti-duplicate coverage. However, the plan's Phase 0 primitives (PageCard, StatusBadge, EmptyState, StatusCallout, BranchSelector) do not yet exist as shared components, making all primitive unit tests impossible to write. Phase 2's CI enforcement of the `text-gray-500` token restriction has no implementation path — there is no `.github/` directory, no Actions workflow, no Biome className content rule, and no PR template. Phase 5's two UI-level acceptance criteria (commission bulk-approve dialog, check-in warning dialog) are unrepresented in the frontend test suite. These four high-severity gaps should be addressed before the plan reaches implementation phases 2 and 5.
