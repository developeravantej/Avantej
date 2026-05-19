# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

```bash
# Development
bun install                    # Install dependencies
bun dev                        # Start all apps (web:3001, server:3000)
bun dev:web                    # Web only
bun dev:server                 # Server only
bun dev:native                 # Expo / React Native

# Database — control-panel only via these scripts (see Tenant Migrations below for tenant DBs)
bun db:push                    # Push control-panel schema (dev only, never tenant)
bun db:studio                  # Open Drizzle Studio
bun db:generate                # Generate control-panel migration
bun db:migrate                 # Apply control-panel migrations

# Tenant migrations (file-based, embedded in Worker bundle)
bun gen:migrations             # Regenerate packages/db/src/generated/tenant-migrations.generated.ts
bun verify:migrations          # Confirm generated module matches SQL files (CI-gated)

# Quality
bun check                      # oxlint (NOT Biome — Biome handles formatting only)
bun check-types                # tsc -b across the monorepo

# Server tests (Bun test, from apps/server)
cd apps/server
bun test                       # All server tests
bun test:unit                  # Excludes *.integration.test.ts
bun test:integration           # Only *.integration.test.ts
bun test src/path/to/file.test.ts  # Single test file

# Web tests (Vitest, from apps/web)
cd apps/web
bun test                       # vitest run
bun test:watch                 # vitest

# E2E (Playwright, from repo root)
bunx playwright test           # All e2e specs in ./e2e
bunx playwright test e2e/<file>.spec.ts  # Single spec
```

## Architecture Overview

This is a **multi-tenant SaaS platform** built as a Turborepo monorepo with three apps and five shared packages.

### Multi-Tenant Database Architecture

The platform uses **database-per-tenant isolation** via Neon PostgreSQL branches:

1. **Control Panel Database** (`controlPanelDb`): Shared database storing users, authentication, organizations metadata, and subscriptions
2. **Tenant Databases** (`tenantDb`): Isolated Neon branches per organization containing business data (members, hierarchy, services, appointments, etc.)

The `dbMiddleware` creates request-scoped connection pools for Cloudflare Workers compatibility. Tenant database connections are established by `tenant.middleware.ts` or `orpc-tenant.middleware.ts` based on the `organizationId`.

### Request Context Flow

```
Request → dbMiddleware → tenantMiddleware/orpcTenantMiddleware → createContext
                ↓                      ↓                              ↓
         controlPanelDb          tenantDb + member           session + accessibleNodeIds
```

Key context properties:

- `session`: Better-Auth session with user info
- `organizationId`: Current tenant ID
- `tenantDb`: Drizzle client for tenant database
- `member`: User's member record in the organization
- `accessibleNodeIds`: Hierarchy nodes the member can access (RBAC)

### Package Responsibilities

| Package                  | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `@avantej-core/api`      | oRPC router definitions, procedures, context creation |
| `@avantej-core/auth`     | Better-Auth configuration                             |
| `@avantej-core/db`       | Drizzle schemas (control-panel + tenant), migrations  |
| `@avantej-core/services` | Business logic (hierarchy traversal, permissions)     |
| `@avantej-core/types`    | Shared TypeScript types                               |

### API Pattern

The API uses **oRPC** for end-to-end type safety:

```typescript
// Define procedure in packages/api/src/routers/
export const myRouter = {
  myProcedure: protectedProcedure
    .input(z.object({ ... }))
    .handler(({ context, input }) => { ... })
}

// Client calls are fully typed
const result = await client.myRouter.myProcedure({ ... })
```

- `publicProcedure`: No auth required
- `protectedProcedure`: Requires authenticated session

Server-specific procedures (requiring server-only dependencies like Resend) are defined in `apps/server/src/routers/` and merged with shared routers.

### Hierarchy & RBAC

Organizations have a tree-based hierarchy (regions → districts → locations). Members are scoped to hierarchy nodes and can only access data within their scope:

```typescript
// packages/services/src/hierarchy.ts
getDescendantNodeIds(tenantDb, hierarchyScopeId); // Returns all accessible node IDs
```

### Database Schema Organization

- `packages/db/src/schema/control-panel/`: Users, organizations, subscriptions, platform admins
- `packages/db/src/schema/tenant/`: Members, roles, permissions, hierarchy, services, appointments
- `packages/db/src/schema/auth.ts`: Better-Auth tables (sessions, accounts, verification)

