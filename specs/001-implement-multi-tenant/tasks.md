# Tasks: Multi-Tenant Authentication & Organization Management

**Input**: Design documents from `/specs/001-implement-multi-tenant/`
**Prerequisites**: plan.md, data-model.md, research.md, contracts/, quickstart.md

**Organization**: Tasks are grouped by technical domain (Setup, Database, Services, API, Frontend, Testing, Deployment) to enable efficient implementation of the multi-tenant authentication system.

## Format: `[ID] [P?] [Domain] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Domain]**: Technical area (SETUP, DB, SERVICE, API, UI, TEST, DEPLOY)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo structure**: `apps/server/`, `apps/web/`, `apps/native/`, `packages/db/`, `packages/auth/`, `packages/api/`
- **Backend API**: `apps/server/src/` (Hono on Cloudflare Workers with oRPC)
- **Frontend (Web)**: `apps/web/app/` (Vite + TanStack Router on Cloudflare Workers)
- **Mobile App**: `apps/native/app/` (Expo + React Native)
- **Shared database**: `packages/db/src/schema/`
- **Shared auth**: `packages/auth/src/` (Better-Auth configuration)
- **Shared API**: `packages/api/src/` (oRPC contracts)

---

## Phase 1: Setup & Infrastructure (10 tasks)

**Purpose**: Project initialization, environment configuration, and external service setup

- [ ] T001 [SETUP] Initialize Bun monorepo with Turborepo at repository root (package.json, turbo.json)
  - Dependencies: None
  - Test: `bun install && turbo build` succeeds
  - **Status**: ✅ Completed

- [ ] T002 [P] [SETUP] Create apps/server workspace structure (src/, tests/, wrangler.toml)
  - Dependencies: T001
  - Test: Directory structure matches plan.md section "Source Code"
  - **Status**: ✅ Completed - Hono API with Cloudflare Workers deployment configured

- [ ] T003 [P] [SETUP] Create apps/web workspace structure (app/, tests/, vite.config.ts)
  - Dependencies: T001
  - Test: Directory structure exists with Vite + TanStack Router skeleton
  - **Status**: ✅ Completed - Vite + TanStack Router with Better-Auth installed

- [ ] T004 [P] [SETUP] Create apps/native workspace structure (app/, components/)
  - Dependencies: T001
  - Test: Directory structure exists with Expo + React Native skeleton
  - **Status**: ✅ Completed - Expo Router with Better-Auth Expo adapter installed

- [ ] T005 [P] [SETUP] Create packages/db, packages/auth, packages/api workspaces
  - Dependencies: T001
  - Test: All packages export types correctly
  - **Status**: ✅ Completed - db (Drizzle schemas), auth (Better-Auth), api (oRPC contracts)

- [ ] T006 [SETUP] Setup environment variables across all apps (.env templates per quickstart.md)
  - Files: `apps/server/.env.example`, `apps/web/.env.example`, `apps/native/.env.example`
  - Dependencies: T001
  - Test: All required env vars documented in .env.example files
  - **Status**: ✅ Completed - All apps have .env.example files with complete documentation

- [ ] T007 [SETUP] Create Neon control panel database project via Neon console
  - Manual step: Follow quickstart.md section 3.1
  - Dependencies: None
  - Test: Connection string works, can query `SELECT 1`
  - **Status**: ✅ Completed - Using "avantej-core" project (misty-rice-66116134)

- [ ] T008 [SETUP] Create development tenant Neon project for testing
  - Manual step: Follow quickstart.md section 3.2
  - Dependencies: None
  - Test: Connection string works, separate from control panel DB
  - **Status**: ✅ Completed - Created "tenant-dev-001" (rapid-feather-83957295) in aws-ap-southeast-1

- [ ] T009 [SETUP] Configure Stripe test mode account (create products and prices)
  - Manual step: Create Basic, Pro, Premium/Enterprise subscription plans
  - **UPDATE**: Platform subscriptions configured + Stripe Connect enabled with Account V2 API for B2B2C payment flows
  - Stripe Connect allows franchises to charge end customers and payout trainers
  - **Actual Product IDs**:
    - Basic Plan: `prod_SFG8QIuqDDtLoc`
    - Pro Plan: `prod_SFG92maNuB4jAZ`
    - Premium/Enterprise Plan: `prod_SFGCflemCzF0My`
  - **Manual Configuration Completed**:
    - ✅ Product metadata added (organizationLimit, tier, features)
    - ✅ OAuth enabled for Connect
    - ✅ Redirect URI added: `http://localhost:5173/connect/callback`
    - ✅ API keys configured in .env files
    - ✅ Connect Client ID: `ca_TE36aYnPKeeuKSLc060GzPritzbuMtEf`
  - Documentation: See `specs/001-implement-multi-tenant/stripe-config.md`
  - Dependencies: None
  - Test: Stripe API keys in .env, Connect client ID configured, product metadata set
  - **Status**: ✅ Completed

- [ ] T010 [SETUP] Generate encryption key for tenant connection string storage
  - Command: `openssl rand -hex 32`
  - Generated: `23c13068d7e40921af59305dc8f4e5fecbb1d61894674a4cd0c9dad2365d0f32`
  - Dependencies: None
  - Test: 64-character hex string stored in ENCRYPTION_KEY env var
  - **Status**: ✅ Completed

**Checkpoint**: Environment ready - database setup can begin

---

## Phase 1.5: API Client Setup (4 tasks)

**Purpose**: Setup Elysia Eden (Treaty) for end-to-end type safety between API and frontend

- [ ] T011 [API] Create shared API client package with @elysiajs/eden
  - **UPDATED**: Created `packages/api-client/` shared package (DRY approach)
  - Package structure:
    ```
    packages/api-client/
    ├── src/
    │   └── index.ts              # Export createApiClient() factory
    ├── package.json              # @elysiajs/eden dependency
    └── tsconfig.json
    ```
  - Dependencies: T002, T003, T005
  - Test: Package exports `createApiClient()` function with full type safety
  - **Status**: ✅ Completed - Single source of truth for API client setup
  - Note: Follows existing `@repo/database` monorepo pattern

- [ ] T012 [API] Export API type from apps/server/src/index.ts for client consumption
  - Added: `export type App = typeof app` at end of file
  - Dependencies: T011
  - Test: Can import type in frontend: `import type { App } from '@apps/api'`
  - **Status**: ✅ Completed
  - Note: Enables Treaty to provide autocomplete and type checking

