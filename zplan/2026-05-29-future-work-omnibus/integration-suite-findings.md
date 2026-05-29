# Integration Suite — Findings & Fixes (2026-05-29)

Investigation of "the integration suite has a bug." Three distinct issues found; two fixed, one diagnosed + tracked.

## Bug #1 — Full suite hangs (FIXED ✓, commit `da0d7c83`)
**Symptom:** `bun test src/tests/integration/` ran with no output then had to be killed ("attempted twice, killed both times" in the summaries).
**Root cause:** `createTenantDb`/`createControlPanelDb` opened a fresh Neon WebSocket pool per call and never closed it. Across the ~45-file suite the un-closed pools exhausted the Neon branch's connection cap mid-run; the next connection blocked forever. Single files / small batches stayed under the cap, so they passed — masking it.
**Fix:** memoise one shared pool per connection URL for the whole process + `closeAllTestPools()` drained by a global `afterAll` in `src/tests/preload.ts` (wired via `apps/server/bunfig.toml`). Also renamed 29 `*.test.ts` → `*.integration.test.ts` so the `test:integration` glob matches them, and fixed two script paths the rename broke.
**Proof:** 3-file batch + the 40-file healthy subset run to completion and exit on their own.

## Feature — Per-run DB isolation (DONE ✓, commit `670dd8cc`)
**Why:** these tests run against the shared *live* dev DB, so a dev server or concurrent session causes lock/fixture flakiness.
**What:** `ISOLATED_TEST_DB=true` provisions a copy-on-write Neon branch of the tenant project in the preload (inherits full schema + data — no migrate/seed), points `TENANT_DATABASE_URL` at it before any test loads, deletes it in the global `afterAll`. `cleanup:test-branches` sweeps orphans from killed runs.
**Scope:** tenant project only (v1). Control-panel is read-mostly in the suite (only `auth-email`/`org` write, each self-cleaning) and lives in a Neon account `NEON_API_KEY` can't reach — control-panel isolation is a documented follow-up.
**Proof:** branch provisioned + URL propagated + torn down across runs; bun awaits the preload's top-level await.

## Bug #2 — Per-test deterministic hangs (DIAGNOSED, NOT fixed — follow-up)
**Affected (known):** `branch-invite` (`getInviteContext > throws GONE`), `membership-holds` (`(b) resume...`), and per the summaries `refund-target-priority`. Each hangs the test to Bun's 30s timeout, then `afterAll`/pool teardown wedges → process exits 124.

**Proven NOT the cause:**
- Not contention — hangs **solo + isolated** (private branch, zero concurrent access).
- Not my pool-sharing change — hangs as the only file (no cross-file cascade); and within a single file it was always one pool anyway.
- Not the product code — a **standalone repro of the branch-invite GONE path** ran `createBranchInvite` ✓ / `revokeBranchInvite` ✓ / `validateBranchInvite` ✓ / `getInviteContext` → threw `GONE` in **1.4s** (correct). The code is fine.

**Actual mechanism (high confidence): pool-client exhaustion from a leaked transaction.**
- The hang hits Bun's **30s test timeout, not the 20s `statement_timeout`** → the query never executes server-side; the test is stuck **waiting for a free pool client**.
- A pg-style pool (neon-serverless) has **no acquire timeout** — if an earlier test in the file leaks a checked-out client (a transaction that never `COMMIT`/`ROLLBACK`/releases, e.g. inside `freezeMembership`/`resumeMembership` or a redeem path), later tests queue forever.
- This is why `statement_timeout` + `connectionTimeoutMillis` (added in `8d4e2c67`) don't help — neither covers a pool-queue wait.

**Suggested fix (own session, ~0.5–1 day):**
1. Audit `membership.service.ts` (`freezeMembership`/`resumeMembership`) and `branch-invite`/`onboarding` for a `tenantDb.transaction(...)` (or `pool.connect()`) path that can return/throw without releasing the client — especially error branches. Ensure every transaction releases in a `finally`.
2. Add an **acquire timeout** wrapper around pool checkout in the test helper (race `pool.connect()`/first query against a timeout) so a leak fails fast with a clear error instead of hanging.
3. Re-run each previously-hanging file solo + isolated → must exit on its own.

**Interim:** exclude `branch-invite`, `membership-holds`, `refund-target-priority`, `auth-email` (last is real-Resend-dependent) from the gating suite, or `.skip` the specific hanging tests with a comment pointing here.

## Current branch
`fix/integration-suite-hang` — commits: `da0d7c83` (pool fix + renames), `670dd8cc` (isolation), `43bfef79` (script fixes + cleanup), `8d4e2c67` (pool timeouts). Type-check/oxlint green (lint-staged passed on each commit).
