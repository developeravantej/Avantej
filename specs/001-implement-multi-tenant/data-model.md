# Data Model: Multi-Tenant Authentication & Organization Management

**Feature**: 001-implement-multi-tenant
**Date**: 2025-10-08
**Database**: Neon Serverless Postgres
**ORM**: Drizzle ORM 0.x
**Schema Location**: `packages/database/src/schema/`

## Overview

The data model supports B2B2C multi-tenant architecture with:
- **Platform-wide user identity** (users can belong to multiple organizations)
- **Tenant isolation** via separate Neon database projects per organization (project-per-tenant pattern)
- **5-level organizational hierarchy** (Organization → Country → Region → Area → Branch)
- **Hierarchy-scoped RBAC** (roles assigned at any hierarchy level)
- **Invitation-based member management** with expiration
- **Stripe subscription tracking** for payment-gated provisioning

## Database Architecture

This implementation uses a **two-database architecture** for optimal isolation and scalability:

### Control Panel Database (Avantej Platform)
**Purpose**: Platform metadata, routing, subscriptions, and user identity

**Neon Setup**: One centralized Neon project for the Avantej SaaS platform

**Tables stored here**:
- `users` - Platform-wide user identity (can belong to multiple organizations)
- `subscriptions` - Stripe subscription tracking
- `organizations` - Tenant registry with Neon project IDs for routing
- `organization_members` - Membership registry for fast routing (synced with tenant DBs)
- `platform_admins` - Avantej platform administrator privileges
- `admin_sessions` - Admin impersonation tracking
- `audit_logs` - Platform-level audit trail (future)

### Tenant Databases (Per-Franchisee)
**Purpose**: Isolated operational data for each franchisee organization

**Neon Setup**: **Separate Neon project** created via Neon API when subscription is confirmed (project-per-tenant)

**Tables stored here**:
- `hierarchy_nodes` - Organization structure (Org → Country → Region → Area → Branch)
- `members` - Staff, trainers, clients within the organization
- `invitations` - Pending member invitations
- `tenant_audit_logs` - Organization-specific audit trail (future)

