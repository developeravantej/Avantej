# CLAUDE.md

## Owner Context

**Avantej** is Wilfred's flagship multi-tenant SaaS for gym and fitness centre management. Clients are gym owners (tenants) who manage members, trainers, packages, appointments, POS sales, installment plans, and branch-level commissions.

**End users:** Gym front-desk staff (cashiers), gym managers, and trainers — Malaysian SME operators, not tech-savvy.

**Active work patterns:** Heavy use of parallel agents for audits and fixes. After any change, verify in the browser at `http://avantej.localhost:3021/`. Wilfred prefers Chrome MCP verification over test suites for feature correctness. He uses `/audit-prove` to validate the POS is working end-to-end.

**Key domain rules to never break:** Installment plan amounts must show (not full price) in POS. Commission reaches trainers in all cases — rotation queue vs requested. Multi-tenant isolation is critical: never let tenant A see tenant B's data.

**Stack note:** This project uses **Vite + TanStack Router + Better-Auth + oRPC + Drizzle** — NOT Next.js/Convex/Clerk. See Stack Constraints section below.

## Stub Data (for /page-probe)

| Field | Value |
|---|---|
| Member name | Ahmad Firdaus |
| Phone | +60123456789 |
| Email | member@test.my |
| Package amount | RM 300 (30000 sen) |
| Installment months | 3 |
| Branch | Main Branch |
| Service | Body Massage 60min |
| Staff | (use rotation — leave blank) |
| Date | today |

## Current Phase

POS system hardening — installment plan display fixes, commission distribution verification, TypeScript error cleanup. Use `/audit-prove` to validate the POS end-to-end after changes. Parallel agents are standard for audits.

## Settled Decisions

- **Vite + TanStack Router, not Next.js** — architecture is locked, don't suggest migrating
- **Better-Auth, not Clerk** — same, don't introduce Clerk patterns
- **oRPC for all client→server calls, not REST** — go through `@/utils/orpc` always
- **Drizzle, not Convex** — no Convex in this project
- **Database-per-tenant isolation via Neon branches** — tenants are never on a shared DB
- **Router files capped at 400 LOC** — CI-enforced; split into folder modules when approaching limit
- **Production domains & cross-subdomain auth** — see [`_rules/production-domains-and-auth.md`](_rules/production-domains-and-auth.md). Live at `move.avantej.com` (web worker `avantej-core`) + `move-api.avantej.com` (API worker `avantej-core-server`) on the Ngchwanlii Cloudflare account. Login depends on `CORS_ORIGIN` / `BETTER_AUTH_URL` / `COOKIE_DOMAIN=.avantej.com` + `crossSubDomainCookies`; the web SPA bakes `VITE_SERVER_URL` at build, so API-origin changes need a web rebuild+redeploy. Read that rule before touching public domains, auth origins, or deploys.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

```bash
# Development
bun install                    # Install dependencies
bun dev                        # Start all apps (web:3021, server:3020)
bun dev:web                    # Web only
bun dev:server                 # Server only
bun dev:native                 # Expo / React Native

# Database — control-panel only via these scripts (see Tenant Migrations below for tenant DBs)
bun db:push                    # Push control-panel schema (dev only, never tenant)
bun db:studio:control-panel    # Drizzle Studio for control-panel DB
bun db:studio:tenant           # Drizzle Studio for tenant DB
bun db:generate:control-panel  # Generate control-panel migration
bun db:generate:tenant         # Generate tenant migration (then run gen:migrations)
bun db:migrate:control-panel   # Apply control-panel migrations
bun db:migrate:tenant          # Apply tenant migrations locally

# Tenant migrations (file-based, embedded in Worker bundle)
bun gen:migrations             # Regenerate packages/db/src/generated/tenant-migrations.generated.ts
bun verify:migrations          # Confirm generated module matches SQL files (CI-gated)

# Quality
bun check                      # oxlint (NOT Biome — Biome handles formatting only)
bun check-types                # tsc -b across the monorepo
bun doctor                     # Diagnose common dev environment issues

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
bun e2e:smoke                  # Quick smoke test (smoke + fixes-verification specs, Chromium only)
bun e2e:seed                   # Seed business data for E2E tests
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

### Router File Structure

**CI gate: individual router files must not exceed 400 LOC** (`scripts/ci/check-router-file-loc.mjs`). For routers that grow beyond this, use the split folder module pattern:

```
packages/api/src/routers/my-router/
  index.ts              ← re-exports the merged router object
  list.procedures.ts    ← query procedures
  create.procedures.ts  ← mutation procedures