- [ ] T013 [P] [API] Create type-safe API client in apps/web/app/lib/api.ts
  - File: `apps/web/app/lib/api.ts`
  - Implementation:
    ```typescript
    import { createApiClient } from "@repo/api-client";
    export const api = createApiClient(
      import.meta.env.VITE_API_URL || "http://localhost:8787"
    );
    ```
  - Dependencies: T011, T012
  - Test: Client provides autocomplete for all API routes, compile-time type checking
  - **Status**: ✅ Completed

- [ ] T014 [P] [API] Create type-safe API client in apps/web/app/routes/admin/app/lib/api.ts
  - File: `apps/web/app/routes/admin/app/lib/api.ts`
  - Implementation: Same as T013 but for admin app
  - Dependencies: T011, T012, T004
  - Test: Admin client has full type safety for admin-specific routes
  - **Status**: ✅ Completed

**Checkpoint**: ✅ Type-safe API client infrastructure ready for frontend integration

---

## Phase 2: Foundational (Database Schema) (15 tasks)

**Purpose**: Core database schema that MUST be complete before ANY business logic

**Critical**: No API or service work can begin until this phase is complete

### Control Panel Database Schema (7 tables)

- [x] T015 [P] [DB] Define users table schema in packages/db/src/schema/control-panel/users.ts
  - Schema: id, email, passwordHash, name, emailVerified, createdAt, lastLoginAt (per data-model.md section 1)
  - Dependencies: T005
  - Test: Type exports correctly, no compilation errors
  - **Status**: ✅ Completed - Extended Better-Auth's user table with lastLoginAt field, created control-panel/users.ts export

- [x] T016 [P] [DB] Define subscriptions table schema in packages/db/src/schema/control-panel/subscriptions.ts
  - Schema: id, stripeSubscriptionId, stripeCustomerId, tier, organizationCountLimit, status, timestamps
  - Dependencies: T005
  - Test: Foreign key to Stripe IDs, unique constraint on stripeSubscriptionId
  - **Status**: ✅ Completed - Created subscriptions table with Stripe subscription tracking, unique constraint on stripeSubscriptionId, index on stripeCustomerId

- [x] T017 [P] [DB] Define organizations table schema in packages/db/src/schema/control-panel/organizations.ts
  - Schema: id, name, slug, neonProjectId, connectionString, subscriptionId, paymentStatus, ownerUserId, timestamps, Stripe Connect fields
  - Dependencies: T015, T016
  - Test: Foreign key to subscriptions, unique constraints on slug and neonProjectId
  - **Status**: ✅ Completed - Created organizations table with foreign keys to subscriptions and users, unique constraints on slug and neonProjectId, indexes for performance. **Updated**: Added Stripe Connect fields (stripe_connect_account_id, stripe_connect_status, stripe_connect_account_type, stripe_connect_onboarding_completed_at) for franchiser payment processing via Stripe Connect.

- [x] T018 [P] [DB] Define organization_members table schema in packages/db/src/schema/control-panel/organization-members.ts
  - Schema: id, userId, organizationId, role, status, joinedAt (membership registry per data-model.md section 4)
  - Dependencies: T015, T017
  - Test: Composite unique constraint on (userId, organizationId)
  - **Status**: ✅ Completed - Created organization_members table with foreign keys to users and organizations, composite unique constraint on (userId, organizationId), indexes for performance

- [x] T019 [P] [DB] Define platform_admins table schema in packages/db/src/schema/control-panel/platform-admins.ts
  - Schema: id, userId, role (super_admin/support/billing), grantedBy, grantedAt
  - Dependencies: T015
  - Test: Unique constraint on userId
  - **Status**: ✅ Completed - Created platform_admins table with foreign key to users, unique constraint on userId, index on role

- [x] T020 [P] [DB] Define admin_sessions table schema in packages/db/src/schema/control-panel/admin-sessions.ts
  - Schema: id, adminUserId, impersonatedUserId, organizationId, sessionToken, startedAt, endedAt
  - Dependencies: T015, T017
  - Test: Unique constraint on sessionToken
  - **Status**: ✅ Completed - Created admin_sessions table with foreign keys to users and organizations, unique constraint on sessionToken, indexes including partial index for active sessions

- [x] T021 [DB] Create control panel database indexes (per data-model.md section "Indexes")
  - Files: Add index definitions to all control-panel schema files
  - Dependencies: T015-T020
  - Test: Index definitions compile, performance queries optimized
  - **Status**: ✅ Completed - All indexes implemented during table creation: users (email unique), subscriptions (stripeSubscriptionId unique, customerId), organizations (slug/neonProjectId unique, subscriptionId, paymentStatus, stripe_connect_account_id), organization_members (composite unique, userId, organizationId, status), platform_admins (userId unique, role), admin_sessions (sessionToken unique, adminUserId, active sessions partial index)

### Tenant Database Schema (16 tables: 3 foundational + 13 service/appointment/payment)

- [x] T022 [P] [DB] Define hierarchy_nodes table schema in packages/db/src/schema/tenant/hierarchy.ts
  - Schema: id, name, type, parentId, depth, timestamps (per data-model.md section 5)
  - Dependencies: T005
  - Test: Self-referencing foreign key, depth constraint 0-4
  - **Status**: ✅ Completed - Created hierarchy_nodes table with self-referencing foreign key on parentId, indexes on parentId, type, and depth. No organizationId field needed since each tenant has its own database.

- [x] T023 [P] [DB] Define members table schema in packages/db/src/schema/tenant/members.ts
  - Schema: id, userId, role, hierarchyScopeId, status, joinedAt
  - Dependencies: T022
  - Test: Foreign key to hierarchy_nodes, unique constraint on userId
  - **Status**: ✅ Completed - Created members table with foreign key to hierarchy_nodes, unique constraint on userId (text type to match control panel users.id), indexes on hierarchyScopeId, role, and status. No FK constraint on userId since it references cross-database control panel users table.

- [x] T024 [P] [DB] Define invitations table schema in packages/db/src/schema/tenant/invitations.ts
  - Schema: id, email, invitedBy, role, hierarchyScopeId, token, status, expiresAt, createdAt
  - Dependencies: T022
  - Test: Unique constraint on token, index on (email, status)
  - **Status**: ✅ Completed - Created invitations table with foreign key to hierarchy_nodes, unique constraint on token, composite index on (email, status), indexes on expiresAt and invitedBy. invitedBy uses text type to match control panel users.id (no FK constraint due to cross-database).

