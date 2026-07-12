# Baseline Snapshot — Web Maturity Remediation

Captured by Plan 7 (Shared Hygiene) BEFORE any remediation changes landed.
Date: 2026-07-12. Branch: `wilfred/avantej-16-opening-hours`.

## Web unit tests (`cd apps/web && bun run test`, vitest 4.1.6)

| Metric | Count |
|---|---|
| Test files | **84** (83 passed, 1 skipped) |
| Tests | **497** (485 passed, 12 skipped) |
| Duration | 71.79s |

Notes:
- The 1 skipped file is `src/__tests__/routes/dashboard.test.tsx` (whole suite `describe.skip` — quarantined at the dashboard-launchpad merge).
- The 12 skipped tests include the Inventory-domain `products.test.tsx` skips (EXCLUDED from this session by owner decision — left as-is).
- `src/lib/gender.test.ts` exists on disk but is NOT in this count — the vitest include globs (`src/__tests__/**`, `src/features/**`) do not cover `src/lib/**` at baseline.

## E2E specs

| Location | Spec files (`*.spec.ts`) |
|---|---|
| `_e2e/` (review/deep suite) | **146** |
| `e2e/` (repo-root Playwright) | **88** |
| `test(`/`test.skip(` occurrences in `_e2e/` | 323 |

Note: plan-7 Task 4 cited "e2e spec count 279" — actual measured file counts above (146 + 88 = 234 files; 323 is _e2e test-case occurrences). Recording measured values with methodology so post-session comparison is apples-to-apples: re-run the same `find`/`grep` commands.

Hard-skips at baseline:
- `_e2e/web/attendance/check-ins.lifecycle.spec.ts:52` — unconditional `test.skip` (duplicate member drop-in 409). Addressed by Plan 7 Task 3.
- `_e2e/web/payment/print-documents.rule.spec.ts:36` — env-gated (R2), intentional, left as-is.

## Post-change counts (Plan 7 only — appended after execution)

`cd apps/web && bun run test` after Plan 7 landed (before any other plan):

| Metric | Baseline | After Plan 7 | Delta |
|---|---|---|---|
| Test files | 84 (83 passed, 1 skipped) | **85 (85 passed, 0 skipped)** | +1 file (`src/lib/gender.test.ts` now runs); dashboard file un-skipped |
| Tests | 497 (485 passed, 12 skipped) | **499 (496 passed, 3 skipped)** | +11 passing (3 gender + 8 rewritten dashboard); skips 12 → 3 (only the excluded Inventory `products.test.tsx` skips remain) |

Plan 7 changes behind the delta:
1. `apps/web/vitest.config.ts` — added `src/lib/**/*.test.{ts,tsx}` include glob.
2. `apps/web/src/__tests__/routes/dashboard.test.tsx` — quarantined `describe.skip` suite (asserted the removed pre-launchpad dashboard UI) rewritten against `DashboardLaunchpad` (8 tests, all passing).
3. `_e2e/web/attendance/check-ins.lifecycle.spec.ts` — unconditional `test.skip` converted to a probe-based conditional guard. Spec/test counts in `_e2e/` unchanged (146 files / 323 cases). Known API gap flagged: `checkIns.recordCheckIn` validates `clientId` as `z.string().uuid()` but member clientId is `members.userId` (Better-Auth nanoid) — the server-implemented 30-min duplicate rule is unreachable via the API until `packages/api/src/routers/check-ins.ts` relaxes it to `z.string().min(1)`.

Other plans should compare their own post-change `bun run test` counts against the "After Plan 7" column.