```

The gate runs on every PR touching router files. Newly created routers should use this folder pattern from the start to avoid future splits.

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

### Native App (`apps/native/`)

Expo / React Native app (member-facing, not admin). Uses **Expo Router** with three route groups:

- `(auth)/` — unauthenticated screens (login, register)
- `(app)/` — authenticated screens
- `(drawer)/` — navigation drawer shell

Uses the same oRPC client pattern via `apps/native/utils/orpc.ts` and the same Better-Auth client via `apps/native/lib/auth-client.ts`. Does **not** share route files with `apps/web` — they are separate entry points for different audiences.

### Server-Only Services & Cron

`apps/server/src/services/` contains server-only business logic that cannot be imported by `packages/api` or the web client. Key services:

| Service | Purpose |
|---------|---------|
| `ghl/` | GoHighLevel CRM sync (branch and staff) |
| `neon.service.ts` | Neon branch provisioning for new tenants |
| `installment-sweep.service.ts` | Marks overdue installments |
| `notification-dispatch.service.ts` | Sends queued notification emails via Resend |
| `saas-subscription.service.ts` | Stripe subscription lifecycle |
| `tenant-usage-snapshot.service.ts` | Usage metering snapshots |

These are wired as Cloudflare Workers **cron triggers** in `wrangler.jsonc` and dispatched in `apps/server/src/index.ts`'s `scheduled` handler:

| Schedule | Handler |
|----------|---------|
| `0 * * * *` (hourly) | installment backfill + scheduled reports + **notification dispatch** |
| `0 1 * * *` (01:00) | usage snapshot |
| `0 2 * * *` (02:00) | installment sweep + Stripe reconciliation |
| `0 3 * * *` (03:00) | tenant hard-delete |
| `0 9 * * *` (09:00) | onboarding alerts |

When adding a new scheduled job: declare the cron in `wrangler.jsonc`, add a branch in the `scheduled` handler, and create the service in `apps/server/src/services/`.

## Codebase Knowledge Graph (Graphify)

The `/hub` + `/hub-update` skills and their `zhub/` page docs have been **retired**. For codebase relationship/architecture exploration, use **Graphify** (`/graphify`). It builds a queryable knowledge graph (symbols, typed edges, community clusters) with interactive HTML + JSON + report output in `graphify-out/`.

- `/graphify .` — build the full graph
- `/graphify query "how does auth connect to tenant middleware?"` — BFS relationship query
- `/graphify path "orpcTenantMiddleware" "createContext"` — shortest path between two concepts
- `/graphify . --update` — incremental re-extraction after changes

### When to use graphify

**Before touching unfamiliar code** — query first instead of grepping cold:
```
/graphify query "how does the commission calculation reach the payout batch?"
/graphify path "pos.service" "payouts.service"
```

**When a bug report references a feature area** — the graph connects audit findings to source files. Existing findings for commissions, refunds, and installments are already in `graphify-out/graph.json`.

**After a major plan completes** — run `--update` so the graph reflects the new code. Only touch changed files; takes ~30s:
```
/graphify . --update
```

**During /execute planning** — query the graph to find which god nodes (`useApiMutation`, `useUserContext`, `Button`, etc.) a change will ripple through before assigning file ownership to parallel agents.

### When NOT to use graphify

- Routine single-file edits — just read the file
- After every commit — too noisy, update only after multi-file plans
- For type errors — use `bun check-types` directly

> **Note on `zhub/`:** the folder still exists but now holds **only schema/drift CI artifacts** (`zhub/shared/schema-*.md`) written by `scripts/gen-erd.ts`, `dump-fks.ts`, `dump-tenant-fks.ts`, and read by `scripts/check-drift.ts`. Do not delete it — the `drift-check` CI gate depends on it. The old per-page docs (`index.md`, `pages/`, `api-overview.md`, `auth-flow.md`) are gone.

## Frontend Patterns

### Data Fetching (oRPC + TanStack Query)

Both `client` and `orpc` are exported from `@/utils/orpc`. Use them together:

```typescript
import { client, orpc } from "@/utils/orpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Queries — use orpc.*.queryOptions() for full TanStack Query integration
const { data } = useQuery(orpc.services.list.queryOptions({
  input: { organizationId },
}));

// Mutations — call client.* directly inside useMutation
const qc = useQueryClient();
const mutation = useMutation({
  mutationFn: (input) => client.services.create(input),
  onSuccess: () => qc.invalidateQueries(orpc.services.list.queryOptions({ input: { organizationId } })),
});
```

For mutations that need automatic toast feedback and query invalidation, use `useApiMutation` from `@/hooks/useApiMutation` instead of raw `useMutation`:

```typescript
import { useApiMutation } from "@/hooks/useApiMutation";