Cross-DB references (e.g. a tenant row that points at a control-panel user) are stored as plain `text` columns — never an FK constraint across databases. Within a tenant DB, FKs are allowed only if the target column has a unique CONSTRAINT (not just a unique INDEX).

### Tenant Migration Workflow

**Never use `bun db:push` for tenant schemas.** Tenant DBs are per-org Neon branches; the Worker can't read SQL files from disk at runtime, so migrations are bundled in.

Pipeline:

```
packages/db/src/migrations/tenant/NNNN_description.sql   ← author here
        ↓ bun gen:migrations
packages/db/src/generated/tenant-migrations.generated.ts ← committed alongside the SQL
        ↓ runTenantMigrations() at request time
live tenant DB
```

Rules:

- Write idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object …`) so re-runs on partially-migrated tenants are safe.
- Commit both the new SQL file and the regenerated `*.generated.ts` in the same PR.
- See `docs/SCHEMA_CHANGE_WORKFLOW.md` and `docs/TENANT_MIGRATION_WORKFLOW.md` for the full procedure and the production rollout script (`apps/server/scripts/migrate-all-tenants.ts`).

### CI Gates

`.github/workflows/`:

- `ci.yml` — type-check (`bun check-types`), web tests (`vitest`), lint (`bun check` / oxlint). Runs on PRs to `main`/`dev`.
- `drift-check.yml` — runs on PRs touching `packages/db/`, `packages/services/`, `apps/server/src/`, or the drift scripts. Fails if `bun verify:migrations` is out of sync or if `bun scripts/check-drift.ts` finds schema/live drift (missing/extra FKs, action mismatches, orphan tables).

Run both locally before opening a PR that touches schema:

```bash
bun verify:migrations
bun scripts/gen-erd.ts     # regenerates zhub/shared/schema-erd-auto.md + schema-drift.json
bun scripts/check-drift.ts # exits 1 if any drift section is non-empty
```

### Web App Routing

Uses TanStack Router with file-based routing in `apps/web/src/routes/`. Route files generate types in `routeTree.gen.ts` (gitignored by Biome, never edit by hand).

## Codebase Hub (zhub/)

A pre-built context hub lives at `zhub/` in the project root. Always check it before exploring source files.

- **`zhub/index.md`** — full page inventory: every route, purpose, and known bugs/limitations. Read this first on any task.
- **`zhub/pages/<name>.md`** — deep dive per page: components, hooks, API calls, data flow, gotchas.
- **`zhub/shared/auth-flow.md`** — cookie config, RBAC model, context pipeline. Read before any auth work.
- **`zhub/shared/api-overview.md`** — all 47 routers with procedure names and auth levels. Read before any API work.

Run `/hub-update` at the end of any feature branch to keep the hub current before merging.

## Development Notes

- **Biome** handles formatting only (tabs, double quotes, sorted Tailwind classes via `cn`/`cva`/`clsx`).
- **oxlint** is the linter — `bun check` runs oxlint, and lint-staged + Husky run it pre-commit.
- Web frontend (Vite, port 3001) proxies `/rpc` requests to the server on port 3000.
- OpenAPI docs available at `http://localhost:3000/api-reference`.
- Server runs on Cloudflare Workers via Wrangler; **don't import Node-only modules** in server code paths.
- Deps use Bun's `catalog:` (root `package.json`) for shared versions and `workspace:*` for internal packages. Always `bun install` at the repo root after dep changes — never `npm`/`yarn`.

## Stack Constraints (Don't Mix Patterns)

- Vite + TanStack Router, **not Next.js** — no `app/` directory, no Server Components, no `getServerSideProps`.
- Better-Auth, **not Clerk** — auth client is `@/lib/auth-client`.
- Drizzle ORM, **not Convex** — no `convex/` directory.
- oRPC for all client→server calls, **not REST** — go through `@/utils/orpc` (web) / `orpc` client (native).
- TanStack Form, **not React Hook Form**, for new forms (RHF exists in older code but isn't the convention).

## Test Credentials

- Control Panel: `developer.avantej@gmail.com` / `password1234`
- Tenant DB: `franchisee@gmail.com` / `password123`
