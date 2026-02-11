# Avantej Server - Project Documentation

## Project Overview

The Avantej Server is a multi-tenant SaaS backend application built with **Hono** (web framework) and deployed on **Cloudflare Workers**. It provides a comprehensive platform for managing organizations, users, hierarchical structures, and subscriptions.

### Key Features

- **Multi-Tenant Architecture**: Each organization gets its own isolated PostgreSQL database (via Neon)
- **Authentication & Authorization**: Better-Auth integration with email verification, password reset, and RBAC
- **Hierarchical Organization Structure**: Support for country → region → area → branch hierarchy
- **Payment Integration**: Stripe webhooks for subscription management
- **Email Services**: Resend integration for transactional emails
- **Admin Panel**: Platform administration with tenant management and impersonation
- **Type-Safe APIs**: oRPC for type-safe RPC calls and REST endpoints

### Technology Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: Neon PostgreSQL (control panel + per-tenant databases)
- **ORM**: Drizzle ORM
- **Authentication**: Better-Auth
- **Email**: Resend
- **Payments**: Stripe
- **API**: oRPC + REST

---

## Project Structure

```
apps/server/
├── src/
│   ├── index.ts                    # Main application entry point
│   ├── routes/                     # REST API route handlers
│   │   ├── auth.routes.ts
│   │   ├── organizations.routes.ts
│   │   ├── hierarchy.routes.ts
│   │   ├── invitations.routes.ts
│   │   └── webhooks.routes.ts
│   ├── routers/                    # oRPC procedure routers
│   │   ├── auth.ts
│   │   ├── invitations.ts
│   │   └── admin.ts
│   ├── services/                   # Business logic services
│   │   ├── auth.service.ts
│   │   ├── admin.service.ts
│   │   ├── hierarchy.service.ts
│   │   ├── hierarchy-validation.service.ts
│   │   ├── payment.service.ts
│   │   ├── permission.service.ts
│   │   └── neon.service.ts
│   ├── middleware/                  # Request middleware
│   │   ├── auth.middleware.ts
│   │   ├── admin.middleware.ts
│   │   ├── db.middleware.ts
│   │   ├── tenant.middleware.ts
│   │   ├── hierarchy.middleware.ts
│   │   └── orpc-tenant.middleware.ts
│   └── lib/                        # Core libraries
│       ├── better-auth.ts
│       ├── db.ts
│       ├── email.ts
│       └── stripe.ts
├── scripts/                        # Utility scripts
└── package.json
```

---

## Main Entry Point

### `src/index.ts`

**Purpose**: Main application entry point that sets up the Hono app, middleware, routes, and oRPC handlers.

**Key Functions**:
- **App Setup**: Creates Hono app with CORS, logger, and database middleware
- **Route Registration**: Registers all REST API routes
- **oRPC Setup**: Configures oRPC and OpenAPI handlers
- **Better-Auth Integration**: Handles Better-Auth internal routes (`/api/auth/*`)

**Routes Configured**:
- `/auth/*` - Authentication routes
- `/orgs/*` - Organization routes
- `/orgs/:organizationId/hierarchy/*` - Hierarchy routes
- `/api/invitations/*` - Invitation email routes
- `/webhooks/*` - Webhook routes (Stripe)
- `/rpc/*` - oRPC procedures
- `/api-reference/*` - OpenAPI documentation
- `/` - Health check

---

## Routes (REST API)

### `src/routes/auth.routes.ts`

**Purpose**: Authentication endpoints following OpenAPI contract.

#### Functions:

1. **POST `/auth/register`**
   - Registers a new user account
   - Validates email, password (min 8 chars), and name
   - Uses Better-Auth for user creation
   - Sends verification email after registration
   - Returns: `{ userId, email, message }`

2. **POST `/auth/login`**
   - Authenticates user with email/password
   - Checks email verification status
   - Returns user's organizations list
   - Sets session cookies via Better-Auth
   - Returns: `{ accessToken, refreshToken, user, organizations }`

3. **POST `/auth/verify-email`**
   - Verifies email address using token
   - Calls `verifyEmailToken()` service
   - Returns: `{ message }`

4. **POST `/auth/reset-password`**
   - Requests password reset email
   - Always returns success (prevents email enumeration)
   - Returns: `{ message }`

5. **POST `/auth/reset-password/confirm`**
   - Confirms password reset with token
   - Validates new password (min 8 chars)
   - Calls `resetPassword()` service
   - Returns: `{ message }`

