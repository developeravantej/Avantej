# Test Coverage Audit
**Session:** 04-19_19-30_tier3-quality-bets
**Lens:** test-coverage
**Findings:** 7 (C 0 · H 4 · M 2 · L 1 · I 0)

## Findings

### [HIGH] showMutationToast utility has zero automated test coverage
**Plan claims:** Phase 3.3 (Toast Contract) creates `apps/web/src/lib/toast.ts` with `showMutationToast`, `showSuccess`, `showError` functions.
**Actual:** The utility does not exist yet. The plan is manual-only verification: "Trigger each retrofitted mutation. Confirm loading spinner shows during in-flight request, success toast on resolve, error toast (with server message) on reject." This is entirely manual browser testing with no unit tests planned.
**File:** zplan/04-19_19-30_tier3-quality-bets/plan/plan.md:480-495
**Fix:** Add unit tests for `showMutationToast` covering promise resolution, promise rejection with error message extraction, and loading/success/error message display. Test the error message extraction pattern (e.g., `err?.message ?? "Unknown error"`).

---

### [HIGH] formatDateMYT timezone utility has zero automated test coverage
**Plan claims:** Phase 3.7 (A11y + Timezone) creates `apps/web/src/lib/date.ts` with `formatDateMYT` and `formatDateTimeMYT` utilities for MYT timezone formatting.
**Actual:** The utility does not exist yet. The plan verification is manual-only: open Chrome DevTools device emulation. Timezone-sensitive date formatting functions are notoriously bug-prone (e.g., displaying wrong date across midnight boundary in different timezones). Zero automated coverage for edge cases like: timestamps at midnight UTC vs MYT, DST transitions (not applicable for MYT but good defensive practice), invalid date inputs, null/undefined inputs.
**File:** zplan/04-19_19-30_tier3-quality-bets/plan/plan.md:550-560
**Fix:** Create comprehensive unit tests for `formatDateMYT` and `formatDateTimeMYT` covering: epoch timestamp, recent dates, dates before/after midnight in both UTC and MYT, invalid inputs, null/undefined handling, locale string validation.

---

### [HIGH] useUnsavedGuard hook has zero automated test coverage
**Plan claims:** Phase 3.4 (Unsaved Guard) creates `apps/web/src/hooks/useUnsavedGuard.ts` using TanStack Router's `useBlocker` API.
**Actual:** The hook does not exist yet. The plan verification is entirely manual browser testing: "Enter data on each page, then click a sidebar link. Confirm the browser confirm dialog appears. Confirm navigation is blocked if dismissed. Confirm navigation proceeds if confirmed."
**File:** zplan/04-19_19-30_tier3-quality-bets/plan/plan.md:498-509
**Fix:** Create unit tests for `useUnsavedGuard` using `@testing-library/react` hooks testing utilities, mocking `useBlocker` and `window.confirm`, testing the `shouldBlockFn` callback logic, and verifying `enableBeforeUnload` behavior.

---

### [HIGH] DashboardErrorBoundary class component has zero automated test coverage
**Plan claims:** Phase 3.1 (Error Boundaries) creates `apps/web/src/components/error-boundaries/DashboardErrorBoundary.tsx` as a React error boundary.
**Actual:** The component does not exist yet. The plan verification is manual-only: "Open browser devtools, manually throw in a dashboard route component, confirm Sentry event appears in Sentry dashboard. Confirm sidebar remains visible." No unit tests planned for the boundary's error catching, Sentry integration, or fallback UI rendering.
**File:** zplan/04-19_19-30_tier3-quality-bets/plan/plan.md:450-462
**Fix:** Create unit tests for `DashboardErrorBoundary` using `@testing-library/react` error boundary testing patterns (throw during render in a child component), verify `componentDidCatch` is called, verify the error card renders, verify sidebar/topbar remain visible in the error state.

---

### [MEDIUM] Plan verification for Phase 3.5 (Lazy Routes) uses manual-only type/build checks
**Plan claims:** Phase 3.5 (Lazy Route Migration) verification: "`bun check-types` passes, `bun dev` navigates correctly to all split routes, no hydration errors."
**Actual:** These are all manual/CLI checks with no automated test coverage. The plan does not include: unit tests for lazy route component imports, integration tests for route chunk loading on navigation, tests for hydration correctness, tests verifying chunk boundaries don't leak component state.
**File:** zplan/04-19_19-30_tier3-quality-bets/plan/plan.md:516-524
**Fix:** Create integration tests that: (1) navigate to a lazy route and verify the chunk loads, (2) verify no hydration mismatches, (3) verify route state is isolated between chunks. Document the bundle baseline measurement (before/after main chunk size) in the test report.

---

### [MEDIUM] Toast invalidateQueries key fix (Phase 3.3) has no validation test coverage
**Plan claims:** Phase 3.3 (Toast Contract) fixes `invalidateQueries` calls to use `orpc.X.Y.key()` pattern instead of raw string arrays. Lists 8 offending files with specific line numbers.
**Actual:** The plan verification is manual: "Trigger each retrofitted mutation. Confirm loading spinner shows during in-flight request, success toast on resolve, error toast (with server message) on reject." No tests verify that the key-pattern fix actually matches the queries being invalidated (risk: key mismatch means stale data after mutation).
**File:** zplan/04-19_19-30_tier3-quality-bets/plan/plan.md:480-495 and §3.6
**Fix:** Create unit/integration tests that verify: (1) each invalidateQueries call uses the correct key for the matching useQuery, (2) queries are actually invalidated after mutation, (3) no orphaned keys exist.

---

### [LOW] Sentry DSN environment variable configuration has no validation test
**Plan claims:** Phase 3.1 wires Sentry with optional DSN (`if (!dsn) return` guards against missing config).
**Actual:** No tests verify the init behavior with/without `VITE_SENTRY_DSN` environment variable. Risk: accidental deployment without DSN fails silently (intended behavior documented, but edge cases like `DSN=""` empty string not tested).
**File:** zplan/04-19_19-30_tier3-quality-bets/plan/plan.md:450-462
**Fix:** Create unit tests for `initSentry()` covering: DSN present, DSN absent, DSN empty string, DSN invalid format. Verify Sentry.init is called only when DSN is set.

---

## Summary

The plan contains **7 test coverage gaps**. Four high-severity utilities (`showMutationToast`, `formatDateMYT`, `useUnsavedGuard`, `DashboardErrorBoundary`) are completely unimplemented and all verification criteria are **manual-only browser tests**, making them unmeasurable in CI/CD and vulnerable to regression. The project has vitest configured with working test infrastructure (22 existing tests in `apps/web/src/__tests__/`), so the capability to add automated tests exists—the plan simply omits them. Two medium-severity items (lazy routes, invalidateQueries fix) rely on manual checks instead of integration tests. The timezone utility and Sentry config each have one low-risk gap (edge-case validation). Recommend adding unit/integration tests for all four high-severity utilities before merge, and documenting test patterns in CLAUDE.md for future maintenance phases.