**Benefits**:
- ✅ True data isolation (impossible to access another tenant's data)
- ✅ Independent scaling (scale-to-zero for inactive tenants)
- ✅ Regional compliance (deploy EU customers in EU regions)
- ✅ Per-tenant backup/recovery (PITR without affecting other tenants)
- ✅ Cost efficiency (inactive projects cost ~$0 with Neon's scale-to-zero)

### Data Synchronization Strategy

**Implementation Pattern:** Use a service layer to centralize synchronization logic. See `research.md` section 4.6 for the `MembershipService` implementation pattern that handles all dual-write operations in one place.

Some data is **intentionally duplicated** between control panel and tenant databases for performance:

**Control Panel Database (Fast Routing)**:
- `organization_members` - Registry of user memberships for fast "which orgs does this user belong to?" lookup
- Stores minimal fields: userId, organizationId, role, status
- Used during authentication to determine which organizations user can access

**Tenant Database (Source of Truth)**:
- `members` - Full member details with hierarchy scope and permissions
- Stores complete fields: userId, role, hierarchyScopeId, status, joinedAt
- Used during operations within an organization

**Synchronization Pattern**:
```typescript
// On membership creation (e.g., accepting invitation)
await Promise.all([
  // 1. Control panel: Fast lookup registry
  controlPanelDb.insert(organizationMembers).values({
    userId,
    organizationId,
    role,
    status: "active"
  }),

  // 2. Tenant DB: Full details with hierarchy
  tenantDb.insert(members).values({
    userId,
    role,
    hierarchyScopeId,
    status: "active"
  })
]);

// On role/status update
await Promise.all([
  controlPanelDb.update(organizationMembers)
    .set({ role: newRole })
    .where(eq(organizationMembers.id, memberId)),

  tenantDb.update(members)
    .set({ role: newRole })
    .where(eq(members.userId, userId))
]);

// On membership deletion
await Promise.all([
  controlPanelDb.delete(organizationMembers)
    .where(eq(organizationMembers.id, memberId)),

  tenantDb.delete(members)
    .where(eq(members.userId, userId))
]);
```

**When to Query Each Database**:

| Operation | Database | Reason |
|-----------|----------|--------|
| User login / Get user's organizations | Control Panel | Fast lookup without connecting to tenant DBs |
| Route request to tenant database | Control Panel | Decrypt connection string from `organizations.connectionString` |
| Check subscription status | Control Panel | Payment status in `organizations.paymentStatus` |
| List organization members | Tenant DB | Full member details with hierarchy scope |
| Check user permissions | Tenant DB | Hierarchy scope determines accessible nodes |
| Create/update hierarchy nodes | Tenant DB | Organization structure |
| Send invitations | Tenant DB | Invitations scoped to tenant |
| Admin impersonation tracking | Control Panel | Platform-level audit trail |

**Data Flow Example (User Login)**:
```
1. User submits email/password → Better-Auth validates against control panel users table
2. Query organization_members in control panel → "User belongs to orgs X, Y, Z"
3. Return to client: { user, organizations: [X, Y, Z], accessToken }
4. Client selects organization X → Includes orgId in API requests
5. API middleware queries control panel organizations table → Gets neonProjectId
6. API decrypts connectionString → Connects to tenant database
7. API queries tenant members table → Checks hierarchyScopeId for permissions
8. API executes business logic in tenant database
```

**Why This Pattern?**:
- ✅ **Performance**: Single query to find user's orgs (vs querying all tenant databases)
- ✅ **Scalability**: Routing happens at control panel level before connecting to tenant DB
- ✅ **Simplicity**: Clear separation: control panel = routing, tenant DB = operations
- ⚠️ **Trade-off**: Must keep both tables in sync (acceptable for this use case)

## Entity Relationship Diagram

```
┌─────────────┐
│    users    │ (Platform-wide identity)
└──────┬──────┘
       │
       │ 1:N
       ▼
┌────────────────┐         ┌──────────────────┐
│    members     │◄───────┤  organizations   │ (Tenants)
└────────┬───────┘   N:1   └────────┬─────────┘
         │                          │
         │ N:1                      │ 1:1
         ▼                          ▼
┌────────────────────┐      ┌──────────────────┐
│  hierarchy_nodes   │◄─────┤  subscriptions   │
└──────────┬─────────┘ 1:N  └──────────────────┘
           │
           │ self-reference (parent-child)
           │
      ┌────┴────┐
      ▼         │
┌─────────┐     │
│ country │     │
└────┬────┘     │
     │          │
     ▼          │
┌─────────┐     │
│ region  │     │
└────┬────┘     │
     │          │
     ▼          │
┌─────────┐     │
│  area   │     │
└────┬────┘     │
     │          │
     ▼          │
┌─────────┐     │
│ branch  │     │
└─────────┘     │
                │
         ┌──────▼───────┐
         │ invitations  │
         └──────────────┘
```

## Core Entities

### 1. users

**Purpose**: Platform-wide user identity. Users can belong to multiple organizations.

**Schema** (`packages/database/src/schema/users.ts`):
```typescript
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});
```

**Attributes**:
- `id` (UUID): Primary key, auto-generated
- `email` (text): Unique, used for login and invitation matching
- `passwordHash` (text): Bcrypt hashed password (managed by Better-Auth)
- `name` (text): User's display name
- `emailVerified` (boolean): Whether email verification link was clicked (default: false)
- `createdAt` (timestamp): Account creation timestamp
- `lastLoginAt` (timestamp): Most recent login timestamp (nullable)

**Relationships**:
- Has many `members` (user can belong to multiple organizations)
- Has many `invitations` sent (tracks who invited whom)

**Indexes**:
```sql
CREATE UNIQUE INDEX users_email_idx ON users(email);
```

**Validation Rules**:
- Email must be valid format (validated by Better-Auth)
- Password must be ≥8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char (FR-068)
- Email verification required before accessing organization data (FR-067)

---

### 2. subscriptions

**Purpose**: Tracks Stripe subscriptions and determines organization count limit per tier.

**Schema** (`packages/database/src/schema/subscriptions.ts`):
```typescript
import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  tier: text("tier").notNull(), // basic, professional, enterprise
  organizationCountLimit: integer("organization_count_limit").notNull(),
  status: text("status").notNull(), // active, past_due, canceled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

**Attributes**:
- `id` (UUID): Primary key
- `stripeSubscriptionId` (text): Stripe subscription ID (unique, used for idempotency)
- `stripeCustomerId` (text): Stripe customer ID
- `tier` (text): Subscription tier enum (basic | professional | enterprise)
- `organizationCountLimit` (integer): Max organizations allowed (basic: 1, pro: 3, enterprise: 10)
- `status` (text): Subscription status (active | past_due | canceled)
- `createdAt` (timestamp): Subscription creation timestamp
- `updatedAt` (timestamp): Last update timestamp

**Relationships**:
- Has many `organizations` (1:N, limited by `organizationCountLimit`)

**Indexes**:
```sql
CREATE UNIQUE INDEX subscriptions_stripe_id_idx ON subscriptions(stripe_subscription_id);
CREATE INDEX subscriptions_customer_idx ON subscriptions(stripe_customer_id);
```

**Business Rules**:
- Cannot create more organizations than `organizationCountLimit` (enforced in application layer)
- Subscription status changes trigger organization suspension (FR-079)
- Downgrade prevented if current org count exceeds new limit (FR-082)

---

### 3. organizations

**Purpose**: Represents tenant franchises. Each organization has a dedicated Neon database project.

**Location**: Stored in **Control Panel Database**

**Schema** (`packages/database/src/schema/control-panel/organizations.ts`):
```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { subscriptions } from "./subscriptions";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  neonProjectId: text("neon_project_id").notNull().unique(),
  connectionString: text("connection_string").notNull(),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id, { onDelete: "restrict" }),
  paymentStatus: text("payment_status").notNull(), // active, suspended, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
});
```

**Attributes**:
- `id` (UUID): Primary key
- `name` (text): Organization display name
- `slug` (text): URL-safe unique identifier (e.g., "gym-downtown-la")
- `neonProjectId` (text): Neon project ID for the tenant's dedicated database (unique)
- `connectionString` (text): Encrypted connection string for tenant database access
- `subscriptionId` (UUID): Foreign key to `subscriptions` (restrict delete to prevent orphans)
- `paymentStatus` (text): Payment status enum (active | suspended | failed)
- `createdAt` (timestamp): Organization creation timestamp
- `updatedAt` (timestamp): Last update timestamp
- `ownerUserId` (UUID): User who created the organization (nullable for legacy data)

**Relationships**:
- Belongs to one `subscription`
- Has one root `hierarchy_node` (type: organization)
- Has many `members`
- Has many `invitations`

**Indexes**:
```sql
CREATE UNIQUE INDEX organizations_slug_idx ON organizations(slug);
CREATE UNIQUE INDEX organizations_neon_project_idx ON organizations(neon_project_id);
CREATE INDEX organizations_subscription_idx ON organizations(subscription_id);
CREATE INDEX organizations_payment_status_idx ON organizations(payment_status);
```

**Business Rules**:
- Organization creation only after payment confirmed via Stripe webhook (FR-001)
- 1:1 relationship between subscription and organization (FR-002)
- Separate Neon project provisioned via API during organization creation
- Connection string must be encrypted before storage (AES-256-GCM recommended)
- Must have at least one branch in hierarchy (FR-017) - stored in tenant database
- Payment failure suspends organization, blocking all member access (FR-079)

**Security Considerations**:
- Connection strings contain credentials and MUST be encrypted at rest
- Decrypt connection string only when establishing tenant database connection
- Rotate connection strings if compromised (via Neon API password reset)

---

### 4. organization_members

**Purpose**: Registry of user memberships in organizations. Enables fast lookup of "which organizations does this user belong to?" without querying tenant databases.

**Location**: Stored in **Control Panel Database**

**Schema** (`packages/database/src/schema/control-panel/organization-members.ts`):
```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // admin, trainer, staff, client
  status: text("status").notNull(), // active, suspended
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});
```

**Attributes**:
- `id` (UUID): Primary key
- `userId` (UUID): Foreign key to `users` (cascade delete)
- `organizationId` (UUID): Foreign key to `organizations` (cascade delete)
- `role` (text): Role enum (admin | trainer | staff | client)
- `status` (text): Membership status (active | suspended)
- `joinedAt` (timestamp): When user joined organization

**Relationships**:
- Belongs to one `user`
- Belongs to one `organization`
- Synced with tenant database `members` table

**Indexes**:
```sql
CREATE UNIQUE INDEX org_members_user_org_idx ON organization_members(user_id, organization_id);
CREATE INDEX org_members_user_idx ON organization_members(user_id);
CREATE INDEX org_members_org_idx ON organization_members(organization_id);
CREATE INDEX org_members_status_idx ON organization_members(status);
```

**Business Rules**:
- User can have one membership per organization (unique constraint)
- User can belong to multiple organizations (via separate membership records)
- This is a **cache/registry table** for fast routing - tenant DB `members` table is source of truth
- Role and status must be kept in sync with tenant database
- When membership deleted here, also delete from tenant database

**Data Sync Strategy**:
```typescript
// When creating membership (e.g., accepting invitation)
await Promise.all([
  // 1. Add to control panel (for fast lookup)
  controlPanelDb.insert(organizationMembers).values({
    userId,
    organizationId,
    role,
    status: "active"
  }),

  // 2. Add to tenant DB (with full details)
  tenantDb.insert(members).values({
    userId,
    role,
    hierarchyScopeId,
    status: "active"
  })
]);

