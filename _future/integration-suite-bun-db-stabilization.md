# Integration Suite — bun:test × DB stabilization + remaining fixture fixes

Branch: `fix/integration-suite-hang` (committed, unpushed). Full diagnosis in
`zplan/2026-05-29-future-work-omnibus/integration-suite-findings.md` +
`integration-failures-triage.md`.

## Problem

The `apps/server` integration suite (`src/tests/integration/*.integration.test.ts`,
~46 files, real Neon DB) historically **hung forever and never completed**, so it
had never produced a full pass/fail baseline. Root causes were fixed this session
(see "Done"), and the suite now **runs to completion** via a per-file isolated
runner — but a tail of failures remains.

## Done (already committed on `fix/integration-suite-hang`)

- **Global hang** — `createTenantDb`/`createControlPanelDb` leaked a Neon pool per
  call → connection-cap exhaustion. Now a process-shared pool + `closeAllTestPools`.
- **DB isolation** — opt-in per-run Neon copy-on-write branch (`ISOLATED_TEST_DB=true`)
  with `runTenantMigrations` applied (parent project lags migrations), + orphan
  sweep (`bun run cleanup:test-branches`).
- **Driver** — migrated the test connection from `@neondatabase/serverless` to
  `node-postgres` (`pg`) over TCP (both neon transports misbehave under bun:test).
- **Per-file isolated runner** — `bun run test:integration:isolated`
  (`scripts/run-integration-isolated.ts`): each file in its own bun process with a
  hard per-file timeout, sharing one migrated branch. A wedged file is killed and
  the runner moves on, so the suite ALWAYS completes with per-file results.
- **Fixture fixes** — `slug` on hierarchy_nodes seeds (5 files), schema-drift via
  branch migrations, and the `commission_tier_rates`-before-`trainer_tiers` FK
  cleanup order (staff-id-convention + 4 commission files). Files moved to green:
  announcements, expenses, members-deactivate, staff-id-convention,
  commission-calculator.
- 29 file renames to `*.integration.test.ts` + fixed `test:integration` glob;
  documented the stale-`dist/` double-run gotcha (always use `.ts`-anchored runs).

Baseline (per-file isolated runner): improving from **29 pass / 11 fail / 6 timeout**
(of 46) — re-run `bun run test:integration:isolated` for the current count.

## Why deferred

The remaining items split into three classes, two of which need real investigation
or an infra change rather than mechanical fixes.

### 1. Deep `bun:test × Drizzle/DB` wedge (6 timeout files) — the hard one
`audit-prove-fixes`, `branch-invite`, `expenses` (a sub-test), `org`, `promotions`,
`purchase-orders`, plus the throw-in-transaction tests in `refund-items` /
`membership-holds`. A query/transaction-rollback promise never settles under bun's
test runner — proven driver-independent (ws, fetch, AND pg all show it) and NOT a
product bug (the same calls run in ~1s in a plain Bun script). No transport choice
or server-side timeout (statement/lock/idle) fixes a never-settling JS promise; the
15s tx-timeout race only converts the wedge into a fast failure.
- **Proper fix:** run the DB-touching integration suite under **Node (vitest/node test)**
  instead of bun:test — sidesteps the bun-runtime wedge entirely.
- **Interim:** the per-file runner already contains the cascade; CI can gate on it
  treating the wedge files as a known quarantine list.

### 2. Commission-domain test failures (3) — likely stale tests vs refactored engine
- `appointment-commission` TC-AC-003: a duplicate `commission_splits_appt_staff_unique`
  insert raises a raw error the test doesn't wrap — decide whether the guard should
  reject gracefully or the test should assert the rejection.
- `commission-rule` TC-CR-I005: an update sets `sales_order_id` on an appointment-split,
  violating the `commission_splits_must_target_one` XOR — the test's update path needs
  to respect the XOR (the engine changed under it).
- `pos-commission` TC-POS-001: calculator returns 0 splits (config/fixture/staffId
  convention) — verify the POS commission path against current engine behaviour.

### 3. Mechanical fixture work (still real effort)
- `goods-receipts` / `promotions` / `purchase-orders`: use string IDs in `uuid`
  columns AND `purchase_orders.supplier_id` is a real FK (`onDelete: restrict`) — need
  to **create supplier + branch fixture rows**, then reference their ids (not just a
  string→uuid swap).
- `commission-versioning`: version row not created (`getLatestConfigVersionForCategory`
  returns null) — confirm the versioning trigger/migration is present on the branch and
  fires on `upsertCategoryCommissionConfig`.
- `auth-email`: depends on live Resend delivery — move out of the gating suite or mock.
- `tenant-migrate`: investigate the per-file-runner failure (passed standalone earlier).

## Out of scope
- Rewriting the production DB layer (the Worker correctly uses `@neondatabase/serverless`;
  only the *test* connection moved to `pg`).
- The unit/web test suites (unaffected).

## Acceptance criteria
- [ ] `bun run test:integration:isolated` completes with **0 timeout files** (wedge class resolved, e.g. via the Node runner) — or the quarantine list is explicit + CI-gated.
- [ ] Commission-domain tests (TC-AC-003 / TC-CR-I005 / TC-POS-001) pass or are corrected to match the current engine, with the decision recorded.
- [ ] goods-receipts / promotions / purchase-orders create real supplier+branch fixtures and pass.
- [ ] commission-versioning version-trigger confirmed; test passes.
- [ ] auth-email gated/mocked; tenant-migrate green under the runner.
- [ ] A documented, repeatable "green" command for CI.
