# Integration Test DB Isolation — Implementation Plan

**Created:** 2026-05-29
**Parent:** `plan.md` (Phase 0 follow-up)
**Goal:** Give each integration-suite run its own isolated database so a running dev server or a concurrent session can never cause flaky lock/fixture failures. This is the architectural fix behind "bug #2" (the `branch-invite` / `membership-holds` 30s lock-wait timeouts), which is contention, not logic.

---

## Context (what we found)

- Integration tests read `TENANT_DATABASE_URL` + `DATABASE_URL` from `apps/server/.dev.vars` via `loadDevVars()`. Both point at the **shared live dev Neon DBs** (tenant + control-panel are *separate* Neon projects).
- `loadDevVars()` only sets a key `if (!process.env[key])` — so **pre-setting `process.env` wins**. This is the override seam we'll use.
- The pool-leak hang (bug #1) is already fixed + committed (`da0d7c83`): one shared pool per URL + `closeAllTestPools` teardown wired via `apps/server/bunfig.toml` → `src/tests/preload.ts`.
- Existing primitives: `neon.service.ts` has `createTenantProject()` / `deleteTenantProject()` (whole **projects**, empty, slow — needs migration+seed, and there is **no programmatic control-panel migrator**). `runFileMigrations(connStr)` applies tenant migrations. `cleanup-test-projects.ts` deletes `tenant-test-*` projects.

## Chosen approach: per-run Neon **branch** (copy-on-write), gated behind a flag

Branch (not new project) is the right primitive:
- A Neon branch is an instant CoW clone of a parent branch → **inherits full schema + all seed data** (org `996febce…`, hierarchy node `aaaaaaaa…`, members, control-panel orgs/subscriptions). **No migration run, no seeding needed.**
- Branch both the **tenant** project and the **control-panel** project, point the two env vars at the branch endpoints, run tests, delete both branches at the end.
- Sidesteps the two gaps the Explore surfaced: the missing control-panel migrator and the absent central seed — because branching copies existing state instead of rebuilding it.

**Gating:** only provision when `ISOLATED_TEST_DB=true`. Without the flag, behaviour is unchanged (shared dev DB) so single-file TDD iteration stays fast. CI sets the flag.

### Alternatives rejected
- **New empty project (`createTenantProject`)** — slow (project provisioning + poll), and requires a control-panel migrator + full seed that don't exist. Branch avoids all of it.
- **Schema-per-run / search_path** — doesn't isolate the control-panel project; brittle with cross-DB code.
- **Per-test transaction rollback** — service layer opens its own transactions; Neon serverless pooling makes this unreliable.
- **Data-namespacing by run-id** — reduces fixture collisions but does NOT remove row-lock contention; partial fix only.

---

## Implementation steps

### 1. Branch helper — `apps/server/src/services/neon-branch.service.ts` (new)
Thin Neon REST wrapper (uses `NEON_API_KEY`):
- `createBranch(projectId, { name, parentBranchId? }): Promise<{ branchId: string; connectionUri: string }>`
  - `POST /api/v2/projects/{projectId}/branches` with body `{ branch: { name }, endpoints: [{ type: "read_write" }] }`.
  - Read `connection_uris[0].connection_uri` from the response (request `?include_connection_uris` or fetch endpoint). Poll until the endpoint is `active` if needed.
- `deleteBranch(projectId, branchId): Promise<void>` — `DELETE /api/v2/projects/{projectId}/branches/{branchId}`.
- `listTestBranches(projectId)` — for orphan cleanup (filter by `name LIKE 'itest-%'`).

### 2. Required config (add to `.dev.vars` + CI secrets)
- `NEON_API_KEY` (already used by neon.service).
- `TENANT_NEON_PROJECT_ID`, `CONTROL_PANEL_NEON_PROJECT_ID` — the two parent project IDs. (Derive once via `GET /api/v2/projects` or read from the Neon dashboard; document in the plan.)
- Optional `TENANT_NEON_PARENT_BRANCH_ID` / control-panel equivalent (default = each project's default branch).

### 3. Provision in preload — `apps/server/src/tests/preload.ts` (extend)
Top-level await (preload completes before any test file loads):
```
if (process.env.ISOLATED_TEST_DB === "true") {
  loadDevVars();                       // get NEON_API_KEY + project ids
  const runId = process.env.TEST_RUN_ID ?? `${process.pid}-${process.env.GITHUB_RUN_ID ?? "local"}`;
  const t = await createBranch(TENANT_PROJECT_ID,  { name: `itest-tenant-${runId}` });
  const c = await createBranch(CONTROL_PANEL_PROJECT_ID, { name: `itest-cp-${runId}` });
  process.env.TENANT_DATABASE_URL = t.connectionUri;   // set BEFORE tests → loadDevVars won't override
  process.env.DATABASE_URL        = c.connectionUri;
  // stash ids for teardown
  globalThis.__ITEST_BRANCHES__ = [[TENANT_PROJECT_ID, t.branchId], [CONTROL_PANEL_PROJECT_ID, c.branchId]];
}
```
- **Note on run-id:** preload is a plain script (not a Workflow), so `Date.now()`/`process.pid` are available — no restriction here. Prefer CI's run id when present for traceability.
- Register global `afterAll`: first `await closeAllTestPools()` (existing), then delete both branches (best-effort, swallow errors so a delete failure doesn't fail the run — orphans are swept by step 5).

### 4. `integration-setup.ts` — no logic change needed
It already reads `process.env.TENANT_DATABASE_URL` / `DATABASE_URL`, which preload now overrides. Confirm `loadDevVars()` calls inside `shouldSkipIntegration()` don't clobber the branch URLs (they won't — `if (!process.env[key])`). Add a one-line comment documenting the precedence.

### 5. Orphan cleanup — extend `apps/server/scripts/cleanup-test-projects.ts`
Add `itest-*` branch sweeping (delete branches older than N hours) for both projects, so a killed run that skipped teardown doesn't leak branches. Wire into a CI nightly + a `bun run cleanup:test-branches` script.

### 6. CI wiring (`.github/workflows/ci.yml`)
- Add `ISOLATED_TEST_DB=true`, `NEON_API_KEY`, the two project ids as CI env/secrets.
- Run `bun test:integration` (now matches all 45 files post-rename).
- Ensure teardown runs even on failure (the global `afterAll` + a CI `always()` cleanup step calling `cleanup:test-branches`).

### 7. Make bug #2 deterministic (bonus, now that contention is gone)
Under isolation, `branch-invite` / `membership-holds` lock timeouts should vanish. Re-run them in isolation to confirm; if any genuinely-logic hang remains, fix it then (was previously masked by contention).

---

## Verification (acceptance)
1. `ISOLATED_TEST_DB=true bun test:integration` provisions 2 branches, runs all 45 files, **exits on its own**, and deletes both branches (verify via `GET /branches` → no `itest-*` left).
2. **Concurrency proof:** run two full suites simultaneously (`TEST_RUN_ID=a` and `=b`) → both green, zero lock-wait timeouts. This is the contention fix demonstrated.
3. Without the flag, behaviour identical to today (shared dev DB, fast single-file runs).
4. A killed run leaves at most 2 orphan branches; `bun run cleanup:test-branches` removes them.

## Risks / open items
- **Neon plan branch limit** — confirm the account's max branch count covers parallel CI runs; bump or queue if tight.
- **Branch endpoint cold-start** — first connection to a fresh branch may be slow; `createBranch` should poll endpoint `active` before returning the URI.
- **Connection-string shape** — confirm the branch `connection_uri` includes the role/password and `?sslmode=require` the Neon serverless driver needs.
- **Two-project assumption** — verify tenant and control-panel really are distinct Neon projects in this account (derive both project ids first).
- **Cost** — CoW branches are cheap but not free; the nightly sweep + per-run teardown keep it bounded.

## Effort
~1.5–2 days: branch helper + preload provisioning (~0.5d), cleanup script + CI wiring (~0.5d), verification incl. concurrency proof + bug-#2 recheck (~0.5d), buffer for Neon API/connection-string quirks.
