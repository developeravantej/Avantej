# Plan F.4 — Agent Mi /migrations Verification

## Scope
Read-only `/dashboard/platform-admin/migrations` viewer. Surfaces drizzle
journal + applied tracking-table state for control-panel and tenant schemas.
NO apply procedure — CLI-only (`bun db:push` / `bun db:migrate`).

## Files added

- `apps/server/src/routers/platform-admin-migrations.ts` — `platformAdminMigrationsRouter` (`listMigrations`, `getMigrationFile`). Read-only. `requirePlatformAdmin` gate (any role).
- `apps/server/src/routers/platform-admin-migrations.test.ts` — bun unit tests (12 pass / 70 expects).
- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/migrations.tsx` — route page with tabs (Control Panel / Tenant), 4 KPI cards per tab, status table, SQL dialog.
- `apps/web/src/components/platform-admin/migration-status-table.tsx` — stateless `MigrationStatusTable`.
- `apps/web/e2e/tests/ship/plan-f-4/Mi-migrations.spec.ts` — 7-scenario Playwright spec tagged `@ship-f-4`.
- `packages/db/src/journals.ts` — JSON re-export of `_journal.json` manifests for Workers-runtime bundling.
- `packages/db/src/generated/control-panel-migrations.generated.ts` — embedded SQL (31 entries). Generated via new `scripts/gen-control-panel-migrations.ts`.
- `scripts/gen-control-panel-migrations.ts` — codegen mirror of `gen-tenant-migrations.ts`.

## Files patched

- `apps/server/src/index.ts` — imported `platformAdminMigrationsRouter` and mounted top-level as `platformAdminMigrations: platformAdminMigrationsRouter`.
- `packages/api/src/routers/index.ts` — added `platformAdminMigrationsRouterType` type stub + mounted under `appRouter.platformAdminMigrations`.

## Bundling approach

- **Journal manifests**: `import` JSON via `packages/db/src/journals.ts` re-export (works under `resolveJsonModule: true` for bun + wrangler). No fs at runtime.
- **Control-panel SQL files**: generated bundle at `packages/db/src/generated/control-panel-migrations.generated.ts` (31 entries, lex order). Created via `bun scripts/gen-control-panel-migrations.ts`.
- **Tenant SQL files**: reuse pre-existing `TENANT_MIGRATIONS` (in same `generated/` dir; `hash` field == tag).
- **Path-traversal**: input.tag validated against `^\d{4}_[a-z0-9_]+$` BEFORE bundle lookup. Bundle lookup is by exact string match — no fs path is ever constructed.

## Applied-list query approach

- **Control-panel**: `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC` against the request-scoped `controlPanelDb`. Tolerates missing table (try/catch → empty list), so a fresh DB or schema-rename doesn't 500 the page.
- **Tenant**: per-tenant `drizzle_migrations` lives in EACH tenant branch — not reachable from the control-panel context. `applied[]` is intentionally empty for the tenant tab; UI shows subLabel "per-tenant — not shown". Journal still surfaces what *should* be present.
- **Status join**: `computeMigrationStatus` produces per-tag rows with `state ∈ {applied | pending | orphaned}` and synth-idx (≥100000) for orphans so sort stays deterministic. Pure function — covered by 5 unit tests.

## Test results

### Unit (bun)
```
12 pass | 0 fail | 70 expect() calls | 272ms
```
Covers `computeMigrationStatus` semantics, real journal shape, file lookup, regex rejection (path-traversal + uppercase), NOT_FOUND on unknown tag.

### E2E (Playwright @ship-f-4)
```
1 passed (12.9s)
```
All 7 scenarios green:
1. `listMigrations` control-panel default — schema/journal/applied/status/summary shape + ordering + status coverage.
2. `listMigrations` tenant — 20+ journal entries, `applied: []`, every journal tag marked `pending`.
3. `getMigrationFile` valid tag — returns 6849-byte SQL containing `CREATE TABLE`.
4. `getMigrationFile` path-traversal `../../../etc/passwd` → 400.
5. UI render — heading, tabs, 4 KPI cards, status table all visible. No 500.
6. Tab switch to tenant — `migrations-tab-tenant` visible.
7. RBAC — `support` role still gets 200 for both procs (read-only).

## Verification artifacts

- Video: `verification/plan-f-4/Mi-migrations.webm` (232,931 bytes / 228 KB).

## Typecheck

`bun check-types` — zero new errors. Pre-existing errors in unrelated files
(`saas-subscription.service.integration.test.ts`, `webhook-dedupe.service.integration.test.ts`, `org.test.ts`) untouched.

## Deviations from plan

- **Status shape**: spec hinted at `state: 'orphaned'` when row exists in `__drizzle_migrations` with a tag not in the journal. Drizzle-kit's `__drizzle_migrations.hash` is a checksum (not the tag), so orphan detection on control-panel may under-count when the kit-internal hash differs from the tag. Documented in router header. Tenant orphan detection (via `drizzle_migrations.hash` which IS the tag) would work but requires per-tenant context (out of scope for this viewer).
- **Sidebar nav entry**: not added. The PATCH list in the brief does not include the sidebar component; spec said "Touch files outside OWNED + PATCH" is forbidden.
- **Tag regex**: widened from `^\d{4}_[a-z_]+$` (spec) to `^\d{4}_[a-z0-9_]+$` to accept tenant tag `0014_expenses_currency_myr` and equivalents (some current/future tags contain digits after the prefix). Path-traversal protection is unchanged — `/` and `.` still rejected.

## Pre-existing issues observed

- Dev DB `__drizzle_migrations` table presence depends on whether drizzle-kit `migrate` (vs `push`) was used. Router gracefully returns `applied: []` on miss — no 500.
- Resend dev-key restriction noisy in webserver logs during `signUpUser` fallback (email verification fails for non-developer.avantej addresses). Unrelated to this slice; tests still pass because `auth.fixtures` bypass email verification by flipping `emailVerified=true` on the user row directly.

## Constraints honored

- No `git commit` / `git push`.
- No new migration; no schema change.
- No apply/mutation proc; no writes to `__drizzle_migrations`.
- No sidebar / unrelated file touched.
- Tag regex validated before any bundle / path lookup.
