# Schema Change Workflow

Authoritative checklist for any change that adds, modifies, or removes a column, table, index, or foreign key in either the tenant or the control-panel database.

CI enforces this workflow via `.github/workflows/drift-check.yml` — PRs that touch `packages/db/`, `packages/services/`, `apps/server/src/`, or the drift scripts are blocked unless `bun verify:migrations` and `bun scripts/check-drift.ts` both pass.

## 1. Update the Drizzle schema

- Tenant schema: `packages/db/src/schema/tenant/`
- Control-panel schema: `packages/db/src/schema/control-panel/`

Keep cross-DB references as plain `text` columns — never an FK constraint across databases.

## 2. Generate the migration

### Tenant migrations (file-based, source of truth)

Tenant migrations are bundled into the Worker at build time via a generated TypeScript module. The pipeline is:

```
packages/db/src/migrations/tenant/NNNN_description.sql
        ↓ bun gen:migrations
packages/db/src/generated/tenant-migrations.generated.ts
        ↓ runTenantMigrations() at request time
live tenant DB
```

To add a tenant migration:

1. Drop a new file at `packages/db/src/migrations/tenant/NNNN_description.sql`. The `NNNN` prefix must lex-sort after the latest existing migration. Use idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object THEN null; END $$;`) so the migration is safe to re-run on tenants that already received it manually.
2. Run `bun gen:migrations` — regenerates `packages/db/src/generated/tenant-migrations.generated.ts`. **Commit BOTH the new SQL file and the regenerated TS module in the same PR.**
3. Run `bun verify:migrations` — confirms the generated module matches the SQL files on disk.
4. From `apps/server`, run `bun test src/tests/integration/tenant-migrate.test.ts` against a scratch tenant DB to verify it applies cleanly.

For the broader rollout procedure (applying a new migration to existing production tenants), see [`TENANT_MIGRATION_WORKFLOW.md`](./TENANT_MIGRATION_WORKFLOW.md).

### Control-panel migrations

Standard Drizzle Kit flow:

```bash
bun db:generate    # produces packages/db/src/migrations/control-panel/*.sql
bun db:migrate     # applies via drizzle-kit, control-panel config
```

## 3. Verify drift locally

```bash
bun scripts/gen-erd.ts        # regenerates zhub/shared/schema-erd-auto.md
                              # and zhub/shared/schema-drift.json
bun scripts/check-drift.ts    # exits 1 if any drift section is non-empty
```

Drift sections that block the PR:

- **missing_in_live** — schema declares an FK that the live DB lacks
- **extra_in_live** — live DB has an FK that the schema does not declare
- **action_mismatches** — `ON DELETE` / `ON UPDATE` clauses differ
- **orphan_tables** — table exists in schema but not live
- **missing_tables** — table exists live but not in schema

If you intentionally need a drift to land (e.g. dropping a deprecated FK), update both schema and live DB in the same PR; the report should come back clean.

## 4. Add tests

Cover new schema with an integration test in `apps/server/src/tests/integration/`. Use the SKIP-pattern so it no-ops when no test DB is configured:

```typescript
import { loadDevVars, shouldSkipIntegration } from "../helpers/integration-setup";

loadDevVars();
const SKIP = shouldSkipIntegration() || !process.env.TENANT_DATABASE_URL;
```

## Common pitfalls

- **Never use `bun db:push` for tenant schema changes.** Production tenants are diverged from `db:push` output. File-based migrations only.
- **`DEFERRABLE INITIALLY DEFERRED` requires raw SQL.** The Drizzle generator cannot emit it; hand-write the FK constraint when you need it (typical for cycle FKs between tables that reference each other).
- **Migrations apply at request time** via `runTenantMigrations()` running inside the Cloudflare Worker. The Worker cannot read files at runtime, which is why every migration ships through `tenant-migrations.generated.ts`. If you forget to regenerate that module, the migration will not be applied — `bun verify:migrations` exists to catch this.
- **Cross-DB FKs are illegal.** Control-panel `users.id` referenced from tenant tables is stored as `text`, never as a foreign key.
