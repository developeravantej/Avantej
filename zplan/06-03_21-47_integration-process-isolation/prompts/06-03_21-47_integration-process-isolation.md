# Integration harness: kill the bun:test transaction wedge → 48/48 green

> Handoff prompt generated 2026-06-03 · Branch: `test/unit-suite-green-and-ci-fix` · Project: Avantej

## Mission

Eliminate the JS-promise-level transaction wedge that makes `promotions.integration.test.ts` time out, so the isolated integration suite goes from **47/48 → 48/48** and the other 47 files become more robust against the same intermittent hang. The fix belongs in the **test harness**, not in individual tests.

Done = `bun run test:integration:isolated` reports 48/48 (0 fail / 0 timeout), and `promotions` passes a standalone `ISOLATED_TEST_DB=true` run.

## Context

**Project:** Avantej — multi-tenant gym/fitness SaaS (Vite + TanStack Router + Better-Auth + oRPC + Drizzle; Cloudflare Workers backend). Integration tests hit real per-tenant Neon Postgres branches.
**Stack (relevant):** `bun:test` runner, `drizzle-orm` over `node-postgres` (`pg`) for tests, Neon branch-per-run provisioning.
**Branch:** `test/unit-suite-green-and-ci-fix` (local only, not pushed).
**Recent work (this branch, top commits):**
- `0af1702f` promotions — uuid-fixture bug fixed + 2 limit tests raced (PARTIAL: file still times out)
- `3880f147` unwedged 3 timeout files (audit-prove-fixes, branch-invite, expenses)
- `464950c5` fixed all 8 failing integration files → 44/48
- `8f7cc342` / `7ad7ef03` baseline seed (branch node + service) in `seedTenantBaseline`

## Current State

Integration suite is at **47/48** via the per-file isolated runner. The lone holdout is `promotions.integration.test.ts`, which **times out** on the test `"minimum order amount enforcement"`.

**Root cause (already diagnosed — do not re-litigate):** under `bun:test`, drizzle's `pg` transaction **commit/rollback promise intermittently fails to settle** even though the SQL ran server-side. The JS `await` hangs → bun's 30s per-test timeout fires → the stuck connection cascades into the afterEach hook → the whole file exceeds the runner's 150s cap. In `promotions` it surfaces in `createPromotion`/`applyPromotion` under cumulative load (many transactions in one file).

**Proven NOT to fix it:** server-side timeouts. Lowering `idle_in_transaction_session_timeout`/`lock_timeout` from 10s → 3s/4s had **zero effect** (a hung JS promise is immune to DB-side timeouts) — that experiment was reverted. Per-test band-aids (sentinel-race + plain-SELECT invariant) work for files with *few* transactions but lose to cumulative leakage in `promotions`.

**Harness today:** `run-integration-isolated.ts` already does per-**file** process isolation (one `bun test <file>` child per file, against one shared seeded branch). The wedge happens *within* a file, so per-file isolation isn't enough for `promotions`.

Full context + the diagnosis history lives in `~/.claude/projects/C--Project-Avantej/memory/feedback_integration_harness_blocked.md` (read the "2026-06-03 FINAL" section).

## Scope

**In scope:**
- `apps/server/src/tests/helpers/integration-setup.ts` (`withTxTimeout`, `getSharedPool`, pool config, `createTenantDb`)
- `apps/server/scripts/run-integration-isolated.ts` (the runner — candidate for per-test isolation)
- `apps/server/src/tests/preload.ts` (provisioning + `seedTenantBaseline`, if a per-test reset hook is needed)
- `apps/server/src/tests/integration/promotions.integration.test.ts` (only if a harness fix still leaves a residual)

