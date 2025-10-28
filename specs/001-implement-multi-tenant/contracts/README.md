# API Contracts: Multi-Tenant Authentication & Organization Management

This directory contains OpenAPI 3.0 specifications for all API endpoints.

## Contract Files

| File | Description | Base Path |
|------|-------------|-----------|
| `auth-api.yaml` | Authentication (register, login, verify, password reset) | `/auth/*` |
| `org-api.yaml` | Organization lifecycle (create, update, suspend, delete) | `/orgs/*` |
| `hierarchy-api.yaml` | Hierarchy management (CRUD for countries, regions, areas, branches) | `/orgs/:id/hierarchy/*` |
| `member-api.yaml` | Member management (invite, accept, remove, update roles) | `/orgs/:id/members/*` |
| `admin-api.yaml` | Platform admin control panel (view tenants, impersonate, audit logs) | `/admin/*` |
| `webhook-api.yaml` | Stripe webhook handlers (payment events) | `/webhooks/stripe` |

## Key Endpoints Summary

### Authentication (`auth-api.yaml`)
- `POST /auth/register` - Register user
- `POST /auth/login` - Login with email/password
- `POST /auth/verify-email` - Verify email via token
- `POST /auth/reset-password` - Request password reset
- `POST /auth/logout` - Logout
- `POST /auth/refresh` - Refresh access token

### Organizations (`org-api.yaml`)
- `POST /orgs` - Create organization (after payment)
- `GET /orgs/:id` - Get organization details
- `PATCH /orgs/:id` - Update organization
- `DELETE /orgs/:id` - Delete organization
- `GET /orgs/:id/context` - Get organization context (hierarchy, member role)

### Hierarchy (`hierarchy-api.yaml`)
- `POST /orgs/:id/hierarchy/nodes` - Create hierarchy node
- `GET /orgs/:id/hierarchy` - Get full hierarchy tree
- `PATCH /orgs/:id/hierarchy/nodes/:nodeId` - Update node
- `DELETE /orgs/:id/hierarchy/nodes/:nodeId` - Delete node
- `POST /orgs/:id/hierarchy/nodes/:nodeId/move` - Move node to new parent

### Members (`member-api.yaml`)
- `POST /orgs/:id/members/invite` - Send invitation
- `POST /invitations/:token/accept` - Accept invitation
- `GET /orgs/:id/members` - List members
- `PATCH /orgs/:id/members/:memberId` - Update member role/scope
- `DELETE /orgs/:id/members/:memberId` - Remove member

### Admin Control Panel (`admin-api.yaml`)
- `GET /admin/tenants` - List all organizations
- `GET /admin/tenants/:id` - Get tenant details
- `POST /admin/tenants/:id/suspend` - Suspend organization
- `POST /admin/tenants/:id/unsuspend` - Restore organization
- `POST /admin/impersonate` - Start impersonation session
- `POST /admin/impersonate/exit` - End impersonation
- `GET /admin/audit-logs` - Get audit logs

### Webhooks (`webhook-api.yaml`)
- `POST /webhooks/stripe` - Handle Stripe events

## Authentication

All endpoints (except `/auth/register`, `/auth/login`, `/auth/verify-email`, `/auth/reset-password`, `/webhooks/stripe`) require Bearer token authentication:

```
Authorization: Bearer <jwt_token>
```

JWT tokens expire after 15 minutes per constitutional requirement.

## Organization Context

Endpoints under `/orgs/:id/*` automatically validate:
1. User is a member of the organization
2. User's role has permission for the operation
3. User's hierarchy scope allows access to requested resources

## Hierarchy Scoping

For hierarchy-sensitive endpoints (e.g., listing members), responses are automatically filtered to user's accessible hierarchy nodes (current scope + all descendants).

## Error Responses

All endpoints return standard error format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": {
      "field": "email",
      "issue": "Invalid email format"
    }
  }
}
```

Common error codes:
- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)
- `INTERNAL_ERROR` (500)

## Usage with Hono + oRPC

These OpenAPI specs are used by oRPC to generate:
1. **TypeScript types** for end-to-end type safety
2. **Runtime validators** with Zod schemas
3. **Type-safe client SDKs** for frontend applications
4. **OpenAPI documentation** (Swagger UI)

Example Hono route with oRPC:

```typescript
import { Hono } from "hono";
import { oz } from "@orpc/zod";

// Define procedure with oRPC
const registerProcedure = oz.input(
  z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string(),
  })
).handler(async ({ input, context }) => {
  // input is type-safe based on schema
  const user = await createUser(input);
  return { userId: user.id, email: user.email };
});

// Use in Hono app
const app = new Hono()
  .post("/auth/register", async (c) => {
    const body = await c.req.json();
    return c.json(await registerProcedure({ input: body, context: c }));
  });
```

## Generating Type-Safe Clients

oRPC automatically generates type-safe clients from server procedures:

```typescript
// packages/api/src/index.ts - oRPC router
import { oz } from "@orpc/zod";
import { authProcedures } from "./auth";
import { orgProcedures } from "./organization";

export const apiRouter = oz.router({
  auth: authProcedures,
  org: orgProcedures,
});

// Client usage (apps/web/app/lib/api.ts)
import { createClient } from "@orpc/client";
import type { apiRouter } from "@avantej-core/api";

export const api = createClient<typeof apiRouter>({
  baseURL: "http://localhost:3000",
});

// Fully type-safe calls
const result = await api.auth.register({
  email: "user@example.com",
  password: "secure123",
  name: "John Doe",
});
// result type is inferred automatically
```

## Testing

All endpoints have corresponding E2E tests in:
- `apps/web/tests/e2e/` (web app flows)
- `apps/native/tests/` (mobile app flows)
- `apps/server/tests/integration/` (API integration tests)