// When updating role
await Promise.all([
  controlPanelDb.update(organizationMembers)
    .set({ role: newRole })
    .where(eq(organizationMembers.id, memberId)),

  tenantDb.update(members)
    .set({ role: newRole })
    .where(eq(members.userId, userId))
]);
```

**Why Duplicate Data?**
- **Performance**: Avoid querying all tenant databases to find user's organizations on login
- **Simplicity**: Single query to get all user's orgs from control panel
- **Separation**: Control panel handles routing, tenant DB handles operations
- **Trade-off**: Need to keep both in sync (acceptable for this use case)

---

### 5. hierarchy_nodes

**Purpose**: Represents 5-level organizational hierarchy (Organization → Country → Region → Area → Branch).

**Location**: Stored in **Tenant Database** (each organization's Neon project)

**Schema** (`packages/database/src/schema/tenant/hierarchy.ts`):
```typescript
import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const hierarchyNodes = pgTable("hierarchy_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(), // organization, country, region, area, branch
  parentId: uuid("parent_id").references(() => hierarchyNodes.id, { onDelete: "restrict" }),
  depth: integer("depth").notNull(), // 0 (org) to 4 (branch)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Indexes for efficient hierarchy traversal
// CREATE INDEX hierarchy_parent_idx ON hierarchy_nodes(parent_id);
// CREATE INDEX hierarchy_type_idx ON hierarchy_nodes(type);
// CREATE INDEX hierarchy_depth_idx ON hierarchy_nodes(depth);
```

**Attributes**:
- `id` (UUID): Primary key
- `name` (text): Node display name (e.g., "USA", "West Region", "Downtown Branch")
- `type` (text): Node type enum (organization | country | region | area | branch)
- `parentId` (UUID): Self-reference to parent node (null for org root)
- `depth` (integer): Depth in hierarchy (0 = org, 1 = country, 2 = region, 3 = area, 4 = branch)
- `createdAt` (timestamp): Node creation timestamp
- `updatedAt` (timestamp): Last update timestamp

**Note**: No `organizationId` field needed since each tenant has its own isolated database. The organization context is implicit based on which Neon project database you're connected to.

**Relationships**:
- Has one parent `hierarchy_node` (self-reference, nullable for root)
- Has many child `hierarchy_nodes`
- Has many `members` scoped to this node (in same tenant database)

**Indexes**:
```sql
CREATE INDEX hierarchy_parent_idx ON hierarchy_nodes(parent_id);
CREATE INDEX hierarchy_type_idx ON hierarchy_nodes(type);
CREATE INDEX hierarchy_depth_idx ON hierarchy_nodes(depth);
```

**Business Rules**:
- Fixed 5-level depth: organization (0) → country (1) → region (2) → area (3) → branch (4)
- Cannot add nodes deeper than branch level (depth > 4) (FR-010, enforced in app layer)
- Cannot delete node with child nodes (FR-012)
- Cannot delete node with assigned members (FR-013)
- Node names unique within parent scope (FR-011, enforced in app layer)
- At least one branch must exist under organization (FR-017)

---

### 5. members

**Purpose**: Represents user membership in an organization with role and hierarchy scope.

**Location**: Stored in **Tenant Database** (each organization's Neon project)

**Schema** (`packages/database/src/schema/tenant/members.ts`):
```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // References control panel users table (no FK)
  role: text("role").notNull(), // admin, trainer, staff, client
  hierarchyScopeId: uuid("hierarchy_scope_id")
    .notNull()
    .references(() => hierarchyNodes.id, { onDelete: "restrict" }),
  status: text("status").notNull(), // active, suspended
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

// Unique constraint: one membership per user in this tenant
// CREATE UNIQUE INDEX members_user_idx ON members(user_id);
```

**Attributes**:
- `id` (UUID): Primary key
- `userId` (UUID): References `users.id` from control panel database (no FK constraint due to cross-database)
- `role` (text): Role enum (admin | trainer | staff | client)
- `hierarchyScopeId` (UUID): Foreign key to `hierarchy_nodes` in same tenant database
- `status` (text): Member status enum (active | suspended)
- `joinedAt` (timestamp): Membership creation timestamp

**Note**: `userId` references the `users` table in the control panel database but cannot have a foreign key constraint since they're in different Neon projects. The application layer ensures referential integrity.

**Relationships**:
- References one `user` (in control panel database)
- Scoped to one `hierarchy_node` (in same tenant database)

**Indexes**:
```sql
CREATE UNIQUE INDEX members_user_idx ON members(user_id);
CREATE INDEX members_hierarchy_idx ON members(hierarchy_scope_id);
CREATE INDEX members_role_idx ON members(role);
CREATE INDEX members_status_idx ON members(status);
```

**Business Rules**:
- One user can have only one membership in this organization (enforced by unique index on user_id)
- User can belong to multiple organizations (via separate member records in different tenant databases)
- Hierarchy scope determines accessible nodes (current + all descendants) (FR-038)
- Admin role grants full organization access (FR-040)
- Trainer/Staff/Client roles limited to hierarchy scope (FR-039)
- Cannot remove last admin/owner from organization (FR-032)
- Role change triggers email notification (FR-035)

---

### 6. invitations

**Purpose**: Tracks pending invitations to join an organization with role and hierarchy scope.

**Location**: Stored in **Tenant Database** (each organization's Neon project)

**Schema** (`packages/database/src/schema/tenant/invitations.ts`):
```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  invitedBy: uuid("invited_by").notNull(), // References control panel users.id (no FK)
  role: text("role").notNull(), // admin, trainer, staff, client
  hierarchyScopeId: uuid("hierarchy_scope_id")
    .notNull()
    .references(() => hierarchyNodes.id, { onDelete: "restrict" }),
  token: text("token").notNull().unique(),
  status: text("status").notNull(), // pending, accepted, declined, expired
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Index for checking duplicate invitations
// CREATE INDEX invitations_email_status_idx ON invitations(email, status);
```

**Attributes**:
- `id` (UUID): Primary key
- `email` (text): Email address of invitee
- `invitedBy` (UUID): References `users.id` from control panel database (no FK constraint)
- `role` (text): Role enum (admin | trainer | staff | client)
- `hierarchyScopeId` (UUID): Foreign key to `hierarchy_nodes` in same tenant database
- `token` (text): Unique invitation token for URL (UUID)
- `status` (text): Invitation status (pending | accepted | declined | expired)
- `expiresAt` (timestamp): Expiration timestamp (7 days from creation per FR-023)
- `createdAt` (timestamp): Invitation creation timestamp

**Note**: No `organizationId` field needed since invitations are stored in the tenant's own database. `invitedBy` references control panel `users` table without FK constraint.

**Relationships**:
- Sent by one `user` (in control panel database)
- Scoped to one `hierarchy_node` (in same tenant database)

**Indexes**:
```sql
CREATE UNIQUE INDEX invitations_token_idx ON invitations(token);
CREATE INDEX invitations_email_status_idx ON invitations(email, status);
CREATE INDEX invitations_expires_idx ON invitations(expires_at);
CREATE INDEX invitations_invited_by_idx ON invitations(invited_by);
```

**Business Rules**:
- Invitations expire after 7 days (FR-023)
- Expired invitations cannot be accepted (must be resent)
- Email must match user's email for acceptance (FR-026)
- Invitation creates member record upon acceptance (FR-028)
- Can resend pending invitations (FR-024)
- Can revoke pending invitations (FR-025)
- Only one pending invitation per email in this organization (enforced in app layer)

---

### 7. platform_admins

**Purpose**: Designates which users have Avantej platform administrator privileges (can impersonate users, view all organizations, access admin panel).

**Location**: Stored in **Control Panel Database** (Avantej platform)

**Schema** (`packages/database/src/schema/control-panel/platform-admins.ts`):
```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // super_admin, support, billing
  grantedBy: uuid("granted_by")
    .references(() => users.id, { onDelete: "set null" }),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
});
```

**Attributes**:
- `id` (UUID): Primary key
- `userId` (UUID): Foreign key to `users` (unique - one admin record per user)
- `role` (text): Admin role enum (super_admin | support | billing)
- `grantedBy` (UUID): Which admin granted this privilege (nullable)
- `grantedAt` (timestamp): When admin privilege was granted

**Relationships**:
- References one `user` (the platform admin)
- Has many `admin_sessions` (impersonation sessions created by this admin)

**Indexes**:
```sql
CREATE UNIQUE INDEX platform_admins_user_idx ON platform_admins(user_id);
CREATE INDEX platform_admins_role_idx ON platform_admins(role);
```

**Business Rules**:
- Only users with platform_admins record can access admin panel
- Super admin role required for granting/revoking admin privileges
- Support role can impersonate but cannot modify billing
- Billing role can view payment data but cannot impersonate
- Cannot revoke last super_admin from platform

**Admin Role Permissions**:

| Permission | super_admin | support | billing |
|------------|-------------|---------|---------|
| Impersonate users | ✅ | ✅ | ❌ |
| View all organizations | ✅ | ✅ | ✅ |
| Manage subscriptions | ✅ | ❌ | ✅ |
| Grant/revoke admin | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ✅ |
| Suspend organizations | ✅ | ✅ | ❌ |

**Security Considerations**:
- Admin actions must be logged in audit trail
- Impersonation sessions automatically expire after 1 hour
- Require re-authentication before admin panel access
- Enable MFA for all platform admins (future requirement)

---

### 8. admin_sessions

**Purpose**: Tracks Avantej platform admin impersonation sessions for audit trail.

**Location**: Stored in **Control Panel Database** (Avantej platform)

**Schema** (`packages/database/src/schema/control-panel/admin-sessions.ts`):
```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminUserId: uuid("admin_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  impersonatedUserId: uuid("impersonated_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "set null" }),
  sessionToken: text("session_token").notNull().unique(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

// Index for active sessions query
// CREATE INDEX admin_sessions_active_idx ON admin_sessions(ended_at) WHERE ended_at IS NULL;
```

**Attributes**:
- `id` (UUID): Primary key
- `adminUserId` (UUID): Foreign key to `users` (Avantej admin)
- `impersonatedUserId` (UUID): Foreign key to `users` (tenant user being impersonated)
- `organizationId` (UUID): Foreign key to `organizations` (context for impersonation, nullable)
- `sessionToken` (text): Unique session token (stored in admin's JWT)
- `startedAt` (timestamp): Impersonation start timestamp
- `endedAt` (timestamp): Impersonation end timestamp (null if active)

**Relationships**:
- Admin is a `user`
- Impersonated user is a `user`
- Scoped to `organization` (nullable)

**Indexes**:
```sql
CREATE UNIQUE INDEX admin_sessions_token_idx ON admin_sessions(session_token);
CREATE INDEX admin_sessions_admin_idx ON admin_sessions(admin_user_id);
CREATE INDEX admin_sessions_active_idx ON admin_sessions(ended_at) WHERE ended_at IS NULL;
```

**Business Rules**:
- All actions during impersonation logged with both admin and impersonated user IDs (FR-055)
- Impersonation session expires after 1 hour maximum (configured in Better-Auth)
- Admin can exit impersonation early (FR-056)
- Impersonation logged for compliance audit (FR-052)

---

## Schema Validation Rules Summary

### Control Panel Database Tables
| Entity | Constraints | Validation |
|--------|------------|------------|
| **users** | Unique email, password hash required | Email format, password ≥8 chars with complexity |
| **subscriptions** | Unique Stripe subscription ID | Tier enum, status enum, org count ≥ 1 |
| **organizations** | Unique slug, unique neonProjectId, FK to subscription | Payment status enum, connection string encrypted |
| **organization_members** | Unique user+org combo, FK to users and orgs | Role enum, status enum |
| **platform_admins** | Unique userId, FK to users | Role enum (super_admin, support, billing) |
| **admin_sessions** | Unique session token, FK to platform admin | Max 1 hour duration |

### Tenant Database Tables
| Entity | Constraints | Validation |
|--------|------------|------------|
| **hierarchy_nodes** | FK to parent (self-ref) | Type enum, depth 0-4, unique name within parent |
| **members** | Unique userId per tenant, FK to hierarchy | Role enum, status enum, cannot remove last admin |
| **invitations** | Unique token | Status enum, expires in 7 days, unique pending per email |

## Migration Strategy

### Control Panel Database Migrations

1. **Initial Schema Creation** (`packages/database/migrations/control-panel/0001_initial_schema.sql`):
   - Create tables in order: users → subscriptions → organizations → organization_members → platform_admins → admin_sessions
   - Add foreign key constraints
   - Create indexes

2. **Schema Evolution**:
   - Use Drizzle Kit for control panel DB: `bun drizzle-kit generate:pg --config=drizzle.control-panel.config.ts`
   - Review generated SQL before applying
   - Apply: `bun drizzle-kit push:pg --config=drizzle.control-panel.config.ts`

### Tenant Database Migrations

1. **Initial Schema Creation** (`packages/database/migrations/tenant/0001_initial_schema.sql`):
   - Create tables: hierarchy_nodes → members → invitations
   - Add foreign key constraints (only within tenant DB)
   - Create indexes

2. **Schema Evolution**:
   - Use Drizzle Kit for tenant schema: `bun drizzle-kit generate:pg --config=drizzle.tenant.config.ts`
   - Generated migration applied to ALL new tenant projects during provisioning
   - Existing tenant projects migrated via Neon API (iterate over all organizations)

3. **Provisioning New Tenants**:
   - Create Neon project via API
   - Run tenant migrations on new project immediately after creation
   - Store connection string encrypted in control panel DB

### Rollback Strategy
   - Keep previous migration files in `packages/database/migrations/control-panel/` and `migrations/tenant/`
   - Test migrations on dev tenant project before production rollout
   - Use Neon time-travel for emergency recovery (per-project PITR)
   - Control panel DB rollback: Standard PostgreSQL migration rollback
   - Tenant DB rollback: Iterate over all tenant projects and apply rollback migration

---

## Data Seeding (Development/Testing)

### Control Panel Database Seed
**Seed Script** (`packages/database/src/seed-control-panel.ts`):
```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users, subscriptions, organizations, organizationMembers, platformAdmins } from "./schema/control-panel";
import { hash } from "bcrypt";
import { encrypt } from "../lib/encryption";