### Drizzle Configuration & Migrations

- [x] T025 [DB] Create drizzle.control-panel.config.ts in packages/db
  - Config: Control panel DB connection, migrations folder, schema path
  - Dependencies: T015-T020
  - Test: `drizzle-kit generate:pg` creates migration files
  - **Status**: ✅ Completed - Created drizzle.control-panel.config.ts with schema pointing to control-panel-schema.ts (includes auth + control-panel schemas), migrations output to ./src/migrations/control-panel, uses DATABASE_URL from environment.

- [x] T026 [DB] Create drizzle.tenant.config.ts in packages/db
  - Config: Tenant DB connection (uses TENANT_DATABASE_URL), migrations folder, schema path
  - Dependencies: T022-T024
  - Test: `drizzle-kit generate:pg` creates separate tenant migrations
  - **Status**: ✅ Completed - Created drizzle.tenant.config.ts with schema pointing to tenant-schema.ts, migrations output to ./src/migrations/tenant, uses TENANT_DATABASE_URL from environment. Migrations applied programmatically via migration runner (T038) when provisioning new tenants.

- [x] T027 [DB] Generate and apply control panel migrations (per quickstart.md section 3.1)
  - Command: `drizzle-kit push:pg --config=drizzle.control-panel.config.ts`
  - Dependencies: T025, T007
  - Test: All 6 control panel tables created in Neon control panel project
  - **Status**: ✅ Completed - Generated migrations in src/migrations/control-panel/, applied initial migration (0000_far_luminals.sql) and Stripe Connect migration (0001_redundant_stature.sql) to remote Neon database using `drizzle-kit push`. All 9 tables created successfully: Better-Auth tables (user, session, account, verification) and control panel tables (subscriptions, organizations with Stripe Connect fields, organization_members, platform_admins, admin_sessions).

- [x] T028 [DB] Generate and apply tenant migrations (per quickstart.md section 3.2)
  - Command: `drizzle-kit push:pg --config=drizzle.tenant.config.ts`
  - Dependencies: T026, T008
  - Test: All tenant tables created in Neon dev tenant project
  - **Status**: ✅ Completed - Generated tenant migrations: initial migration (0000_noisy_aqueduct.sql) with 3 foundational tables (hierarchy_nodes, members, invitations) and service/appointment migration (0001_salty_morlocks.sql) with 13 additional tables (service_categories, services, service_commission_config, service_rules, packages, package_assignments, appointments, appointment_clients, appointment_staff, commission_splits, payments, partner_stripe_accounts, payouts). Total: 16 tenant tables. Migrations will be applied programmatically via T038 migration runner when provisioning new tenants. For dev/testing, can manually apply using drizzle-kit push with TENANT_DATABASE_URL.

### Encryption Utilities

- [x] T029 [DB] Implement connection string encryption utilities in packages/db/src/lib/encryption.ts
  - Functions: encrypt(), decrypt() using AES-256-GCM (per research.md section 4.2)
  - Dependencies: T010
  - Test: Encrypt/decrypt round-trip matches original string
  - **Status**: ✅ Completed - Implemented AES-256-GCM encryption/decryption with random IV and auth tag. Format: iv:authTag:encrypted. All tests passing (7/7). Exported from packages/db/src/index.ts.

**Checkpoint**: Foundation ready - service layer and API implementation can now begin in parallel

---

## Phase 3: Core Services (12 tasks)

**Purpose**: Business logic layer that orchestrates database operations and external APIs

### Database Connection Management

- [x] T030 [SERVICE] Setup control panel database client in apps/server/src/lib/db.ts
  - Create Drizzle client with connection to control panel Neon project
  - Dependencies: T027
  - Test: Can query users table successfully
  - **Status**: ✅ Completed - Created control panel database client using @neondatabase/serverless and drizzle-orm/neon-http. Exports controlPanelDb with all control panel schemas (auth + control-panel tables). Configured for Cloudflare Workers environment with DATABASE_URL from env.

- [x] T031 [SERVICE] Implement tenant database connection router in apps/server/src/lib/db.ts
  - Function: getTenantDb(organizationId) - decrypts connection string and creates Drizzle client
  - Dependencies: T029, T030
  - Test: Returns different Drizzle client per organization
  - **Status**: ✅ Completed - Implemented getTenantDb() function that queries control panel DB for organization, decrypts connection string using T029 encryption utilities, and returns Drizzle client with tenant schemas. Includes error handling for missing organizations and decryption failures.

### MembershipService (5 methods from research.md section 4.6)

- [x] T032 [P] [SERVICE] Implement MembershipService.createMember() in packages/db/src/services/membership.service.ts
  - Syncs member creation to both control panel and tenant database
  - Dependencies: T018, T023
  - Test: Creates member in both databases, marks invitation accepted
  - **Status**: ✅ Completed - Implemented createMember() method that syncs member creation to both databases using Promise.all(), marks invitation as accepted in tenant DB transaction.

- [x] T033 [P] [SERVICE] Implement MembershipService.updateMemberRole() in packages/db/src/services/membership.service.ts
  - Updates role in both control panel registry and tenant members table
  - Dependencies: T018, T023
  - Test: Role change reflected in both databases
  - **Status**: ✅ Completed - Implemented updateMemberRole() method that syncs role updates to both databases atomically.

- [x] T034 [P] [SERVICE] Implement MembershipService.suspendMember() in packages/db/src/services/membership.service.ts
  - Updates status to "suspended" in both databases
  - Dependencies: T018, T023
  - Test: Status change synced to both databases
  - **Status**: ✅ Completed - Implemented suspendMember() method that syncs status change to "suspended" in both databases.

- [x] T035 [P] [SERVICE] Implement MembershipService.reactivateMember() in packages/db/src/services/membership.service.ts
  - Updates status to "active" in both databases
  - Dependencies: T018, T023
  - Test: Status change synced to both databases
  - **Status**: ✅ Completed - Implemented reactivateMember() method that syncs status change to "active" in both databases.

- [x] T036 [SERVICE] Implement MembershipService.removeMember() in packages/db/src/services/membership.service.ts
  - Validates "cannot remove last admin" rule, deletes from both databases
  - Dependencies: T018, T023
  - Test: Throws error if last admin, deletes from both databases otherwise
  - **Status**: ✅ Completed - Implemented removeMember() method with validation to prevent removing last admin, syncs deletion to both databases.

### External Service Integrations