6. **POST `/auth/logout`**
   - Logs out user and invalidates session
   - Clears Better-Auth cookies
   - Requires: `authMiddleware`
   - Returns: `{ message }`

7. **POST `/auth/refresh`**
   - Refreshes access token
   - Uses Better-Auth session management
   - Returns: `{ accessToken }`

8. **GET `/auth/organizations`**
   - Gets current user's organizations
   - Requires: `authMiddleware`
   - Returns: `{ organizations: [{ id, name, slug, role }] }`

9. **GET `/auth/user-context`**
   - Gets complete user context (user, organizations, hierarchy, permissions)
   - Combines data from control panel and tenant databases
   - Requires: `authMiddleware`
   - Returns: `{ user, organizations, currentOrganizationId }`

---

### `src/routes/organizations.routes.ts`

**Purpose**: Organization lifecycle management endpoints.

#### Helper Functions:

- **`generateSlug(name: string): string`**
  - Converts organization name to URL-safe slug
  - Removes special characters, replaces spaces with hyphens

- **`validateSlug(slug: string): boolean`**
  - Validates slug format (lowercase letters, numbers, hyphens only)

- **`buildHierarchyTree(nodes): HierarchyTreeNode[]`**
  - Builds nested hierarchy tree from flat node list
  - Creates parent-child relationships

#### Functions:

1. **POST `/orgs`**
   - Creates new organization (requires active subscription)
   - Validates subscription exists and is active
   - Checks organization count limit
   - Provisions Neon project atomically
   - Runs tenant migrations and seeds RBAC data
   - Creates default hierarchy node (organization level)
   - Adds user as admin member
   - Requires: `authMiddleware`
   - Returns: `{ id, name, slug, neonBranchId, subscriptionId, status, createdAt }`

2. **GET `/orgs/:id`**
   - Gets organization details
   - Verifies user is a member
   - Requires: `authMiddleware`, `tenantMiddleware`
   - Returns: `{ id, name, slug, neonBranchId, subscriptionId, status, createdAt }`

3. **PATCH `/orgs/:id`**
   - Updates organization details (admin only)
   - Validates slug uniqueness
   - Requires: `authMiddleware`, `tenantMiddleware`, `hierarchyMiddleware`
   - Returns: Updated organization object

4. **DELETE `/orgs/:id`**
   - Deletes organization (admin only, cascade)
   - TODO: Delete Neon project via API
   - Requires: `authMiddleware`, `tenantMiddleware`, `hierarchyMiddleware`
   - Returns: `204 No Content`

5. **GET `/orgs/:id/context`**
   - Gets organization context (hierarchy tree, member role, accessible nodes)
   - Requires: `authMiddleware`, `tenantMiddleware`, `hierarchyMiddleware`
   - Returns: `{ organization, member, hierarchyTree, accessibleNodeIds }`

---

### `src/routes/hierarchy.routes.ts`

**Purpose**: Hierarchy node management endpoints.

#### Functions:

1. **POST `/orgs/:organizationId/hierarchy/nodes`**
   - Creates hierarchy node (country, region, area, branch)
   - Validates type and parent access
   - Checks permissions (`hierarchy_management:create`)
   - Requires: `authMiddleware`, `tenantMiddleware`, `hierarchyMiddleware`
   - Body: `{ type, name, code?, parentId? }`
   - Returns: `{ id, name, type, depth, parentId, createdAt, updatedAt }`