const controlPanelDb = drizzle(new Pool({
  connectionString: process.env.CONTROL_PANEL_DATABASE_URL
}));

// Create test user
const [testUser] = await controlPanelDb.insert(users).values({
  email: "owner@example.com",
  passwordHash: await hash("password123", 10),
  name: "Test Owner",
  emailVerified: true,
}).returning();

// Create subscription
const [subscription] = await controlPanelDb.insert(subscriptions).values({
  stripeSubscriptionId: "sub_test_123",
  stripeCustomerId: "cus_test_123",
  tier: "professional",
  organizationCountLimit: 3,
  status: "active",
}).returning();

// Create Neon project for tenant (in real flow, this is via API)
const neonProjectId = "test-project-xyz";
const connectionString = "postgresql://user:pass@test-tenant.neon.tech/neondb";

// Create organization
const [organization] = await controlPanelDb.insert(organizations).values({
  name: "Test Fitness Franchise",
  slug: "test-fitness",
  neonProjectId,
  connectionString: encrypt(connectionString), // Encrypt before storage
  subscriptionId: subscription.id,
  paymentStatus: "active",
  ownerUserId: testUser.id,
}).returning();

// Create organization membership in control panel
await controlPanelDb.insert(organizationMembers).values({
  userId: testUser.id,
  organizationId: organization.id,
  role: "admin",
  status: "active",
});