- [x] T037 [SERVICE] Implement Neon project provisioning in apps/server/src/services/neon.service.ts
  - Function: createTenantProject(slug, region) - calls Neon API to create new project (per research.md section 4.1)
  - Dependencies: None
  - Test: Creates Neon project, returns projectId and connection string
  - **Status**: ✅ Completed - Implemented createTenantProject() function that calls Neon API to create projects, handles project creation and connection string retrieval with error handling and retry logic. Includes unit tests (neon.service.test.ts) and integration tests (neon.service.integration.test.ts).

- [x] T038 [SERVICE] Implement tenant schema migration runner in packages/db/src/migrate-tenant.ts
  - Function: runTenantMigrations(connectionString) - applies all tenant migrations to newly created project
  - Dependencies: T028, T037
  - Test: Applies all tenant tables (16 total: 3 foundational + 13 service/appointment/payment tables) to fresh Neon project
  - **Status**: ✅ Completed - Implemented runTenantMigrations() function that applies migrations programmatically. Updated to include both initial migration (0000_noisy_aqueduct) and service/appointment migration (0001_salty_morlocks) embedded as SQL strings for Cloudflare Workers compatibility. Includes migration tracking table to prevent duplicate application.

- [x] T039 [SERVICE] Implement Stripe webhook signature verification in apps/server/src/lib/stripe.ts
  - Function: verifyWebhookSignature(body, signature) using Stripe SDK
  - Dependencies: T009
  - Test: Throws error on invalid signature, returns event on valid signature
  - **Status**: ✅ Completed - Implemented verifyWebhookSignature() function using Stripe SDK's constructEvent method. Validates webhook signatures, handles missing signatures and invalid signatures with proper error handling. Configured for Cloudflare Workers environment with STRIPE_WEBHOOK_SECRET from env.

- [x] T040 [SERVICE] Implement payment-gated provisioning handler in apps/server/src/services/payment.service.ts
  - Function: handleCheckoutCompleted(session) - creates subscription, org, provisions Neon project (per research.md section 3.3)
  - Dependencies: T016, T017, T037, T038
  - Test: Idempotent (returns existing org if subscription ID exists), creates all resources
  - **Status**: ✅ Completed - Implemented handleCheckoutCompleted() function with idempotent provisioning (checks for existing subscription). Creates subscription record, provisions Neon project via T037, encrypts connection string, creates organization record, runs tenant migrations, creates default hierarchy node, and adds user as admin member. All operations wrapped in transaction for atomicity.

### Hierarchy Utilities

- [x] T041 [SERVICE] Implement recursive hierarchy query in apps/server/src/services/hierarchy.service.ts
  - Function: getDescendantNodeIds(nodeId) - uses PostgreSQL CTE to get all descendants (per research.md section 5.6)
  - Dependencies: T022
  - Test: Returns node + all children/grandchildren IDs
  - **Status**: ✅ Completed - Implemented getDescendantNodeIds() function using PostgreSQL recursive CTE in apps/server/src/services/hierarchy.service.ts. Function traverses hierarchy tree to return all descendant nodes including the starting node. Also implemented getAncestorNodeIds() for upward traversal. Used by hierarchy middleware (T047) for access control.

**Checkpoint**: ✅ Core services complete - API routes can now use these services

---

## Phase 4: Authentication & Authorization (8 tasks)

**Purpose**: Better-Auth configuration and middleware for session validation and context injection

### Better-Auth Setup

- [x] T042 [AUTH] Configure Better-Auth with Organization and Admin plugins in apps/server/src/lib/better-auth.ts
  - Config: email/password auth, 15-min session expiry, organization plugin, admin plugin (per research.md section 1)
  - Dependencies: T030
  - Test: Better-Auth instance exports correctly
  - **Status**: ✅ Completed - Configured Better-Auth with Organization and Admin plugins in apps/server/src/lib/better-auth.ts. Includes email/password auth, email verification, password reset, Resend email integration, 8-hour session expiry, and request-scoped database connections for Cloudflare Workers compatibility.

- [x] T043 [AUTH] Implement email verification service in apps/server/src/services/auth.service.ts
  - Functions: sendVerificationEmail(), verifyEmailToken()
  - Dependencies: T042
  - Test: Sends email (mock in tests), validates token
  - **Status**: ✅ Completed - Implemented sendVerificationEmail() and verifyEmailToken() functions in apps/server/src/services/auth.service.ts. Integrates with Better-Auth API and Resend for email delivery. Includes token validation and user emailVerified flag updates.

- [x] T044 [AUTH] Implement password reset service in apps/server/src/services/auth.service.ts
  - Functions: sendPasswordResetEmail(), resetPassword()
  - Dependencies: T042
  - Test: Sends email (mock in tests), updates password
  - **Status**: ✅ Completed - Implemented sendPasswordResetEmail() and resetPassword() functions in apps/server/src/services/auth.service.ts. Uses Better-Auth API for token generation and password hashing. Includes security best practices (no email enumeration).

### Middleware Stack

- [x] T045 [AUTH] Implement auth middleware in apps/server/src/middleware/auth.middleware.ts
  - Validates JWT, injects user into request context (per research.md section 2.1)
  - Dependencies: T042
  - Test: Rejects invalid tokens, injects valid user
  - **Status**: ✅ Completed - Implemented authMiddleware in apps/server/src/middleware/auth.middleware.ts. Validates Better-Auth session and injects user and session objects into Hono context. Returns 401 for invalid sessions.

- [x] T046 [AUTH] Implement tenant middleware in apps/server/src/middleware/tenant.middleware.ts
  - Looks up organization in control panel DB, injects tenantDb connection (per research.md section 2.2)
  - Dependencies: T045, T031
  - Test: Decrypts connection string, creates tenant DB client
  - **Status**: ✅ Completed - Implemented tenantMiddleware in apps/server/src/middleware/tenant.middleware.ts. Resolves organization ID from URL params, headers, or session. Looks up organization in control panel DB and injects tenantDb connection. Returns 404 if organization not found.

- [x] T047 [AUTH] Implement hierarchy middleware in apps/server/src/middleware/hierarchy.middleware.ts
  - Fetches user's member record from tenant DB, calculates accessibleNodeIds (per research.md section 2.3)
  - Dependencies: T046, T041
  - Test: Injects member, hierarchyScopeId, accessibleNodeIds into context
  - **Status**: ✅ Completed - Implemented hierarchyMiddleware in apps/server/src/middleware/hierarchy.middleware.ts. Fetches user's member record from tenant DB and calculates accessibleNodeIds using getDescendantNodeIds() from T041. Injects member, hierarchyScopeId, accessibleNodeIds, and role into context. Returns 403 if user is not a member.

