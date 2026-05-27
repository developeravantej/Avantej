# Auth Flow & RBAC

**Last updated:** 2026-05-27 *(Sprint 05-27 quality remediation: middleware test coverage + orpc-tenant unknown-org now returns 403 instead of falling through to a procedure-level 500)*

---

## 1. Session & Cookie Flow

```
Browser                          Server (Cloudflare Worker)
  |                                        |
  |--- POST /rpc/{router}/{proc} --------> |
  |    Cookie: better-auth.session_token   |
  |                                        |
  |                              dbMiddleware
  |                              - Creates request-scoped controlPanelDb + tenantDb pools
  |                              - Registers getBetterAuth() factory in Hono ctx
  |                                        |
  |                              orpcTenantMiddleware
  |                              - Extracts organizationId from request body
  |                              - Looks up org in controlPanelDb
  |                                - If org NOT found → 403 FORBIDDEN immediately
  |                                  (cross-tenant safety; no DB query on wrong tenant)
  |                                - If paymentStatus suspended/cancelled → 403
  |                                  (platformAdmin endpoints bypass)
  |                              - Creates tenantDb connection (org's Neon branch)
  |                              - Sets: ctx.organizationId, ctx.tenantDb, ctx.organization
  |                                        |
  |                              createContext() (packages/api/src/context.ts)
  |                              - auth.api.getSession({ headers }) -> session
  |                              - If tenantDb set but member missing:
  |                                  tenantDb.query.members.findFirst(userId = session.user.id)
  |                                  -> sets ctx.member
  |                                  getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
  |                                  -> sets ctx.accessibleNodeIds
  |                              Returns: { session, organizationId, tenantDb, member,
  |                                         organization, accessibleNodeIds, honoContext }
```

**Key files:**
- `apps/server/src/middleware/orpc-tenant.middleware.ts` — oRPC org context
- `packages/api/src/context.ts` — full request context builder
- `apps/server/src/lib/better-auth.ts` — Better-Auth config + cookie settings

**Cookie config:** `secure` + `sameSite: "none"` on HTTPS; `secure: false` + `sameSite: "lax"` on HTTP dev.

---

## 2. Two-Database Architecture

| Database | Variable | Content |
|----------|----------|---------|
| Control panel | `controlPanelDb` | users, organizations, organization_members (cache), subscriptions, platform_admins |
| Tenant | `tenantDb` | members, hierarchy_nodes, services, appointments, sales_orders, etc. |

**Tenant isolation:** Each org has its own Neon PostgreSQL branch. `tenantDb` is established per-request from the org's connection string stored in `organizations.connectionString`.

**Org visibility requirements:** `organizations.paymentStatus = "active"` AND `organization_members.status = "active"` for org to appear in `userContext`.

---

## 3. RBAC Model

### Roles

| Role | Scope |
|------|-------|
| `admin` | Sees ALL hierarchy nodes in the tenant |
| `staff` | Sees only nodes within `getDescendantNodeIds(hierarchyScopeId)` |

### Hierarchy Scoping

```typescript
// packages/services/src/hierarchy.ts
getDescendantNodeIds(tenantDb, hierarchyScopeId)
// Returns all accessible node IDs (self + descendants)
// Admin: hierarchyScopeId = root node -> returns all nodes
```

### Permission Checks

Permissions stored in `role_permissions` table (tenant DB). `permissions.list` returns `{ resource, action }[]`.

Frontend pattern:
```typescript
const canApprove = userContext?.permissions?.some(
  p => p.resource === "commission_management" && p.action === "approve"
);
```

**Router guard helpers** (`packages/api/src/guards.ts` — use in procedure handlers):

| Helper | When to call | Error |
|--------|--------------|-------|
| `assertOrgContextMatch(context, input)` | First on any procedure with `organizationId` in input | `FORBIDDEN` if input org ≠ context org |
| `assertTenantContext(context)` | Before permission / DB work on tenant procedures | `INTERNAL_SERVER_ERROR` if `tenantDb` missing; `FORBIDDEN` if `member` missing |
| `requirePermissionOrpc(tenantDb, member, resource, action)` | After tenant context asserted | `FORBIDDEN` on permission denial |
| `tryGetControlPanelDb(context)` | Optional CP sync (GHL, org branches) | Returns `null` — skip silently |
| `getControlPanelDb(context)` | Required CP DB access | `INTERNAL_SERVER_ERROR` if unavailable |

### Platform Admin

Separate from tenant RBAC. Stored in `platform_admins` (control panel DB). Routes: `/dashboard/platform-admin/*`.

---

## 4. Key Auth Procedures

| Procedure | Route | Purpose |
|-----------|-------|---------|
| `auth.userContext` | POST /rpc/auth/userContext | Current user's orgs, roles, permissions — used on every page load |
| Better-Auth native | GET /api/auth/get-session | Raw session check (in-memory session, cookie in headers) |

`useUserContext` hook calls `auth.userContext({})` and caches result in localStorage as bootstrap data.

---

## 5. Web Auth Routes

| Route | Purpose |
|-------|---------|
| `/login` | Email + password sign-in |
| `/signup` | Account creation — invitation token pre-fills email |
| `/setup-password` | One-time token password setup for invited users |
| `/verify-email` | Email token verification |
| `/accept-invitation` | Accept org membership invitation |
| `/onboarding` | Post-signup org name setup |

---

## 6. Known Issues & Gotchas

- **Stale permissions cache:** New permission grants don't appear until localStorage is cleared.
- **Missing member in context:** If user is not an org member, `context.member` is null — call `assertTenantContext` early to return `FORBIDDEN` before node-scope checks.
- **`accessibleNodeIds` fallback:** If `getDescendantNodeIds` fails, defaults to `[]` — node-scoped queries return empty.
- **Form library inconsistency:** Login uses TanStack Form; Signup/Setup-password use react-hook-form.
- **OAuth not implemented:** Social sign-in buttons exist in UI but are disabled.