// Create platform admin user (for admin panel access)
await controlPanelDb.insert(platformAdmins).values({
  userId: testUser.id,
  role: "super_admin",
  grantedBy: null, // First admin, self-granted
});
```

### Tenant Database Seed
**Seed Script** (`packages/database/src/seed-tenant.ts`):
```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hierarchyNodes, members } from "./schema/tenant";

// Connect to tenant database
const tenantDb = drizzle(new Pool({
  connectionString: decrypt(org.connectionString)
}));

// Create hierarchy (org → country → region → area → branch)
const [orgNode] = await tenantDb.insert(hierarchyNodes).values({
  name: "Test Fitness Franchise",
  type: "organization",
  depth: 0,
  parentId: null,
}).returning();

const [countryNode] = await tenantDb.insert(hierarchyNodes).values({
  name: "USA",
  type: "country",
  depth: 1,
  parentId: orgNode.id,
}).returning();

// ... continue creating region, area, branch nodes

// Create owner member (userId from control panel)
await tenantDb.insert(members).values({
  userId: testUser.id, // References control panel users.id
  role: "admin",
  hierarchyScopeId: orgNode.id, // Org-wide access
  status: "active",
});
```

**Run seeds**:
```bash
# Seed control panel database
bun run packages/database/src/seed-control-panel.ts

# Seed tenant database (requires org connection string)
ORG_ID=<uuid> bun run packages/database/src/seed-tenant.ts
```

---

This data model provides complete type safety, enforces tenant isolation via **separate Neon projects**, and supports efficient hierarchy queries via recursive CTEs. All schema definitions align with Drizzle ORM best practices and constitutional requirements.