2. **GET `/orgs/:organizationId/hierarchy/nodes`**
   - Lists all hierarchy nodes in organization
   - Filters by accessible nodes (user's scope + descendants)
   - Requires: `authMiddleware`, `tenantMiddleware`, `hierarchyMiddleware`
   - Returns: `{ nodes: [...] }`

---

### `src/routes/invitations.routes.ts`

**Purpose**: Server-side wrapper for invitation email sending.

#### Functions:

1. **POST `/api/invitations/send-email`**
   - Sends invitation email via Resend
   - Constructs invitation link with frontend URL
   - Requires: `authMiddleware`
   - Body: `{ invitation, organizationId, organizationName?, inviterName? }`
   - Returns: `{ success, message }`

---

### `src/routes/webhooks.routes.ts`

**Purpose**: Handles external webhook events from Stripe.

#### Functions:

1. **POST `/webhooks/stripe`**
   - Handles Stripe webhook events
   - Verifies webhook signature
   - Processes events:
     - `checkout.session.completed` - Provisions organization
     - `customer.subscription.created` - Informational
     - `customer.subscription.updated` - Updates subscription status
     - `customer.subscription.deleted` - Handles cancellation
     - `invoice.payment_succeeded` - Ensures active payment status
     - `invoice.payment_failed` - Handles payment failure
   - Returns: `{ received: true }`

---

## Routers (oRPC Procedures)

### `src/routers/auth.ts`

**Purpose**: Type-safe authentication procedures via oRPC.

#### Functions:

1. **`auth.login`**
   - Sign in with email/password
   - Returns user info and organizations list
   - Input: `{ email, password }`
   - Returns: `{ accessToken, refreshToken, user, organizations }`

2. **`auth.userContext`**
   - Get current user's complete context
   - Includes user data, organizations, hierarchy, and permissions
   - Requires: Authentication (via middleware)
   - Returns: `{ user, organizations, currentOrganizationId }`

3. **`auth.verifyEmail`**
   - Verify email address via token
   - Input: `{ token }`
   - Returns: `{ message }`

---

### `src/routers/invitations.ts`

**Purpose**: Server-specific invitation procedures requiring email sending.

#### Functions:

1. **`invitations.sendEmail`**
   - Sends invitation email via Resend
   - Called after creating or resending an invitation
   - Requires: Authentication
   - Input: `{ invitation, organizationId, organizationName?, inviterName? }`
   - Returns: `{ success, message }`

---

### `src/routers/admin.ts`

**Purpose**: Platform administrator API endpoints.

#### Middleware:

- **`requireAdmin`**: Checks if user has platform admin record

#### Functions:

1. **`admin.listTenants`**
   - Lists all organizations with pagination and filters
   - Input: `{ status?, search?, page, limit }`
   - Returns: `{ data, pagination }`

2. **`admin.getTenant`**
   - Gets tenant details with subscription info and member count
   - Input: `{ id }`
   - Returns: Tenant details with subscription and hierarchy node count

3. **`admin.suspendTenant`**
   - Suspends organization
   - Input: `{ id, reason }`
   - Returns: Updated organization

4. **`admin.unsuspendTenant`**
   - Restores suspended organization
   - Input: `{ id }`
   - Returns: Updated organization

5. **`admin.startImpersonation`**
   - Starts impersonation session
   - Input: `{ userId, organizationId? }`
   - Returns: `{ impersonationToken, sessionId, expiresAt }`

6. **`admin.exitImpersonation`**
   - Ends impersonation session
   - Input: `{ sessionId }`
   - Returns: `{ success }`

7. **`admin.getAuditLogs`**
   - Gets audit logs (stub implementation)
   - Input: `{ organizationId?, userId?, action?, startDate?, endDate?, page, limit }`
   - Returns: `{ data: [], pagination }`

8. **`admin.getStats`**
   - Gets platform statistics
   - Returns: `{ totalOrganizations, activeOrganizations, suspendedOrganizations, totalUsers, totalMembers, activeSubscriptions }`

---

## Services (Business Logic)

### `src/services/auth.service.ts`

**Purpose**: Email verification and password reset functionality.

#### Functions:

1. **`sendVerificationEmail(userId, email, c?)`**
   - Sends email verification email
   - Uses Better-Auth API for token generation
   - Sends via Resend

2. **`verifyEmailToken(token, c?)`**
   - Verifies email token and updates user emailVerified flag
   - Validates JWT token
   - Returns user ID

3. **`sendPasswordResetEmail(email, c?)`**
   - Sends password reset email
   - Always returns success (prevents email enumeration)
   - Uses Better-Auth API

4. **`resetPassword(token, newPassword, c?)`**
   - Resets password using token
   - Validates token and updates password
   - Requires password min 8 characters

5. **`cleanupExpiredTokens(c?)`**
   - Cleans up expired verification tokens
   - Returns number of tokens deleted

---

### `src/services/admin.service.ts`

**Purpose**: Admin impersonation functionality.

#### Functions:

1. **`startImpersonation(adminUserId, targetUserId, organizationId?)`**
   - Creates impersonation session record
   - Generates impersonation token
   - Returns: `{ sessionId, token }`

2. **`endImpersonation(sessionId)`**
   - Marks impersonation session as ended
   - Sets endedAt timestamp

3. **`getActiveImpersonationSessions(adminUserId)`**
   - Gets active impersonation sessions for an admin
   - Returns array of active sessions

4. **`generateImpersonationToken(targetUserId, sessionToken)`** (private)
   - Generates token for impersonation
   - TODO: Integrate with Better-Auth admin plugin

---

### `src/services/hierarchy.service.ts`

**Purpose**: Utilities for working with organizational hierarchy trees.

#### Functions:

1. **`getDescendantNodeIds(tenantDb, nodeId)`**
   - Gets all descendant node IDs (including the node itself)
   - Uses PostgreSQL recursive CTE
   - Returns: Array of node IDs

2. **`getAncestorNodeIds(tenantDb, nodeId)`**
   - Gets all ancestor node IDs (including the node itself)
   - Traverses up the hierarchy tree
   - Returns: Array of node IDs

3. **`createHierarchyNode(tenantDb, params)`**
   - Creates hierarchy node with proper depth calculation
   - Does not perform validation (use validateHierarchyRules first)
   - Returns: Created node

---

### `src/services/hierarchy-validation.service.ts`

**Purpose**: Validates hierarchy rules for creating hierarchy nodes.

#### Types:

- **`HierarchyNodeType`**: `"organization" | "country" | "region" | "area" | "branch"`
- **`CreateHierarchyNodeParams`**: `{ type, name, code?, parentId? }`

#### Functions:

1. **`getDepthForType(type): number`**
   - Gets expected depth for a hierarchy node type
   - Organization: 0, Country: 1, Region: 2, Area: 3, Branch: 4
   - Returns: Depth number

2. **`getParentTypeForType(type): HierarchyNodeType | null`**
   - Gets expected parent type for a hierarchy node type
   - Returns: Parent type or null for organization

3. **`validateHierarchyRules(tenantDb, params): Promise<void>`**
   - Validates hierarchy rules for creating a node
   - Rules:
     1. Organization cannot have a parent
     2. Non-organization nodes must have a parent
     3. Parent exists and is correct type
     4. Parent depth matches expected depth
     5. No duplicate names within parent scope
   - Throws error if validation fails

4. **`validateParentAccess(parentId, accessibleNodeIds): void`**
   - Validates parent accessibility (within user's hierarchy scope)
   - Throws error if parent is not accessible

---

### `src/services/payment.service.ts`

**Purpose**: Stripe checkout completion and organization provisioning.

#### Helper Functions:

- **`determineTier(amountTotal)`: string**
  - Determines subscription tier from checkout amount
  - Returns: "basic", "professional", or "enterprise"

- **`getTierOrgLimit(tier): number`**
  - Gets organization count limit for tier
  - Enterprise: 10, Professional: 3, Basic: 1

- **`generateSlug(name): string`**
  - Generates URL-safe slug from name

- **`createTenantDbClient(connectionString)`**
  - Creates tenant database client from connection string

#### Functions:

1. **`handleCheckoutCompleted(session)`**
   - Handles Stripe checkout session completion
   - Idempotent: Returns existing organization if subscription ID exists
   - Process:
     1. Check idempotency
     2. Create subscription record
     3. Provision Neon project
     4. Encrypt connection string
     5. Create organization record
     6. Run tenant migrations
     7. Seed RBAC data
     8. Create default hierarchy node
     9. Add user as admin member
   - Returns: Created or existing organization

---

### `src/services/permission.service.ts`

**Purpose**: Permission checking utilities for RBAC.

#### Types:

- **`Resource`**: `"hierarchy_management" | "user_management" | "service_management" | "appointment_management"`
- **`Action`**: `"create" | "read" | "update" | "delete"`

#### Functions:

1. **`hasPermission(member, resource, action): boolean`**
   - Checks if member has specific permission
   - Current: Admin has all permissions, others have none
   - TODO: Implement RBAC table-based checks

2. **`checkHierarchyPermission(member, action?): boolean`**
   - Convenience function for hierarchy_management permissions
   - Default action: "create"

3. **`requirePermission(member, resource, action): void`**
   - Throws error if permission denied
   - Used for authorization checks

---

### `src/services/neon.service.ts`

**Purpose**: Neon project provisioning for tenant databases.

#### Functions:

1. **`createTenantProject(params, env?)`**
   - Creates new Neon project for tenant organization
   - Calls Neon API to create project
   - Fetches connection string from project
   - Returns: `{ projectId, connectionString }`
   - Environment: Uses `NEON_API_KEY`

2. **`deleteTenantProject(projectId, env?)`**
   - Deletes Neon project
   - Calls Neon API DELETE endpoint

---

## Middleware

### `src/middleware/auth.middleware.ts`

**Purpose**: Validates JWT session via Better-Auth.

#### Functions:

- **`authMiddleware`**
  - Validates user session using Better-Auth
  - Uses request-scoped Better-Auth instance
  - Injects into context: `user`, `session`
  - Returns 401 if no valid session

---

### `src/middleware/admin.middleware.ts`

**Purpose**: Checks platform admin access.

#### Functions:

- **`adminMiddleware`**
  - Validates user has platform administrator privileges
  - Checks `platform_admins` table
  - Injects into context: `adminRecord`, `adminRole`
  - Returns 403 if not admin

- **`superAdminMiddleware`**
  - Validates user has super_admin role
  - Returns 403 if not super admin

---

### `src/middleware/db.middleware.ts`

**Purpose**: Creates request-scoped database connection pools.

#### Functions:

- **`dbMiddleware`**
  - Creates request-scoped Pool for control panel database
  - Caches tenant pools within request
  - Injects into context: `controlPanelPool`, `controlPanelDb`, `tenantPools`, `getBetterAuth`
  - Cleans up pools after request completes
  - **Must be applied early** (before any database access)

---

### `src/middleware/tenant.middleware.ts`

**Purpose**: Resolves organization and injects tenant database connection.

#### Functions:

- **`tenantMiddleware`**
  - Resolves organization ID from:
    1. URL parameter (`:organizationId` or `:id`)
    2. Request header (`X-Organization-Id`)
    3. Session (`session.user.organizationId`)
  - Gets organization from control panel DB
  - Sets up tenant database connection
  - Injects into context: `organization`, `organizationId`, `tenantDb`
  - Requires: `authMiddleware` (must run after)
  - Returns 404 if organization not found

---

### `src/middleware/hierarchy.middleware.ts`

**Purpose**: Fetches user's member record and calculates accessible nodes.

#### Functions:

- **`hierarchyMiddleware`**
  - Gets user's member record from tenant DB
  - Calculates accessible hierarchy node IDs (scope + descendants)
  - Injects into context: `member`, `hierarchyScopeId`, `accessibleNodeIds`, `role`
  - Requires: `tenantMiddleware` (must run after)
  - Returns 403 if user not a member

---

### `src/middleware/orpc-tenant.middleware.ts`

**Purpose**: Sets up tenant DB for oRPC routes.

#### Functions:

- **`orpcTenantMiddleware`**
  - Extracts `organizationId` from oRPC request body
  - Sets up tenant DB context for oRPC handlers
  - Handles public invitation endpoints (no user session required)
  - Parses oRPC payload format (direct, wrapped, string-wrapped)
  - Injects into context: `organizationId`, `tenantDb`, `member`, `accessibleNodeIds`
  - Must run after `dbMiddleware` but before `createContext`

---

## Libraries

### `src/lib/better-auth.ts`

**Purpose**: Better-Auth configuration with Organization and Admin plugins.

#### Functions:

- **`createBetterAuth(c?)`**
  - Creates Better-Auth instance with request-scoped database
  - Configures email/password auth, email verification, sessions
  - Sets up Organization and Admin plugins
  - Uses Resend for email sending

- **`getBetterAuth(c?)`**
  - Gets request-scoped Better-Auth instance
  - Prefers request-scoped pool from context
  - Falls back to singleton for non-request contexts

**Configuration**:
- Email verification: Required
- Session expiry: 8 hours (development)
- Organization plugin: Enabled
- Admin plugin: Enabled (1 hour max impersonation)

---

### `src/lib/db.ts`

**Purpose**: Database client management for control panel and tenant databases.

#### Functions:

- **`getControlPanelDb(c?)`**
  - Gets control panel database client
  - Prefers request-scoped pool from context
  - Falls back to singleton pool (tests/scripts only)

- **`getTenantDb(organizationId, c?)`**
  - Gets tenant database client for organization
  - Looks up organization in control panel DB
  - Decrypts connection string
  - Uses request-scoped pool caching when context provided
  - Returns Drizzle client with tenant schemas

**Exports**:
- `controlPanelDb`: Singleton client (deprecated, use `getControlPanelDb(c)`)

---

### `src/lib/email.ts`

**Purpose**: Email sending functionality using Resend.

#### Functions:

1. **`sendEmail(options)`**
   - Sends email using Resend
   - Options: `{ to, subject, html, text?, from?, fromName? }`
   - Throws error if sending fails

2. **`sendVerificationEmail(to, verificationLink, userName?)`**
   - Sends email verification email
   - Constructs frontend URL with token
   - Records email capture (for testing)

3. **`sendPasswordResetEmail(to, resetLink, userName?)`**
   - Sends password reset email
   - Records email capture

4. **`sendInvitationEmail(to, invitationLink, organizationName, inviterName?, role?)`**
   - Sends organization invitation email
   - Records email capture

**Testing Utilities**:
- `__setEmailCaptureEnabled(enabled)`: Enable/disable email capture
- `__clearEmailCaptures()`: Clear captured emails
- `__getCapturedEmails(type?)`: Get captured emails

---

### `src/lib/stripe.ts`

**Purpose**: Stripe webhook signature verification.

#### Functions:

- **`verifyWebhookSignature(body, signature)`**
  - Verifies Stripe webhook signature
  - Uses Stripe SDK's `constructEvent`
  - Returns parsed Stripe event
  - Throws error if signature invalid

**Environment Variables**:
- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Webhook signing secret

---

## Scripts

The `scripts/` directory contains utility scripts for development and maintenance:

- `check-and-delete-user.ts`: Check and delete user utility
- `check-branch-data.ts`: Check branch data utility
- `cleanup-test-projects.ts`: Cleanup test Neon projects
- `clear-control-panel.ts`: Clear control panel data
- `inspect-and-cleanup-test-data.ts`: Inspect and cleanup test data
- `list-organizations.ts`: List all organizations
- `migrate-all-tenants.ts`: Run migrations on all tenant databases
- `migrate-existing-tenant.ts`: Migrate specific tenant
- `run-tenant-migrations.ts`: Run tenant migrations
- `seed-franchise-owner.ts`: Seed franchise owner data
- `verify-rbac.ts`: Verify RBAC setup
- `verify-user-org-relationship.ts`: Verify user-organization relationships

---

## Environment Variables

### Required

- `DATABASE_URL`: Control panel database connection string
- `BETTER_AUTH_SECRET`: Secret key for session encryption (min 32 chars)
- `BETTER_AUTH_URL`: Base URL for Better-Auth (e.g., `http://localhost:3000`)
- `CORS_ORIGIN`: Allowed CORS origin (e.g., `http://localhost:3001`)
- `RESEND_API_KEY`: Resend API key (starts with `re_`)
- `RESEND_FROM_EMAIL`: Sender email address (must be verified in Resend)
- `RESEND_FROM_NAME`: Sender name
- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret (starts with `whsec_`)
- `NEON_API_KEY`: Neon API key for project provisioning

### Optional

- `FRONTEND_URL`: Frontend URL (fallback for CORS_ORIGIN)
- `EMAIL_CAPTURE_ENABLED`: Enable email capture for testing (`"true"`)

---

## Database Architecture

### Control Panel Database

Single Neon project storing:
- **Better-Auth tables**: `user`, `session`, `account`, `verification`
- **Control Panel tables**: 
  - `organizations` - Organization metadata
  - `subscriptions` - Stripe subscription records
  - `organization_members` - User-organization membership registry
  - `platform_admins` - Platform administrator records
  - `admin_sessions` - Admin impersonation sessions

### Tenant Databases

Each organization has its own Neon project with:
- **Hierarchy tables**: `hierarchy_nodes` - Organization structure (country → region → area → branch)
- **Member tables**: `members` - Organization members with roles and hierarchy scope
- **Invitation tables**: `invitations` - Pending organization invitations
- **RBAC tables**: `roles`, `permissions`, `role_permissions` - Role-based access control

**Connection String Storage**: Encrypted in control panel database, decrypted on-demand.

---

## API Endpoints Summary

### REST Endpoints (19 total)

**Authentication** (`/auth/*`):
- POST `/auth/register`
- POST `/auth/login`
- POST `/auth/verify-email`
- POST `/auth/reset-password`
- POST `/auth/reset-password/confirm`
- POST `/auth/logout`
- POST `/auth/refresh`
- GET `/auth/organizations`
- GET `/auth/user-context`

**Organizations** (`/orgs/*`):
- POST `/orgs`
- GET `/orgs/:id`
- PATCH `/orgs/:id`
- DELETE `/orgs/:id`
- GET `/orgs/:id/context`

**Hierarchy** (`/orgs/:organizationId/hierarchy/*`):
- POST `/orgs/:organizationId/hierarchy/nodes`
- GET `/orgs/:organizationId/hierarchy/nodes`

**Invitations** (`/api/invitations/*`):
- POST `/api/invitations/send-email`

**Webhooks** (`/webhooks/*`):
- POST `/webhooks/stripe`

**Root**:
- GET `/` - Health check

### oRPC Procedures (39 total)

**Base Router**:
- `healthCheck`
- `privateData`

**Auth Router** (`auth.*`):
- `auth.login`
- `auth.userContext`
- `auth.verifyEmail`

**Hierarchy Router** (`hierarchy.*`):
- `hierarchy.createNode`
- `hierarchy.listNodes`
- `hierarchy.getNode`
- `hierarchy.updateNode`
- `hierarchy.deleteNode`
- `hierarchy.moveNode`
- `hierarchy.getDescendants`
- `hierarchy.listMembers`
- `hierarchy.reassignMember`
- `hierarchy.bulkReassignMembers`
- `hierarchy.listAllMembers`

**Invitation Router** (`invitations.*`):
- `invitations.create`
- `invitations.accept`
- `invitations.verifyEmailByToken`
- `invitations.getByToken`
- `invitations.decline`
- `invitations.list`
- `invitations.revoke`
- `invitations.resend`
- `invitations.sendEmail` (server-specific)

**Member Router** (`members.*`):
- `members.create`
- `members.getById`
- `members.updateRole`
- `members.suspend`
- `members.reactivate`
- `members.remove`

**Admin Router** (`admin.*`):
- `admin.listTenants`
- `admin.getTenant`
- `admin.suspendTenant`
- `admin.unsuspendTenant`
- `admin.startImpersonation`
- `admin.exitImpersonation`
- `admin.getAuditLogs`
- `admin.getStats`

---

## Security Features

1. **Authentication**: Better-Auth with email verification required
2. **Authorization**: RBAC with hierarchy-based scoping
3. **Password Security**: Minimum 8 characters, bcrypt hashing
4. **Session Management**: HTTP-only cookies, 8-hour expiry
5. **Email Enumeration Prevention**: Always returns success for password reset requests
6. **Webhook Security**: Stripe signature verification
7. **Database Encryption**: Connection strings encrypted at rest
8. **CORS**: Configured with credentials support
9. **Admin Impersonation**: Time-limited (1 hour), logged in audit table

---

## Deployment

### Cloudflare Workers

- **Runtime**: Cloudflare Workers (V8 isolates)
- **Database**: Neon PostgreSQL (serverless)
- **Build**: `wrangler deploy`
- **Development**: `wrangler dev --port=3000`

### Key Considerations

- **Request-Scoped Pools**: Cannot share database pools across requests in Workers
- **WebSocket Support**: Neon configured with WebSocket constructor for transactions
- **Environment Variables**: Set in `wrangler.jsonc` or Cloudflare dashboard
- **CORS**: Configured for frontend origin

---

## Testing

Test files located in:
- `src/**/*.test.ts` - Unit tests
- `src/**/*.integration.test.ts` - Integration tests
- `src/tests/integration/` - Integration test suites

Run tests:
- `bun test` - All tests
- `bun test:unit` - Unit tests only
- `bun test:integration` - Integration tests only

---

## Future Enhancements

1. **RBAC Implementation**: Full table-based permission system (currently admin-only)
2. **Audit Logging**: Complete audit log system (currently stub)
3. **Neon Project Deletion**: Delete Neon projects when organizations are deleted
4. **Subscription Management**: Handle subscription updates, cancellations, payment failures
5. **Better-Auth Admin Plugin**: Full integration for impersonation tokens
6. **Email Templates**: Customizable email templates
7. **Multi-Region Support**: Tenant database region selection
8. **Backup & Recovery**: Automated database backups

---

## Notes

- All database operations use request-scoped pools for Cloudflare Workers compatibility
- Better-Auth handles most authentication logic; this server provides API wrappers
- Tenant databases are provisioned on-demand via Neon API
- Hierarchy structure supports: Organization → Country → Region → Area → Branch
- Member access is scoped to their hierarchy node and all descendants
- Admin users have access to all nodes in their organization