const mutation = useApiMutation({
  mutationFn: (input) => client.services.create(input),
  successMessage: "Service created",
  errorMessage: (err) => err.message, // or a fixed string, or false to suppress
  invalidate: [orpc.services.list.queryOptions({ input: { organizationId } }).queryKey],
});
```

### Permission Checking (Frontend)

The canonical way to check permissions is via `useUserContext()`, NOT `usePermissions()`:

```typescript
const { hasPermission, hasAnyPermission, hasRole } = useUserContext();

// Permission format: "resource:action"
if (hasPermission("user_management:read")) { ... }

// Role check (case-insensitive)
if (hasRole(["admin", "manager"])) { ... }
```

System admins bypass all permission checks. Permissions are cached in localStorage and refreshed on mount — after granting new permissions, the user must clear localStorage or wait for the 5-minute stale time.

### Route ↔ Component Structure

Route files in `apps/web/src/routes/` are thin shells. Business logic and UI live in `apps/web/src/components/pages/<area>/`. A route file typically does only context extraction (org ID from `useUserContext`) and renders the page component.

### Router Guards (Backend)

All tenant-scoped procedures should call guards from `packages/api/src/guards.ts`:

```typescript
import {
  assertTenantContext,
  assertOrgContextMatch,
  guardBranchAccessible,
  requirePermissionOrpc,
  guardInputBranchForContext,
} from "../../guards";

// Inside a handler:
assertOrgContextMatch(context, input);          // Prevents cross-tenant spoofing
assertTenantContext(context);                   // Ensures tenantDb + member on context
guardBranchAccessible(input.branchId, context.accessibleNodeIds); // RBAC node check
guardInputBranchForContext(input, context);     // Combined: assertOrgContextMatch + RBAC
requirePermissionOrpc(context, "resource:action"); // Throws FORBIDDEN if permission missing
```

`requirePermissionOrpc` maps `PermissionDeniedError` from the services layer to an `ORPCError` with code `FORBIDDEN`. All write procedures on suspended tenants automatically return a `403` from `orpc-tenant.middleware` before reaching the handler — no additional guard needed for that.

### Server-Only Router Types

Routers that live in `apps/server/src/routers/` (auth, payments, subscriptions, GHL, etc.) are not importable in `packages/api`. Their types are declared as stubs in `packages/api/src/routers/_types/server-router-types.ts` so the web client gets full type safety. When adding a new server-only router, register its type stub there and merge it in `packages/api/src/routers/index.ts`.

## Development Notes

- **Biome** handles formatting only (tabs, double quotes, sorted Tailwind classes via `cn`/`cva`/`clsx`).
- **oxlint** is the linter — `bun check` runs oxlint, and lint-staged + Husky run it pre-commit.
- Web frontend (Vite, port 3021) proxies `/rpc` requests to the server on port 3020.
- OpenAPI docs available at `http://localhost:3020/api-reference`.
- Server runs on Cloudflare Workers via Wrangler; **don't import Node-only modules** in server code paths.
- Deps use Bun's `catalog:` (root `package.json`) for shared versions and `workspace:*` for internal packages. Always `bun install` at the repo root after dep changes — never `npm`/`yarn`.
- **SaaS subscription states**: `orpc-tenant.middleware` enforces subscription access before handlers run. Suspended/cancelled tenants return a `403` with `{ error: "Tenant is {suspended|cancelled}" }`. Past-due tenants get read-only access (`SAAS_PAST_DUE_READONLY`) — write procedures (names prefixed with `create*`, `update*`, `delete*`, etc.) are blocked with `SAAS_BLOCKED`.

## Stack Constraints (Don't Mix Patterns)

- Vite + TanStack Router, **not Next.js** — no `app/` directory, no Server Components, no `getServerSideProps`.
- Better-Auth, **not Clerk** — auth client is `@/lib/auth-client`.
- Drizzle ORM, **not Convex** — no `convex/` directory.
- oRPC for all client→server calls, **not REST** — go through `@/utils/orpc` (web) / `orpc` client (native).
- TanStack Form, **not React Hook Form**, for new forms (RHF exists in older code but isn't the convention).

## Test Credentials

- Control Panel: `developer.avantej@gmail.com` / `password123`
- Tenant DB: `franchisee@gmail.com` / `password123`
