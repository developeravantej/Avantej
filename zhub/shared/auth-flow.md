# Auth & Session Flow

**Last updated:** 2026-04-16

## Overview

Authentication is handled by **Better-Auth** (`apps/server/src/lib/better-auth.ts`) using email/password with email verification required. Sessions are stored as HTTP-only cookies and validated on every oRPC request.

---

## Session Flow

How a request travels from browser to session context:

1. **Browser** sends a `POST /rpc/{router}/{procedure}` request with a session cookie (`better-auth.session_token`) set by Better-Auth on login.

2. **`dbMiddleware`** (`apps/server/src/middleware/db.middleware.ts`) runs first for every request:
   - Creates a request-scoped `controlPanelPool` (Neon WebSocket connection).
   - Creates a request-scoped `controlPanelDb` (Drizzle client over control-panel schema).
   - Creates a `tenantPools` map (keyed by `organizationId`) for reuse within the request.
   - Stores a `getBetterAuth` factory function in Hono context so downstream handlers use a request-scoped auth instance.
   - Cleans up all pools in `finally` after the request ends.

3. **`orpcTenantMiddleware`** (`apps/server/src/middleware/orpc-tenant.middleware.ts`) runs for all `/rpc/*` routes:
   - Clones the request body (to avoid consuming the stream) and parses JSON.
   - Extracts `organizationId` from the oRPC payload (checked at `body.organizationId`, `body.params.input.organizationId`, or nested `body.json.*` paths).
   - Calls `getBetterAuth(c).api.getSession(headers)` to resolve the current user.
   - Calls `getTenantDb(organizationId, c)` which decrypts the tenant's Neon connection string and creates a Drizzle client over tenant schema.
   - Queries `members` table by `userId` to get the member record.
   - Calls `getDescendantNodeIds(tenantDb, member.hierarchyScopeId)` (recursive PostgreSQL CTE) to build `accessibleNodeIds`.
   - Stores `organizationId`, `tenantDb`, `member`, `accessibleNodeIds` on Hono context.
   - Special case: endpoints `invitations/getByToken`, `invitations/accept`, `invitations/verifyEmailByToken`, `registration/complete` are treated as public — `tenantDb` is set up without requiring a user session.

4. **`createContext`** (`packages/api/src/context.ts`) is called by the oRPC handler adapter for every procedure:
   - Reads `getBetterAuth` from Hono context, calls `auth.api.getSession(headers)` → `session`.
   - Reads `organizationId`, `tenantDb`, `member`, `organization`, `accessibleNodeIds` from Hono context.
   - If `tenantDb` is present but `member` is missing (and `session.user` exists), it does a fallback lookup: queries `members` by `userId` and recalculates `accessibleNodeIds`.
   - Returns the full context object available to every oRPC handler.

5. **oRPC handler** receives `context` with:
   - `session` — Better-Auth session (user, token, etc.) or `null`
   - `organizationId` — UUID string
   - `tenantDb` — Drizzle client scoped to the tenant's Neon branch
   - `member` — member record from tenant DB
   - `organization` — organization record (if set by tenant middleware for non-oRPC routes)
   - `accessibleNodeIds` — array of hierarchy node UUIDs the member can see
   - `honoContext` — raw Hono context for accessing middleware-injected values

---

## Cookie Configuration

Configured in `apps/server/src/lib/better-auth.ts` under `advanced.defaultCookieAttributes`:

```
sameSite: isHttps ? "none" : "lax"
secure:   isHttps ? true  : false
httpOnly: true (always)
```

Where `isHttps` is derived from `BETTER_AUTH_URL` env var. This means:
- **Development (HTTP):** `sameSite=lax`, `secure=false` — cookie works in all browsers on localhost.
- **Production (HTTPS):** `sameSite=none`, `secure=true` — required for cross-origin requests.

Session expiry: **8 hours**; refresh every **30 minutes** (sliding window).

---

## RBAC Model

### Roles

Roles are stored in the tenant `roles` table with a `priority` field:

| Priority | Behavior |
|----------|----------|
| `>= 100` | Admin — all permissions granted unconditionally |
| `< 100`  | Staff — only permissions explicitly assigned via `role_permissions` table |

The `member.role` field stores the role name (string). The role name is joined to the `roles` table to look up `priority` using a **case-insensitive comparison** (`LOWER(roles.name) = LOWER(member.role)`). Previously the lookup was case-sensitive (`eq(roles.name, member.role)`), which meant a case mismatch (e.g. `"Admin"` vs `"admin"`) would silently return no role and therefore empty permissions. If no matching role is found, the server now logs a `console.warn`. A second warning fires when an admin-priority role (>= 100) has an empty permissions table.

