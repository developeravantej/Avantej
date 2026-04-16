# Tenant Migration Workflow

This project uses **database-per-tenant isolation** (Neon PostgreSQL branches). Schema changes must be applied to every tenant database individually. Drizzle Kit generates the SQL, but migrations are embedded in TypeScript and run programmatically — Cloudflare Workers can't read migration files from disk at runtime.

## Overview

```
Schema change → Generate SQL → Embed in migrate-tenant.ts → Apply to tenant DBs
```

Key files:

| File | Purpose |
|---|---|
| `packages/db/src/schema/tenant/*.ts` | Tenant schema definitions (Drizzle ORM) |
| `packages/db/drizzle.tenant.config.ts` | Drizzle Kit config for tenant migration generation |
| `packages/db/src/migrations/tenant/` | Generated migration SQL files (reference only) |
| `packages/db/src/migrate-tenant.ts` | Runtime migration runner with embedded SQL + `TENANT_MIGRATIONS` array |
| `apps/server/scripts/migrate-all-tenants.ts` | Apply migrations to all (or filtered) tenants |
| `apps/server/scripts/migrate-existing-tenant.ts` | Apply migrations to a single tenant |

## Step-by-Step

### 1. Update the tenant schema

Edit or create files under `packages/db/src/schema/tenant/`.

```typescript
// Example: packages/db/src/schema/tenant/services.ts
bufferTimeMinutes: integer("buffer_time_minutes").default(0).notNull(),
```

### 2. Generate the migration SQL

```bash
cd packages/db
bunx drizzle-kit generate --config=drizzle.tenant.config.ts
```

This produces a numbered SQL file in `src/migrations/tenant/`, e.g. `0010_empty_marvel_boy.sql`.

### 3. Embed the migration in `migrate-tenant.ts`

Open `packages/db/src/migrate-tenant.ts` and do two things:

**a) Add a new constant** with the SQL content (above the `TENANT_MIGRATIONS` array):

```typescript
const MIGRATION_0010_EMPTY_MARVEL_BOY = `
ALTER TABLE "services" ADD COLUMN "buffer_time_minutes" integer DEFAULT 0 NOT NULL;
`;
```

**b) Add an entry** to the `TENANT_MIGRATIONS` array at the end:

```typescript
const TENANT_MIGRATIONS = [
  // ... existing entries ...
  {
    hash: "0010_empty_marvel_boy",
    sql: MIGRATION_0010_EMPTY_MARVEL_BOY,
  },
] as const;
```

The `hash` must match the generated filename (without `.sql`). The `LATEST_MIGRATION_VERSION` export auto-derives from the last array entry.

### 4. Apply to tenant databases

All commands run from `apps/server`.

#### Dry run (always do this first)

Lists all tenants and shows which ones need migration:

```bash
cd apps/server
bun run scripts/migrate-all-tenants.ts --dry-run
```

#### Single tenant

By slug or UUID:

```bash
# Using migrate-existing-tenant (slug or UUID)
bun run scripts/migrate-existing-tenant.ts <org-slug-or-id>

# Using migrate-all-tenants with filter
bun run scripts/migrate-all-tenants.ts --filter=<slug> --concurrency=1
```

#### All tenants

```bash
bun run scripts/migrate-all-tenants.ts --concurrency=5
```

## CLI Options (`migrate-all-tenants.ts`)

| Flag | Default | Description |
|---|---|---|
| `--dry-run` | false | List tenants and versions without migrating |
| `--concurrency=N` | 5 | Number of tenants to migrate in parallel |
| `--filter=slug` | none | Only migrate tenants whose slug contains this string |

## How the runtime runner works

`runTenantMigrations(connectionString)` in `migrate-tenant.ts`:

1. Connects to the tenant database
2. Creates a `__drizzle_migrations` tracking table if it doesn't exist
3. Iterates through `TENANT_MIGRATIONS` in order
4. Skips migrations already recorded in the tracking table
5. Executes new migrations and records their hash
6. Returns the final migration version

After migrations, `seedRBACData(tenantDb)` is called to ensure default roles and permissions exist (idempotent).

The control panel's `organizations.schemaVersion` column is updated to track each tenant's current version.

## Why migrations are embedded (not file-based)

The migration runner executes inside Cloudflare Workers during tenant provisioning. Workers don't have filesystem access, so all migration SQL must be available as string constants in the bundle. The generated `.sql` files in `src/migrations/tenant/` serve as a reference and for Drizzle Kit's internal state tracking — they are not read at runtime.

## Conventions

- Migration constants: `MIGRATION_NNNN_SNAKE_CASE_NAME` (uppercase version of the generated filename)
- Hashes: exact generated filename without `.sql` extension
- Migrations are append-only — never modify an existing migration that has been applied to any tenant
- Always dry-run before applying to production tenants
- Use `--concurrency=1` for the first run of a new migration as a safety measure