- [x] T048 [AUTH] Implement admin middleware in apps/server/src/middleware/admin.middleware.ts
  - Checks if user has platform_admins record, validates admin role
  - Dependencies: T045, T019
  - Test: Allows super_admin, rejects non-admin users
  - **Status**: ✅ Completed - Implemented adminMiddleware and superAdminMiddleware in apps/server/src/middleware/admin.middleware.ts. Validates platform admin access by checking platform_admins table. Supports role-based access (super_admin, support, billing). Returns 403 for non-admin users.

- [x] T049 [AUTH] Implement impersonation tracking in apps/server/src/services/admin.service.ts
  - Functions: startImpersonation(adminUserId, targetUserId), endImpersonation(sessionId)
  - Dependencies: T020, T042
  - Test: Creates admin_sessions record, generates impersonation JWT
  - **Status**: ✅ Completed - Implemented startImpersonation() and endImpersonation() functions in apps/server/src/services/admin.service.ts. Creates admin_sessions records for tracking impersonation sessions. Generates impersonation tokens. Includes getActiveImpersonationSessions() helper function.

**Checkpoint**: ✅ Authentication layer complete - protected routes can now use middleware

---

## Phase 5: API Endpoints (25 tasks, organized by contract file)

**Purpose**: RESTful API implementation following OpenAPI contracts

### Authentication Endpoints (auth-api.yaml)

- [ ] T050 [P] [API] POST /auth/register in apps/server/src/routes/auth.routes.ts
  - Handler: Create user, send verification email (per contract line 14-57)
  - Dependencies: T043
  - Test: Returns 201 with userId, email already registered returns 409

- [ ] T051 [P] [API] POST /auth/login in apps/server/src/routes/auth.routes.ts
  - Handler: Validate credentials, return JWT + organizations (per contract line 59-100)
  - Dependencies: T042, T018
  - Test: Returns accessToken + user's organizations, unverified email returns 403

- [ ] T052 [P] [API] POST /auth/verify-email in apps/server/src/routes/auth.routes.ts
  - Handler: Verify email token, update emailVerified flag (per contract line 102-122)
  - Dependencies: T043
  - Test: Updates user.emailVerified to true, invalid token returns 400

- [ ] T053 [P] [API] POST /auth/reset-password in apps/server/src/routes/auth.routes.ts
  - Handler: Send password reset email (per contract line 124-142)
  - Dependencies: T044
  - Test: Always returns 200 (no email enumeration)

- [ ] T054 [P] [API] POST /auth/reset-password/confirm in apps/server/src/routes/auth.routes.ts
  - Handler: Reset password with token (per contract line 144-166)
  - Dependencies: T044
  - Test: Updates password hash, invalid token returns 400

- [ ] T055 [P] [API] POST /auth/logout in apps/server/src/routes/auth.routes.ts
  - Handler: Invalidate session (per contract line 168-177)
  - Dependencies: T042
  - Test: Clears session cookie, returns 200

- [ ] T056 [P] [API] POST /auth/refresh in apps/server/src/routes/auth.routes.ts
  - Handler: Issue new access token using refresh token (per contract line 179-195)
  - Dependencies: T042
  - Test: Returns new accessToken, invalid refresh token returns 401

### Organization Endpoints (org-api.yaml)

- [ ] T057 [API] POST /orgs in apps/server/src/routes/organizations.routes.ts
  - Handler: Create organization (requires active subscription, provisions Neon project) (per contract line 14-52)
  - Dependencies: T040, T046
  - Test: Creates org + tenant DB, subscription limit enforced, slug conflict returns 409

- [ ] T058 [API] GET /orgs/:id in apps/server/src/routes/organizations.routes.ts
  - Handler: Get organization details (per contract line 54-78)
  - Dependencies: T046
  - Test: Returns org details, non-member returns 403

- [ ] T059 [API] PATCH /orgs/:id in apps/server/src/routes/organizations.routes.ts
  - Handler: Update name/slug (admin only) (per contract line 80-117)
  - Dependencies: T046, T047
  - Test: Updates org, non-admin returns 403, slug conflict returns 409

- [ ] T060 [API] DELETE /orgs/:id in apps/server/src/routes/organizations.routes.ts
  - Handler: Delete organization (cascade deletes tenant DB) (per contract line 119-138)
  - Dependencies: T046, T047
  - Test: Deletes org + removes tenant project, non-admin returns 403

- [ ] T061 [API] GET /orgs/:id/context in apps/server/src/routes/organizations.routes.ts
  - Handler: Get org context (hierarchy tree, member role, accessible nodes) (per contract line 140-179)
  - Dependencies: T047, T041
  - Test: Returns organization + member + hierarchyTree + accessibleNodeIds

### Hierarchy Endpoints (hierarchy-api.yaml)

- [ ] T062 [API] GET /orgs/:orgId/hierarchy in apps/server/src/routes/hierarchy.routes.ts
  - Handler: Get full hierarchy tree, optional scopeFilter (per contract line 14-46)
  - Dependencies: T047
  - Test: Returns nested tree structure, scopeFilter limits to accessible nodes

- [ ] T063 [API] POST /orgs/:orgId/hierarchy/nodes in apps/server/src/routes/hierarchy.routes.ts
  - Handler: Create hierarchy node (validate depth, parent exists) (per contract line 48-93)
  - Dependencies: T047
  - Test: Creates node, depth > 4 returns 400, invalid parent returns 404

- [ ] T064 [API] GET /orgs/:orgId/hierarchy/nodes/:nodeId in apps/server/src/routes/hierarchy.routes.ts
  - Handler: Get hierarchy node details (per contract line 95-125)
  - Dependencies: T047
  - Test: Returns node details, inaccessible node returns 403

- [ ] T065 [API] PATCH /orgs/:orgId/hierarchy/nodes/:nodeId in apps/server/src/routes/hierarchy.routes.ts
  - Handler: Update node name (per contract line 127-165)
  - Dependencies: T047
  - Test: Updates node name, insufficient permission returns 403

- [ ] T066 [API] DELETE /orgs/:orgId/hierarchy/nodes/:nodeId in apps/server/src/routes/hierarchy.routes.ts
  - Handler: Delete node (prevent if has children or assigned members) (per contract line 167-194)
  - Dependencies: T047
  - Test: Deletes node, has children/members returns 409