### `accessibleNodeIds`

Built by `getDescendantNodeIds(tenantDb, member.hierarchyScopeId)`:
- Uses a PostgreSQL recursive CTE starting from `member.hierarchyScopeId`.
- Returns the starting node plus all descendants (children, grandchildren, …).
- Used in list queries to filter records to only those belonging to hierarchy nodes the member can see.
- Admin members (`role.priority >= 100`) still get `accessibleNodeIds` computed the same way, but routers may bypass the filter for admins.

### Permission Checking

Permissions are stored as `resource:action` pairs in the tenant `permissions` table, linked to roles via `role_permissions`.

Resources (from `packages/services/src/permission.service.ts`):

| Domain | Resources |
|--------|-----------|
| Org & access | `hierarchy_management`, `user_management`, `role_management`, `users`, `roles`, `branches` |
| Services | `service_management`, `appointment_management`, `appointments`, `services`, `class_slot_management` |
| Sales | `sales`, `payments`, `promotion_management`, `tax_configuration` |
| Inventory | `inventory`, `purchase_order_management`, `stock_requests`, `transfer_orders` |
| Finance/HR | `expense_management`, `commission_management` |
| Comms | `announcement_management` |
| Customers | `walk_in_customer_management` |
| Reporting | `reports` |

Actions: `create`, `read`, `update`, `delete`, `approve`, `reject`, `export`, `import`

`hasPermission(tenantDb, member, resource, action)` — returns `true` if admin role, otherwise queries `role_permissions`.

### `userContext` Permissions Payload

When `auth.userContext` is called, the server returns a flat `permissions` array per organization: `["resource:action", ...]`. The web stores this in localStorage and exposes it via `useUserContext` → `hasPermission("resource:action")`.

System admins (`platformAdmins` table) get `isSystemAdmin: true` and `hasPermission` returns `true` for everything.

---

## Procedure Auth Levels

Defined in `packages/api/src/index.ts`:

| Level | Symbol | Middleware | Requirement |
|-------|--------|-----------|-------------|
| `publicProcedure` | `o` (bare `os.$context<Context>()`) | None | No session required |
| `protectedProcedure` | `publicProcedure.use(requireAuth)` | `requireAuth` middleware | Valid `session.user` must exist; throws `UNAUTHORIZED` if not |

The `auth.userContext` procedure in `apps/server/src/routers/auth.ts` has its own internal `authMiddleware` (equivalent behavior to `protectedProcedure`).

The `admin.*` procedures in `apps/server/src/routers/admin.ts` add a further `requireAdmin` middleware that checks the `platformAdmins` control-panel table.

---

## Key Gotchas

- **Cookie change requires re-login.** If `BETTER_AUTH_URL` changes between HTTP and HTTPS (or vice versa), old cookies become invalid because `secure`/`sameSite` attributes change. Users must sign out and back in.
- **`organizationId` must be in every oRPC request body.** The `orpcTenantMiddleware` extracts it from the request; if absent, `tenantDb` is not set up and all protected procedures that need tenant data will fail.
- **Two separate session lookups.** Both `orpcTenantMiddleware` and `createContext` independently call `auth.api.getSession`. This is intentional (middleware runs before context creation) but means two round-trips to the session store per request.
- **Invitation / registration endpoints bypass session check.** The paths `invitations/getByToken`, `invitations/accept`, `invitations/verifyEmailByToken`, and `registration/complete` skip the `!user` guard in `orpcTenantMiddleware`, so they get a `tenantDb` connection without an authenticated session. This is required for new-user registration.
- **`organizationMembers.status` must be `"active"`.** Users who are members of an org with `status !== "active"` are filtered out from `userContext` response.
- **`organizations.paymentStatus` must be `"active"`.** Orgs with inactive payment status do not appear in `userContext`.
- **Singleton `auth` export is deprecated for request handlers.** Always use `getBetterAuth(c)` inside request handlers to get a request-scoped instance. The exported `auth` singleton is only safe in tests/scripts.
- **`tenantDb` pool per org is cached within a single request** via `tenantPools` Map in `dbMiddleware`, but never shared across requests (Cloudflare Workers I/O isolation).

---

## Web: `useUserContext` Hook

`apps/web/src/hooks/useUserContext.ts`

- Calls `client.auth.userContext({})` via oRPC.
- Caches result in TanStack Query (`staleTime: 5 min`, `gcTime: 10 min`).
- Persists organizations and hierarchy to `localStorage` as `initialData` for fast first render.
- Exposes helpers: `hasPermission(perm)`, `hasAnyPermission(perms[])`, `hasRole(roleNames[])`.
- `hasPermission` always returns `true` for `isSystemAdmin` users.
