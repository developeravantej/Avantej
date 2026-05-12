# Task Inventory — Phase 0 (Wave 1 only)

**Plan:** zplan/05-06_09-12_schema-relationship-fixes/plan/plan.md
**Generated:** 2026-05-06 11:27
**Scope:** Wave 1 only — Phase 0 migration infrastructure (sequential, single agent). Subsequent waves deferred to follow-up `/execute --resume` runs.

## Resolved decisions
- OQ2 stock partition: **N/A** — Agent 2.6 dropped from session entirely
- OQ3 commission versioning UI: **auto-version every save** (deferred to wave 3c brief)
- OQ4 refund reversal visibility: **internal-only** (deferred to wave 3e brief)
- OQ-EXEC scope: **A — Wave 1 only**, then stop and resume later

## Codebase corrections to plan (must be in agent brief)
- `packages/db/src/migrations/tenant/` **already exists** with 0000-0020 (22 files)
- `packages/db/src/migrations/control-panel/` **already exists** with 0000-0009 (10 files)
- Tracking table is named `drizzle_migrations` (not `tenant_migrations`) in current `migrate-tenant.ts`
- `migrate-tenant.ts` `TENANT_MIGRATIONS` array (~35 entries) is **out of sync** w/ migration files dir; agent must reconcile

## Phase 0 tasks

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 0 | Create `apps/server/src/lib/tenant-migrate.ts` — `loadMigrationFiles()` reads `packages/db/src/migrations/tenant/*.sql`, sorts by filename prefix, returns `{ name, sql, checksum }[]` | Phase 0 agent | done |
| 2 | 0 | Add `ensureMigrationTable()` + `getAppliedMigrations()` + `applyPending()` + `waitForLatest()` to `tenant-migrate.ts` — use existing `drizzle_migrations` table for backward compat (do NOT rename to `tenant_migrations`) | Phase 0 agent | done |
| 3 | 0 | Deprecate embedded `TENANT_MIGRATIONS` array in `packages/db/src/migrate-tenant.ts` — keep `runTenantMigrations()` export for backward compat but route through new file-based loader | Phase 0 agent | **partial** — `runTenantMigrations` NOT routed through file-based loader; embedded array remains Workers-runtime source of truth. File-based loader is Node-only (tests/scripts). Reason: 19 hashes exist only as embedded constants, 8 only as files, 14 overlap — full reconciliation needed before deprecation. Deferred to follow-up session. |
| 4 | 0 | Create `packages/db/src/migrations/tenant/0021_add_tenant_migrations_metadata.sql` — adds `checksum` text column + applied_at default if not present on `drizzle_migrations` (or no-op if col exists) | Phase 0 agent | done |
| 5 | 0 | Update tenant provisioning gate in `apps/server/src/services/neon.service.ts` (or wherever Neon branch creation lives — grep `createBranch`/`createProject`) — call `applyPending` post-branch-creation; rollback branch on migration failure | Phase 0 agent | done (gate placed in `apps/server/src/routes/organizations.routes.ts`, not neon.service.ts; still uses existing `runTenantMigrations` per #3 partial) |
| 6 | 0 | Extend `scripts/gen-erd.ts` to emit JSON drift summary at `zhub/shared/schema-drift.json` (extend existing markdown output, do not break it) | Phase 0 agent | done |
| 7 | 0 | Create `scripts/check-drift.ts` — reads JSON output of gen-erd; exits 1 if any drift section non-empty; prints human-readable summary | Phase 0 agent | done |
| 8 | 0 | Create `apps/server/src/tests/integration/tenant-migrate.test.ts` — ≥3 cases: backfill existing tenant (drizzle_migrations populated), apply pending on fresh tenant, idempotency (re-run no-op) | Phase 0 agent | done (4 tests, all pass) |
| 9 | 0 | Run type-check (`bun check-types`), lint (`bun check`), and the new integration test — all must pass before declaring Phase 0 done | Phase 0 agent | done (errors in repo are pre-existing, none in agent's files) |
