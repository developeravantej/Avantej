# How APIs Populate the Database in This Project

This document describes how APIs are created and how they write to the database in the Avantej project.

---

## 1. Overview

The project exposes APIs in **two ways**:

| Style | Entry point | Used for | Database access |
|-------|--------------|-----------|------------------|
| **Hono REST / OpenAPI** | `apps/server` routes | Auth, org lifecycle, webhooks, invitations (email) | Control panel or tenant DB via `getControlPanelDb(c)` / `getTenantDb(orgId, c)` |
| **oRPC (RPC + OpenAPI)** | `packages/api` routers, mounted under `/rpc/*` and `/api-reference/*` | Hierarchy, members, invitations (CRUD), admin | Context: `context.tenantDb`, `context.controlPanelDb`; handlers call `packages/services`, which use Drizzle to insert/update |

Both styles use the same **database layer** (`packages/db`), **Drizzle ORM**, and **request-scoped connections** (for Cloudflare Workers). Data is written either **directly in route/handler code** (e.g. organization create) or **via shared services** (e.g. hierarchy, invitations).

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  apps/server (Hono app)                                                   │
│  - dbMiddleware          → request-scoped control panel + tenant pools    │
│  - orpcTenantMiddleware  → for /rpc/*: sets tenantDb, organizationId    │
│  - Routes: /auth, /orgs, /orgs/:id/hierarchy, /api/invitations, /webhooks│
│  - oRPC: /rpc/*, /api-reference/*  (createContext → appRouter)           │
└─────────────────────────────────────────────────────────────────────────┘
         │                              │
         │ REST                          │ oRPC
         ▼                              ▼
┌──────────────────────┐    ┌──────────────────────────────────────────────┐
│  Route handlers      │    │  packages/api (routers)                       │
│  (organizations,     │    │  - hierarchy, invitations, members           │
│   hierarchy,         │    │  - protectedProcedure / publicProcedure      │
│   invitations,       │    │  - .input(zod).handler(async ({ input,       │
│   auth, webhooks)    │    │         context }) => { ... })                │
└──────────────────────┘    └──────────────────────────────────────────────┘
         │                              │
         │ getControlPanelDb(c)         │ context.tenantDb /
         │ getTenantDb(orgId, c)        │ context.controlPanelDb
         │                              │
         ▼                              ▼
┌──────────────────────┐    ┌──────────────────────────────────────────────┐
│  Direct Drizzle       │    │  packages/services                           │
│  or one-off logic     │    │  - hierarchy.service, invitation.service,  │
│  (e.g. org create)   │    │    member.service, permission.service       │
└──────────────────────┘    │  - createHierarchyNode(tenantDb, params)      │
         │                  │  - createInvitation({ tenantDb, ... })       │
         │                  └──────────────────────────────────────────────┘
         │                              │
         └──────────────┬───────────────┘
                        ▼
         ┌──────────────────────────────────────────────┐
         │  packages/db                                  │
         │  - schema (control-panel + tenant)           │
         │  - Drizzle: .insert(), .update(), .query     │
         │  - migrations, seed (RBAC)                    │
         └──────────────────────────────────────────────┘
                        │
                        ▼
         ┌──────────────────────────────────────────────┐
         │  Control panel DB (Neon)  │  Tenant DBs (Neon)│
         │  users, organizations,   │  hierarchy_nodes,  │
         │  organization_members   │  members,         │
         │  subscriptions, etc.    │  invitations, etc.│
         └──────────────────────────────────────────────┘
```

---

## 3. Database Layer

### 3.1 Two databases

- **Control panel**  
  Single Neon project. Stores: Better-Auth (`user`, `session`, `account`, `verification`), `subscriptions`, `organizations`, `organization_members`, `platform_admins`, `admin_sessions`, `organization_analytics`.  
  Used by: auth, org lifecycle, admin, and any “platform-wide” data.

- **Tenant databases**  
  One Neon project per organization. Store: `hierarchy_nodes`, `members`, `invitations`, `roles`, `permissions`, `service_*`, `appointments`, etc.  
  Used by: hierarchy, members, invitations, and all tenant-scoped features.

### 3.2 Request-scoped connections (middleware)

- **`dbMiddleware`** (`apps/server/src/middleware/db.middleware.ts`)  
  Runs first. Creates per-request:
  - `controlPanelPool` + `controlPanelDb` (Drizzle with control-panel schema)
  - `tenantPools` (map of `organizationId` → Pool)
  - `getBetterAuth` for auth

  Pools are closed in `finally` after the request so Workers don’t share connections.

- **`orpcTenantMiddleware`**  
  Runs only for `/rpc/*`. Parses the oRPC body, reads `organizationId` from `params.input.organizationId` (or equivalent), then:
  - Calls `getTenantDb(organizationId, c)` and sets `tenantDb` and `organizationId` on the Hono context
  - Optionally loads `member` and `accessibleNodeIds` for the current user

  So by the time an oRPC procedure runs, `context.tenantDb` (and often `context.member`) are already set.

### 3.3 Getting a DB client in handlers

- **In Hono route handlers** (e.g. `apps/server/src/routes/*.ts`):
  - Control panel: `const controlPanelDb = getControlPanelDb(c);`
  - Tenant: `const tenantDb = await getTenantDb(organizationId, c);`  
  (`getControlPanelDb` and `getTenantDb` live in `apps/server/src/lib/db.ts`.)

- **In oRPC procedures** (e.g. `packages/api/src/routers/*.ts`):
  - Tenant: `context.tenantDb` (set by orpcTenantMiddleware + createContext).
  - Control panel: `context.honoContext.get("controlPanelDb")` when needed (e.g. for members with user details).

---

## 4. How APIs Populate the Database

### 4.1 Hono REST routes (direct DB or one-off logic)

Examples: **organization create**, **auth**, **webhooks**.

1. Route is registered in `apps/server/src/index.ts` (e.g. `app.route("/orgs", organizationRoutes)`).
2. Handler uses `authMiddleware` (or similar) and reads body/params.
3. Handler gets DB from context:
   - `getControlPanelDb(c)` for control-panel tables
   - `getTenantDb(organizationId, c)` for tenant tables (when the route is tenant-scoped).
4. Handler (or a small local helper) uses Drizzle to **insert/update**:
   - Example: **POST /orgs** in `organizations.routes.ts` runs a control-panel transaction: insert `organizations`, then run tenant migrations, then with the new tenant DB insert `hierarchy_nodes` and `members`, and insert into `organization_members` in the control panel.

So for these routes, “API → populate DB” is: **Route handler → getControlPanelDb / getTenantDb → Drizzle `.insert()` / `.update()` (and migrations when creating a new org).**

### 4.2 oRPC procedures (router → service → DB)

Examples: **hierarchy** (create/update/delete node, move, list members, reassign), **invitations** (create, list, accept, revoke), **members**.

1. **Router** in `packages/api/src/routers/` (e.g. `hierarchy.ts`, `invitations.ts`):
   - Defines procedures with `protectedProcedure` (or `publicProcedure`).
   - Uses `.input(z.object({ ... }))` (Zod) and `.handler(async ({ input, context }) => { ... })`.
   - In the handler: checks `context.tenantDb` and `context.member`, then calls a **service** from `packages/services`.

2. **Service** in `packages/services/src/` (e.g. `hierarchy.service.ts`, `invitation.service.ts`):
   - Receives `tenantDb` (and any other params).
   - Uses schema from `packages/db` (e.g. `hierarchyNodes`, `invitations`, `members`) and Drizzle to **insert/update/delete**.
   - Example: `createHierarchyNode(tenantDb, params)` does `tenantDb.insert(hierarchyNodes).values({ ... }).returning()`.
   - Example: `createInvitation({ tenantDb, email, role, ... })` does `tenantDb.insert(invitations).values({ ... }).returning()`.

3. **Context** is built in `packages/api/src/context.ts`:
   - Uses session from Better-Auth and Hono context (`organizationId`, `tenantDb`, `member`, etc.).
   - For oRPC, `tenantDb` and `organizationId` are usually set by `orpcTenantMiddleware` before `createContext` runs.

So for oRPC, “API → populate DB” is: **Client calls /rpc/* → orpcTenantMiddleware sets tenantDb → createContext → procedure handler → service → Drizzle `.insert()` / `.update()` in `packages/db` schema.**

---

## 5. End-to-End Example: Creating a Hierarchy Node

1. **Client** calls oRPC: e.g. `hierarchy.createNode` with `input: { organizationId, type, name, parentId?, code? }`.
2. **Server** (`apps/server/src/index.ts`): request hits `/rpc/*` → `dbMiddleware` → `orpcTenantMiddleware` (parses body, gets `organizationId`, sets `tenantDb` and `organizationId` on `c`) → `/rpc/*` handler calls `createContext(c)` then `rpcHandler.handle(...)`.
3. **Context** (`packages/api/src/context.ts`): builds `{ session, organizationId, tenantDb, member, accessibleNodeIds, ... }`. For this request, `tenantDb` and `organizationId` are already on `c`.
4. **Router** (`packages/api/src/routers/hierarchy.ts`): `createNode` handler:
   - Ensures `context.tenantDb` and `context.member`.
   - Optionally checks permission (`requirePermission(tenantDb, member, "hierarchy_management", "create")`).
   - Validates parent access and hierarchy rules (via `packages/services`).
   - Calls **`createHierarchyNode(tenantDb, params)`**.
5. **Service** (`packages/services/src/hierarchy.service.ts`): `createHierarchyNode`:
   - Uses `tenantDb.insert(hierarchyNodes).values({ name, type, parentId, depth, ... }).returning()`.
   - Returns the created node.
6. **Router** maps the result to the response shape and returns it.

So the **database is populated** by the service’s `tenantDb.insert(hierarchyNodes)...` using the schema defined in `packages/db/src/schema/tenant/hierarchy.ts`.

---

## 6. Adding a New API That Writes to the Database

### Option A: New oRPC procedure (tenant data)

1. **Schema** (if new table): add table in `packages/db/src/schema/tenant/`, run migrations.
2. **Service** (if new logic): in `packages/services/src/`, add a function that accepts `tenantDb` and params and uses Drizzle to insert/update; export it from `packages/services/src/index.ts`.
3. **Router**: in `packages/api/src/routers/` (existing or new file), add a procedure, e.g.:
   - `protectedProcedure.input(z.object({ organizationId: z.string().uuid(), ... })).handler(async ({ input, context }) => { ... })`
   - In the handler: ensure `context.tenantDb` and `context.member`, then call the new service and return the result.
4. **Mount**: if you add a new router, add it to `packages/api/src/routers/index.ts` and (if needed) to the app router in `apps/server/src/index.ts`.

The new API populates the DB through the service’s Drizzle calls against `packages/db` schema.

### Option B: New Hono route (e.g. control panel or one-off)

1. **Schema** (if new table): add table under `packages/db/src/schema/control-panel/` or tenant, run migrations.
2. **Route**: in `apps/server/src/routes/`, create a route (e.g. `something.routes.ts`), use `getControlPanelDb(c)` or `getTenantDb(organizationId, c)`.
3. **Handler**: parse body/params, then use Drizzle on the DB client to `.insert()` / `.update()` (or call a shared service that does the same).
4. **Mount**: in `apps/server/src/index.ts`, `app.route("/path", somethingRoutes)`.

---

## 7. Key Files Reference

| Purpose | Location |
|--------|----------|
| App entry, middleware, route and oRPC mount | `apps/server/src/index.ts` |
| Control panel / tenant DB helpers | `apps/server/src/lib/db.ts` |
| Request-scoped DB and auth | `apps/server/src/middleware/db.middleware.ts` |
| Tenant context for oRPC | `apps/server/src/middleware/orpc-tenant.middleware.ts` |
| oRPC context (session, tenantDb, member) | `packages/api/src/context.ts` |
| oRPC procedures (hierarchy, invitations, members) | `packages/api/src/routers/*.ts` |
| Base procedures (public/protected) | `packages/api/src/index.ts` |
| Business logic and DB writes (hierarchy, invitations, members, etc.) | `packages/services/src/*.service.ts` |
| Table definitions and Drizzle schema | `packages/db/src/schema/` (control-panel/, tenant/) |
| Migrations | `packages/db/src/migrations/` |
| Organization create (control panel + tenant inserts) | `apps/server/src/routes/organizations.routes.ts` (POST /) |

---

## 8. Summary

- **APIs that populate the database** do so either:
  - **REST (Hono):** in route handlers using `getControlPanelDb(c)` or `getTenantDb(organizationId, c)` and Drizzle, or
  - **oRPC:** in procedure handlers that call `packages/services`, which use `context.tenantDb` (and sometimes control panel DB) and Drizzle.
- **Schema and migrations** live in `packages/db`. All writes use the same Drizzle schema and request-scoped connections set up by `dbMiddleware` and (for oRPC) `orpcTenantMiddleware`.
- **New write APIs** follow either: add a service + oRPC procedure (tenant) or add a Hono route and use the DB helpers and Drizzle (or a shared service) to insert/update.