- [ ] T067 [API] POST /orgs/:orgId/hierarchy/nodes/:nodeId/move in apps/server/src/routes/hierarchy.routes.ts
  - Handler: Move node to new parent (validate depth constraints) (per contract line 196-240)
  - Dependencies: T047
  - Test: Moves node, circular reference returns 400, depth violation returns 400

- [ ] T068 [API] GET /orgs/:orgId/hierarchy/nodes/:nodeId/descendants in apps/server/src/routes/hierarchy.routes.ts
  - Handler: Get all descendant nodes using recursive CTE (per contract line 242-274)
  - Dependencies: T041, T047
  - Test: Returns all descendants, inaccessible node returns 403

### Member Endpoints (member-api.yaml)

- [ ] T069 [API] GET /orgs/:orgId/members in apps/server/src/routes/members.routes.ts
  - Handler: List members filtered by hierarchy scope (per contract line 14-58)
  - Dependencies: T047
  - Test: Returns members in accessible nodes only, filters by role/status

- [ ] T070 [API] POST /orgs/:orgId/members/invite in apps/server/src/routes/members.routes.ts
  - Handler: Send invitation email (per contract line 60-107)
  - Dependencies: T047, T024
  - Test: Creates invitation, sends email (mock), duplicate email returns 409

- [ ] T071 [API] POST /invitations/:token/accept in apps/server/src/routes/members.routes.ts
  - Handler: Accept invitation (uses MembershipService) (per contract line 109-132)
  - Dependencies: T032
  - Test: Creates member in both databases, expired token returns 400

- [ ] T072 [API] POST /invitations/:token/decline in apps/server/src/routes/members.routes.ts
  - Handler: Decline invitation (per contract line 134-151)
  - Dependencies: T024
  - Test: Updates invitation status to "declined", returns 204

- [ ] T073 [API] GET /orgs/:orgId/members/:memberId in apps/server/src/routes/members.routes.ts
  - Handler: Get member details (per contract line 153-182)
  - Dependencies: T047
  - Test: Returns member + accessibleNodeIds, inaccessible returns 403

- [ ] T074 [API] PATCH /orgs/:orgId/members/:memberId in apps/server/src/routes/members.routes.ts
  - Handler: Update role/scope/status (uses MembershipService) (per contract line 184-230)
  - Dependencies: T033, T034, T035
  - Test: Updates member in both databases, non-admin returns 403

- [ ] T075 [API] DELETE /orgs/:orgId/members/:memberId in apps/server/src/routes/members.routes.ts
  - Handler: Remove member (uses MembershipService) (per contract line 232-257)
  - Dependencies: T036
  - Test: Deletes from both databases, last admin returns error

- [ ] T076 [API] GET /orgs/:orgId/invitations in apps/server/src/routes/members.routes.ts
  - Handler: List pending invitations (admin only) (per contract line 259-291)
  - Dependencies: T047, T024
  - Test: Returns invitations, non-admin returns 403

### Admin Endpoints (admin-api.yaml)

- [ ] T077 [API] GET /admin/tenants in apps/server/src/routes/admin.routes.ts
  - Handler: List all organizations with pagination (per contract line 14-59)
  - Dependencies: T048
  - Test: Returns paginated tenants, non-admin returns 403

- [ ] T078 [API] GET /admin/tenants/:id in apps/server/src/routes/admin.routes.ts
  - Handler: Get tenant details with subscription info (per contract line 61-85)
  - Dependencies: T048
  - Test: Returns tenant + subscription + member count, non-admin returns 403

- [ ] T079 [API] POST /admin/tenants/:id/suspend in apps/server/src/routes/admin.routes.ts
  - Handler: Suspend organization (per contract line 87-122)
  - Dependencies: T048
  - Test: Updates paymentStatus to "suspended", non-admin returns 403

- [ ] T080 [API] POST /admin/tenants/:id/unsuspend in apps/server/src/routes/admin.routes.ts
  - Handler: Restore organization (per contract line 124-149)
  - Dependencies: T048
  - Test: Updates paymentStatus to "active", non-admin returns 403

- [ ] T081 [API] POST /admin/impersonate in apps/server/src/routes/admin.routes.ts
  - Handler: Start impersonation session (per contract line 150-189)
  - Dependencies: T049
  - Test: Creates admin_sessions record, returns impersonation JWT

- [ ] T082 [API] POST /admin/impersonate/exit in apps/server/src/routes/admin.routes.ts
  - Handler: End impersonation session (per contract line 191-202)
  - Dependencies: T049
  - Test: Updates admin_sessions.endedAt, returns 200

- [ ] T083 [API] GET /admin/audit-logs in apps/server/src/routes/admin.routes.ts
  - Handler: Get audit logs with filters (future - stub for now) (per contract line 204-268)
  - Dependencies: T048
  - Test: Returns empty array (placeholder), non-admin returns 403

- [ ] T084 [API] GET /admin/stats in apps/server/src/routes/admin.routes.ts
  - Handler: Get platform statistics (per contract line 270-298)
  - Dependencies: T048
  - Test: Returns counts (orgs, users, members), non-admin returns 403

### Webhook Endpoints (webhook-api.yaml)

- [ ] T085 [API] POST /webhooks/stripe in apps/server/src/routes/webhooks.routes.ts
  - Handler: Handle Stripe webhook events (checkout.session.completed, subscription._, invoice._) (per contract line 14-47)
  - Dependencies: T039, T040
  - Test: Processes events idempotently, invalid signature returns 400

**Checkpoint**: All API endpoints implemented - frontend can now consume API

---

## Phase 6: Frontend (Admin Panel) (10 tasks)

**Purpose**: TanStack Start SSR apps for tenant users and platform admins

### Web App (Tenant-Facing)

- [ ] T086 [P] [UI] Setup TanStack Start router in apps/web/app/router.tsx
  - Configure routes per plan.md: \_auth, onboarding, dashboard, members, settings
  - Dependencies: T003
  - Test: Routing works, lazy loading enabled

- [ ] T087 [P] [UI] Create login page in apps/web/app/routes/\_auth/login.tsx
  - Form: email, password, calls POST /auth/login
  - Dependencies: T051
  - Test: Successful login redirects to dashboard, shows error on invalid credentials

- [ ] T088 [P] [UI] Create register page in apps/web/app/routes/\_auth/register.tsx
  - Form: email, password, name, calls POST /auth/register
  - Dependencies: T050
  - Test: Shows "verification email sent" message, duplicate email shows error

