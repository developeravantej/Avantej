# Plan 7 — Shared Hygiene: test-infra fixes (owns shared config)

**Agent scope:** test infrastructure only. **This plan has EXCLUSIVE ownership of `apps/web/vitest.config.ts`** — no other agent may touch it. Run this plan FIRST if executing sequentially. Read [00-orchestration.md](00-orchestration.md).

## Goal
Make the test infrastructure honest: run the orphaned test file, resolve hard-disabled suites, and leave the vitest globs able to pick up everything the other plans add.

## User journeys affected
None directly — this protects every other plan's verification story.

## Tasks

### Task 1 — Fix vitest include globs (orphaned test)
- `apps/web/vitest.config.ts` includes only `src/__tests__/**/*.test.{ts,tsx}` and `src/features/**/*.test.{ts,tsx}`. `src/lib/gender.test.ts` exists but NEVER RUNS.
- Fix: add `src/lib/**/*.test.{ts,tsx}` to include (preferred — allows colocated lib tests) OR move `gender.test.ts` into `src/__tests__/lib/`. Pick whichever keeps the test passing; if the orphaned test is stale and fails, fix the test to match current `gender.ts` behavior (read the source first — do not change `gender.ts` to satisfy a stale test).
- After the change, confirm the file count reported by `bun run test` INCREASES and nothing new fails.

### Task 2 — Resolve `describe.skip` dashboard suite
- `apps/web/src/__tests__/routes/dashboard.test.tsx:95` — entire "Dashboard page" suite hard-disabled.
- Investigate why (git log / git blame the skip). Then either: (a) un-skip and repair the tests against current dashboard behavior, or (b) if the suite tests a removed behavior, delete it and note why in the completion report. **Reminder from project memory:** never gate dashboard on role/orgs — new SaaS owners legitimately land on /dashboard with 0 orgs; if the old tests assert role gating, they are wrong by design → delete those assertions.

### Task 3 — Attendance hard-skip
- `_e2e/web/attendance/check-ins.lifecycle.spec.ts:52` — unconditional `test.skip("Check-in rule — duplicate drop-in...")`. Investigate: if the duplicate-drop-in rule is implemented server-side, convert to a running test; if the rule was never implemented, replace the skip with a conditional guard + a comment naming the missing server rule, and flag it in the report as a product gap.
- NOTE: `products.test.tsx` skips are Inventory domain — EXCLUDED from this session, leave them.
- NOTE: `payment/print-documents.rule.spec.ts:36` env-gated skip is intentional (R2/env) — leave it.

### Task 4 — Baseline snapshot
- Before any other plan lands: record baseline counts (`bun run test` file/test counts, e2e spec count 279) into `zplan/2026-07-12_web-maturity-remediation/baseline.md` so the session's global verification can prove net-new coverage.

## Files owned
- `apps/web/vitest.config.ts` (EXCLUSIVE)
- `apps/web/src/lib/gender.test.ts` (or its new location), `apps/web/src/__tests__/routes/dashboard.test.tsx`
- `_e2e/web/attendance/check-ins.lifecycle.spec.ts`
- `zplan/2026-07-12_web-maturity-remediation/baseline.md`

## Risks
- Widening vitest globs can surface OTHER orphaned failing tests — if new failures appear that belong to other domains, report them; fix only if trivial and inside owned files.
- Un-skipping the dashboard suite may fail due to the known web-test orpc-mock shape requirement (mock must return both `client` and `orpc`) — fix the mock, not the page.

## Verification
1. `cd apps/web && bun run test` — gender test now executes; dashboard suite either runs green or is removed; total count recorded in baseline.md.
2. `bun check-types` and `bun check` clean.
