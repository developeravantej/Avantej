# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
bun dev              # Start all apps (web + server + native)
bun dev:web          # Web app only (Vite on localhost:3001)
bun dev:server       # Backend only (Hono on localhost:3000)
bun dev:native       # Expo native app

# Build & Deploy
bun build            # Build all apps via Turborepo
cd apps/server && bun deploy   # Deploy server to Cloudflare Workers
cd apps/web && bun deploy      # Deploy web to Cloudflare Workers

# Database
bun db:push          # Push Drizzle schema changes to database
bun db:studio        # Open Drizzle Studio UI

# Code Quality
bun check            # Run oxlint linting
bun check-types      # TypeScript type checking across monorepo

# Testing (server only)
cd apps/server && bun test              # All tests
cd apps/server && bun test:unit         # Unit tests
cd apps/server && bun test:integration  # Integration tests
```

## Architecture

**Monorepo** using Bun workspaces + Turborepo. Three apps, five shared packages.

### Apps

- **`apps/server`** — Hono API on Cloudflare Workers. oRPC procedures in `src/routes/`, middleware in `src/middleware/`, business logic in `src/services/`.
- **`apps/web`** — Vite SPA with TanStack Router (file-based routing in `src/routes/`). React 19, Radix UI + Tailwind v4 (shadcn/ui pattern).
- **`apps/native`** — Expo SDK 54+ with Expo Router (file-based routing in `app/`). React Native 0.81, NativeWind for styling.

### Shared Packages

- **`packages/api`** — oRPC router contracts, client factory, context definitions. This is the type-safe bridge between client and server.
- **`packages/db`** — Drizzle ORM schemas and migrations. Two schema sets: `schema/control-panel/` (platform-wide: auth, orgs, subscriptions) and `schema/tenant/` (per-organization: hierarchy, services, appointments, payments).
- **`packages/auth`** — Better-Auth configuration shared across apps.
- **`packages/services`** — Shared business logic (hierarchy, permissions, validation).
- **`packages/types`** — Shared TypeScript types.

### Multi-Tenant Database Architecture

The system uses separate databases per tenant. The control panel DB stores organizations and auth. Each organization gets its own tenant DB. `apps/server/src/lib/db.ts` contains `getTenantDb()` which looks up the org, decrypts its connection string, and returns a tenant-scoped Drizzle client. The `dbMiddleware` provides request-scoped connections.

### API Layer (oRPC)

End-to-end type-safe RPC. Adding a new procedure:
1. Define router contract in `packages/api/src/routers/[feature].ts`
2. Implement handler in `apps/server/src/routes/[feature].routes.ts`
3. Call from client: `orpc.[feature].[procedure].query/mutate()`

### Auth Flow

Better-Auth with organization plugin for multi-tenancy. Server middleware (`auth.middleware.ts`) sets `ctx.session`, `ctx.organizationId`, `ctx.member`, `ctx.accessibleNodeIds`. Web uses `authClient` from `@/lib/auth-client`. Native uses `@better-auth/expo` with Expo SecureStore.

## Critical Rules — Do NOT Use

- **Next.js** — This is Vite + TanStack Router (web) and Expo Router (native)
- **Clerk** — Use Better-Auth
- **REST endpoints** — Use oRPC for all API communication
- **npm/yarn** — Use Bun exclusively
- **React Hook Form** — Use TanStack Form
- **Convex** — Use Drizzle ORM

## Key Conventions

- **Package manager**: Bun v1.2.22. Use `bun` for all commands.
- **Dependency versions**: Use `catalog:` for shared deps (defined in root package.json), `workspace:*` for internal packages.
- **Styling**: Web uses Tailwind v4 with `@tailwindcss/vite` plugin + `cn()` utility. Native uses NativeWind v4.
- **State**: TanStack Query for server state, React hooks for client state.
- **Forms**: TanStack Form with Zod validation.
- **Linting**: Oxlint + Biome. Husky + lint-staged run on commit.
- **Env vars**: Web uses `VITE_` prefix, Native uses `EXPO_PUBLIC_` prefix, Server uses plain env vars or Cloudflare secrets.