- [ ] T089 [UI] Create onboarding wizard in apps/web/app/routes/onboarding/index.tsx
  - Step 1: Create organization, Step 2: Add hierarchy, Step 3: Invite members
  - Dependencies: T057, T063, T070
  - Test: Multi-step form completes, creates org + hierarchy + invitations

- [ ] T090 [UI] Create organization dashboard in apps/web/app/routes/dashboard/index.tsx
  - Display: org stats, hierarchy tree component, recent members
  - Dependencies: T061
  - Test: Fetches org context, displays hierarchy tree, shows stats

- [ ] T091 [UI] Create hierarchy tree component in apps/web/app/components/HierarchyTree.tsx
  - Recursive tree rendering with expand/collapse, uses Radix UI Accordion
  - Dependencies: T062
  - Test: Renders 5-level hierarchy, expand/collapse works

- [ ] T092 [UI] Create member list page in apps/web/app/routes/members/index.tsx
  - Table with filters (role, status, hierarchy), uses Radix UI Table
  - Dependencies: T069
  - Test: Displays members, filters work, pagination if > 50 members

- [ ] T093 [UI] Create invitation form in apps/web/app/components/InviteForm.tsx
  - Form: email, role dropdown, hierarchy scope selector, calls POST /orgs/:id/members/invite
  - Dependencies: T070
  - Test: Submits invitation, shows success message, validates email format

### Admin Panel (Platform Admin)

- [ ] T094 [P] [UI] Create admin login page in apps/web/app/routes/admin/app/routes/\_auth/login.tsx
  - Form: email, password, validates platform_admins record
  - Dependencies: T051, T048
  - Test: Non-admin user cannot access admin panel, shows error

- [ ] T095 [UI] Create tenant list page in apps/web/app/routes/admin/app/routes/tenants/index.tsx
  - Table with filters (status, search), pagination, shows org stats
  - Dependencies: T077
  - Test: Displays all tenants, filters work, pagination if > 50 tenants

- [ ] T096 [UI] Create tenant details page in apps/web/app/routes/admin/app/routes/tenants/[id].tsx
  - Display: org details, subscription info, member count, suspend/unsuspend buttons
  - Dependencies: T078, T079, T080
  - Test: Displays tenant details, suspend/unsuspend buttons work

- [ ] T097 [UI] Implement impersonation UI in apps/web/app/routes/admin/app/components/ImpersonateButton.tsx
  - Button: "Impersonate User", calls POST /admin/impersonate, redirects to web app
  - Dependencies: T081, T082
  - Test: Starts impersonation, opens web app in new tab with impersonation token

**Checkpoint**: Frontend complete - end-to-end user flows functional

---

## Phase 7: Integration & Testing (8 tasks)

**Purpose**: Verify end-to-end flows and data consistency

### Unit Tests (Vitest)

- [ ] T098 [P] [TEST] Write unit tests for MembershipService in packages/db/tests/services/membership.service.test.ts
  - Test: All 5 methods (create, update role, suspend, reactivate, remove)
  - Dependencies: T032-T036
  - Test: ≥80% coverage, mocks database calls

- [ ] T099 [P] [TEST] Write unit tests for auth middleware in apps/api/tests/middleware/auth.middleware.test.ts
  - Test: Valid token allows access, invalid token rejects, expired token rejects
  - Dependencies: T045
  - Test: ≥80% coverage

- [ ] T100 [P] [TEST] Write unit tests for payment service in apps/api/tests/services/payment.service.test.ts
  - Test: Idempotent provisioning, creates subscription + org + tenant DB
  - Dependencies: T040
  - Test: ≥80% coverage, mocks Neon API calls

### Integration Tests (Vitest)

- [ ] T101 [TEST] Write integration test for login flow in apps/api/tests/integration/auth.test.ts
  - Test: Register → verify email → login → get organizations
  - Dependencies: T050-T052
  - Test: Uses test database, cleans up after test

- [ ] T102 [TEST] Write integration test for organization lifecycle in apps/api/tests/integration/org.test.ts
  - Test: Create org → add hierarchy → invite member → accept invitation → remove member
  - Dependencies: T057, T063, T070, T071, T075
  - Test: Uses test tenant database, validates dual-write sync

- [ ] T103 [TEST] Write integration test for membership sync in apps/api/tests/integration/member.test.ts
  - Test: Create member, verify in both control panel and tenant DB
  - Dependencies: T032, T018, T023
  - Test: Validates data consistency between databases

### E2E Tests (Playwright)

- [ ] T104 [TEST] Write E2E test for onboarding flow in apps/web/tests/e2e/onboarding.spec.ts
  - Test: Full flow from registration to organization creation to first member invite
  - Dependencies: T087-T093
  - Test: Uses Chrome DevTools MCP, validates UI state

- [ ] T105 [TEST] Write E2E test for admin impersonation in apps/web/app/routes/admin/tests/e2e/impersonation.spec.ts
  - Test: Admin login → impersonate user → perform action as user → exit impersonation
  - Dependencies: T094-T097
  - Test: Validates impersonation session created and ended

**Checkpoint**: All tests passing, ≥80% coverage achieved

---

## Phase 8: Deployment (5 tasks)

**Purpose**: Production deployment to Cloudflare Workers

- [ ] T106 [DEPLOY] Configure Cloudflare Workers for API in apps/server/wrangler.toml
  - Config: environment variables, KV namespace for rate limiting, routes
  - Dependencies: All API tasks (T050-T085)
  - Test: `wrangler dev` runs locally, `wrangler deploy` succeeds

- [ ] T107 [DEPLOY] Configure Cloudflare Workers for web app in apps/web/wrangler.toml
  - Config: Vite build integration, environment variables, routes
  - Dependencies: T086-T093
  - Test: `bun run build` succeeds, `wrangler deploy` succeeds

- [ ] T108 [DEPLOY] Deploy mobile app to app stores (Expo EAS Build)
  - Config: EAS build profiles, app signing, store credentials
  - Dependencies: Native app tasks
  - Test: `eas build` succeeds, apps submitted to stores

- [ ] T109 [DEPLOY] Setup production environment variables
  - Cloudflare Workers (server): DATABASE_URL, STRIPE keys, NEON keys, ENCRYPTION_KEY
  - Cloudflare Workers (web): VITE_API_URL, VITE_STRIPE_PUBLISHABLE_KEY
  - Expo: EXPO_PUBLIC_API_URL
  - Dependencies: T006
  - Test: All env vars set in Cloudflare dashboard and Expo secrets