**Out of scope (do not touch):**
- Any product code under `packages/services`, `packages/api`, `packages/db` — the wedge is a test-harness issue, not a product bug. (One real product finding is already flagged separately: commission track-path 23505 not swallowed — leave it.)
- The 11 already-fixed integration files (their sentinel-race patterns work — don't churn them).
- `bunfig.toml` preload wiring unless strictly required.
- Do not change `skipIf(shouldSkipIntegration())` gating — the default `bun run test` (SKIP_INTEGRATION_TESTS=true) must keep skipping these so CI stays green.

## Tasks

1. Reproduce: `cd apps/server && ISOLATED_TEST_DB=true bun test src/tests/integration/promotions.integration.test.ts` — confirm it times out on "minimum order amount enforcement". (Needs `NEON_API_KEY` in `.dev.vars`; provisioning a fresh branch + migrations ≈ 94s.)
2. Pick a harness strategy and validate the hypothesis cheaply before committing to it. Candidates, roughly in order of leverage/effort:
   a. **Per-test process isolation** in `run-integration-isolated.ts` — discover each file's test names (or use bun's `-t`/filter) and spawn one child per test against the shared branch. Bulletproof (a fresh process can't inherit a stuck connection) but slower and more complex.
   b. **Fresh+force-closed connection per transaction-using test** — give wedge-prone tests their own `pg` pool that is `.end()`-ed in afterEach, so a hung promise can't poison the shared pool. Test whether `pool.end()` actually unblocks the next test.
   c. **Replace drizzle's `.transaction()` wrapper** with manual `BEGIN`/`COMMIT`/`ROLLBACK` via a dedicated client that's released in a `finally` — sidesteps the specific drizzle-settle bug.
   d. **Driver/version bump** — check whether a newer `pg` or `drizzle-orm` resolves the settle-under-bun behavior (lowest-confidence; verify in isolation first).
3. Implement the chosen strategy at the harness level. Keep it minimal and well-commented (explain WHY, referencing the JS-promise-settle wedge).
4. Verify `promotions` passes standalone (Task 1 command → 0 fail).
5. Run the FULL isolated suite and confirm no regressions: `bun run test:integration:isolated --timeout 120` → expect **48 files pass / 0 fail / 0 timeout**.
6. `bun run check-types` (0 errors) and commit on the existing branch with a clear message. Update the memory note's "FINAL" section to 48/48.

## Verification

- [ ] `cd apps/server && ISOLATED_TEST_DB=true bun test src/tests/integration/promotions.integration.test.ts` → `0 fail`, no 30s timeout.
- [ ] `cd apps/server && bun run test:integration:isolated --timeout 120` → `48 files pass / 0 fail / 0 timeout (of 48)`.
- [ ] The 47 previously-green files still pass (no new failures/timeouts introduced by the harness change).
- [ ] `bun run check-types` → 0 errors.
- [ ] No product code (`packages/**`) modified; `git diff --stat` shows only test-harness/test files.

## Key References

| Resource | Path / Command |
|----------|---------------|
| Harness (pool, withTxTimeout, seed) | `apps/server/src/tests/helpers/integration-setup.ts` |
| Per-file isolated runner | `apps/server/scripts/run-integration-isolated.ts` |
| Preload (provision + seed) | `apps/server/src/tests/preload.ts` |
| The holdout test | `apps/server/src/tests/integration/promotions.integration.test.ts` |
| Diagnosis history | `~/.claude/projects/C--Project-Avantej/memory/feedback_integration_harness_blocked.md` |
| Run one file (provisions own branch) | `ISOLATED_TEST_DB=true bun test src/tests/integration/<file>` |
| Run full isolated suite | `bun run test:integration:isolated` |
| Type-check | `bun run check-types` (from `apps/server` or repo root) |

## Constraints

- **The wedge is JS-promise-level** — do not re-attempt server-side DB timeout tweaks (already proven useless and reverted).
- **No product-code changes** — fix the harness/tests only.
- **Don't break the 47 green files** — any shared-harness change must be re-validated across the full isolated run, not just `promotions`.
- **Credentials/cost:** each `ISOLATED_TEST_DB=true` file run provisions a fresh Neon branch (~94s migrations). Prefer one shared branch for multi-file checks. Diag branches are named `diag-*`/`itest-*` — clean up leaked branches (`cleanup-test-branches.ts` sweeps `itest-*` only).
- **Don't leave untracked scripts across a commit** — lint-staged's stash drops them (this bit twice). If you add a helper script, either commit it or delete it before committing other work.
- Keep `skipIf(shouldSkipIntegration())` gating intact so default `bun run test` stays skipped.

## Agent Recommendation

**Suggested agent:** `backend-engineer`
**Why:** This is a Node/Bun + `pg` + drizzle transaction-lifecycle and test-runner-process problem — squarely backend/runtime infrastructure, no UI involved.