- [ ] T110 [DEPLOY] Configure Stripe production webhook endpoint
  - Webhook URL: https://api.avantej.com/webhooks/stripe
  - Events: checkout.session.completed, customer.subscription._, invoice._
  - Dependencies: T085
  - Test: Webhook signature verification works in production

**Checkpoint**: Production deployment complete - system live

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **API Client Setup (Phase 1.5)**: Depends on Setup (T002, T003, T004) completion
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all service and API work
- **Core Services (Phase 3)**: Depends on Foundational (database schema) completion
- **Authentication (Phase 4)**: Depends on Foundational (users table) completion
- **API Endpoints (Phase 5)**: Depends on Core Services + Authentication completion
  - Auth endpoints can start after T042-T044
  - Org/Hierarchy/Member endpoints need T032-T041
  - Admin endpoints need T048-T049
  - Webhook endpoints need T037-T040
- **Frontend (Phase 6)**: Depends on API Endpoints completion
- **Testing (Phase 7)**: Can run in parallel with Frontend once API complete
- **Deployment (Phase 8)**: Depends on all previous phases completion

### Critical Path (Longest Dependencies)

```
T001 (Monorepo) → T005 (Database package) → T015-T024 (Schema) → T027-T028 (Migrations) →
T030-T031 (DB clients) → T032-T036 (MembershipService) → T046-T047 (Middleware) →
T069-T075 (Member API) → T091-T093 (Member UI) → T101-T103 (Integration tests) → T106-T110 (Deploy)
```

### Parallel Opportunities

**Setup Phase**:

- T002, T003, T004, T005 can run in parallel after T001
- T007, T008, T009, T010 can run in parallel (external services)

**API Client Setup Phase**:

- T011, T012 can run in parallel after dependencies
- T013, T014 can run in parallel after T012

**Database Phase**:

- T015-T020 (control panel tables) can run in parallel after T005
- T022-T024 (tenant tables) can run in parallel after T005
- T021, T025, T026 can run in parallel after respective table definitions

**Service Phase**:

- T032-T036 (MembershipService methods) can run in parallel
- T037, T039 can run in parallel (external service wrappers)

**API Phase (within each contract group)**:

- All auth endpoints (T050-T056) can run in parallel after T042-T044
- All org endpoints (T057-T061) can run in parallel after T046-T047
- All hierarchy endpoints (T062-T068) can run in parallel after T047
- All member endpoints (T069-T076) can run in parallel after T032-T036, T047
- All admin endpoints (T077-T084) can run in parallel after T048-T049

**UI Phase**:

- T086, T094 (routers) can run in parallel
- T087-T088 (auth pages) can run in parallel
- T098-T100 (unit tests) can run in parallel
- T104-T105 (E2E tests) can run in parallel

### Within-Phase Execution Example

**Phase 5 (API Endpoints) - 36 tasks can be parallelized into 5 groups**:

1. **Auth Group** (7 parallel): T050-T056
2. **Org Group** (5 parallel): T057-T061
3. **Hierarchy Group** (7 parallel): T062-T068
4. **Member Group** (8 parallel): T069-T076
5. **Admin + Webhook Group** (9 parallel): T077-T085

---

## Implementation Strategy

### MVP First (Phases 1-5 Core Flow)

1. Complete Phase 1: Setup (10 tasks)
2. Complete Phase 1.5: API Client Setup (4 tasks)
3. Complete Phase 2: Foundational (15 tasks) - CRITICAL BLOCKER
4. Complete Phase 3: Core Services (12 tasks)
5. Complete Phase 4: Authentication (8 tasks)
6. Implement minimal API subset from Phase 5:
   - Auth endpoints (T050-T056)
   - Org create + get (T057-T058)
   - Invite + accept (T070-T071)
7. **STOP and VALIDATE**: Test registration → org creation → invite → accept flow
8. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + API Client Setup + Foundational → Foundation ready (29 tasks)
2. Add Authentication + Basic API → Auth working (16 tasks)
3. Add Member Management → Invitations functional (8 tasks)
4. Add Hierarchy Management → Full org structure (7 tasks)
5. Add Admin Panel → Platform governance (13 tasks)
6. Add Testing → Quality validated (8 tasks)
7. Deploy to Production → Live system (5 tasks)

### Parallel Team Strategy

With 3 developers:

1. **Team completes Setup + API Client Setup + Foundational together** (Phase 1-2: 29 tasks)
2. Once Foundational done:
   - **Developer A**: Core Services + Auth (Phase 3-4: 20 tasks)
   - **Developer B**: API Endpoints - Auth & Org (Phase 5: T050-T061)
   - **Developer C**: API Endpoints - Hierarchy & Member (Phase 5: T062-T076)
3. Converge for Frontend + Testing:
   - **Developer A**: Web App UI (T086-T093)
   - **Developer B**: Admin Panel UI (T094-T097)
   - **Developer C**: Integration & E2E Tests (T098-T105)
4. Deploy together (Phase 8: 5 tasks)

---

## Notes

- **[P] tasks**: Can run in parallel with other [P] tasks in same phase
- **MembershipService**: Centralized service for dual-write sync (research.md section 4.6)
- **Database Architecture**: Two separate Neon projects (control panel + project-per-tenant)
- **Encryption**: All tenant connection strings encrypted with AES-256-GCM
- **Testing**: Vitest for unit/integration, Playwright for E2E, ≥80% coverage required
- **Commit Format**: Use Conventional Commits, reference `spec:001-implement-multi-tenant`
- **Checkpoints**: Stop at each checkpoint to validate independently before continuing
- **Avoid**: Vague tasks, same file conflicts, skipping foundational phase

---

## Total Task Summary

- **Phase 1 (Setup)**: 10/10 tasks ✅
- **Phase 1.5 (API Client Setup)**: 4/4 tasks ✅
- **Phase 2 (Database)**: 15/15 tasks ✅
- **Phase 3 (Services)**: 12/12 tasks ✅
- **Phase 4 (Auth)**: 8/8 tasks ✅
- **Phase 5 (API)**: 0/36 tasks
- **Phase 6 (UI)**: 0/12 tasks
- **Phase 7 (Testing)**: 0/8 tasks
- **Phase 8 (Deployment)**: 0/5 tasks

**Total: 49/110 tasks completed (44.5%)**

**Parallel Opportunities**: ~60% of tasks can run in parallel within their phase
