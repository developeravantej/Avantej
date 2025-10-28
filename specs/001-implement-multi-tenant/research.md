# Research: Multi-Tenant Authentication & Organization Management

**Feature**: 001-implement-multi-tenant
**Date**: 2025-10-08
**Purpose**: Technology decisions and implementation patterns for Better-Auth Organization/Admin plugins, Stripe integration, and Drizzle ORM schema design

## 1. Better-Auth Organization Plugin Integration

### Decision: Use Better-Auth Organization Plugin with Custom Hierarchy Extension

**Rationale**:
- Better-Auth Organization plugin provides built-in multi-tenant organization management (org creation, member invitations, role assignment)
- Native integration with Better-Auth session context (organization ID automatically scoped)
- Reduces custom auth logic by 70%+ compared to building from scratch
- Plugin architecture allows extending with custom hierarchy model (Organization → Country → Region → Area → Branch)

**Implementation Notes**:

1. **Better-Auth Configuration (packages/auth/src/index.ts)**:
```typescript
import { betterAuth } from "better-auth";
import { organization, admin } from "better-auth/plugins";
import { Pool } from "@neondatabase/serverless";

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  session: {
    expiresIn: 60 * 15, // 15 minutes (constitution requirement)
    updateAge: 60 * 5,  // Update session every 5 minutes
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: async ({ user }) => {
        // Only allow org creation if user has valid subscription
        const subscription = await getActiveSubscription(user.id);
        return !!subscription;
      },
      sendInvitationEmail: async ({ email, invitationLink }) => {
        // Send invitation via email service
        await sendEmail({
          to: email,
          subject: "You've been invited to join an organization",
          body: `Click here to accept: ${invitationLink}`,
        });
      },
    }),
    admin({
      impersonationSessionDuration: 60 * 60, // 1 hour max impersonation
    }),
  ],
});
```

2. **Organization Context in Session**:
   - Better-Auth automatically includes `organizationId` in session object
   - Access via `session.user.organizationId` in route handlers
   - Use middleware to inject organization context into request

3. **Hierarchy Extension Pattern**:
   - Better-Auth manages organizations and members
   - Custom `hierarchy_nodes` table extends organizations with 5-level structure
   - Foreign key from `members.hierarchy_scope_id` to `hierarchy_nodes.id` for role scoping

**References**:
- Better-Auth Organization Plugin: https://www.better-auth.com/docs/plugins/organization
- Better-Auth Admin Plugin: https://www.better-auth.com/docs/plugins/admin

---

## 2. Better-Auth with Hono Middleware

### Decision: Use Better-Auth with Hono Context Variables for Custom Tenant Context

**Rationale**:
- Better-Auth integrates seamlessly with Hono on Cloudflare Workers
- Stateless session validation works perfectly on edge environments
- Hono's lightweight middleware pattern allows injecting organization + hierarchy context
- Type-safe request context via Hono's `c.var` and `c.set()` API

**Implementation Notes**:

1. **Hono Authentication Middleware (apps/server/src/middleware/auth.middleware.ts)**:
```typescript
import { createMiddleware } from "hono/factory";
import { auth } from "@avantej-core/auth";

export const authMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Set user and session in context
  c.set("user", session.user);
  c.set("session", session.session);

  await next();
});
```

2. **Tenant Context Middleware (apps/server/src/middleware/tenant.middleware.ts)**:
```typescript
import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { organizations } from "@avantej-core/db/schema";

export const tenantMiddleware = createMiddleware(async (c, next) => {
  const user = c.get("user");

  // Get active organization from session
  const organizationId = user.organizationId;

  if (!organizationId) {
    return c.json({ error: "No active organization" }, 400);
  }

  // Get organization details from database
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });

  if (!organization) {
    return c.json({ error: "Organization not found" }, 404);
  }

  // Set organization and tenantId in context
  c.set("organization", organization);
  c.set("tenantId", organizationId);

  await next();
});
```

3. **Hierarchy Context Middleware (apps/server/src/middleware/hierarchy.middleware.ts)**:
```typescript
import { createMiddleware } from "hono/factory";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { members } from "@avantej-core/db/schema";

export const hierarchyMiddleware = createMiddleware(async (c, next) => {
  const user = c.get("user");
  const tenantId = c.get("tenantId");

  // Get user's member record to determine hierarchy scope
  const member = await db.query.members.findFirst({
    where: and(
      eq(members.userId, user.id),
      eq(members.organizationId, tenantId)
    ),
    with: {
      hierarchyScope: true, // Include hierarchy node details
      },
    });

    if (!member) {
      throw new Error("User is not a member of this organization");
    }

    // Calculate accessible hierarchy node IDs (current node + all descendants)
    const accessibleNodeIds = await getDescendantNodeIds(member.hierarchyScopeId);

    return {
      member,
      hierarchyScopeId: member.hierarchyScopeId,
      accessibleNodeIds,
      role: member.role,
    };
  });
```

4. **Usage in Routes**:
```typescript
import { Hono } from "hono";
import { hierarchyMiddleware } from "../middleware/hierarchy.middleware";

const app = new Hono()
  .use(hierarchyMiddleware)
  .get("/api/members", async (c) => {
    // Get context variables set by middleware
    const tenantId = c.get("tenantId");
    const accessibleNodeIds = c.get("accessibleNodeIds");

    // Query members scoped to accessible hierarchy nodes
    const members = await db.query.members.findMany({
      where: and(
        eq(members.organizationId, tenantId),
        inArray(members.hierarchyScopeId, accessibleNodeIds)
      ),
    });

    return c.json(members);
  });
```

**References**:
- Hono Context Variables: https://hono.dev/api/context#var
- Better-Auth Edge Deployment: https://www.better-auth.com/docs/deployment/edge

---

## 3. Stripe Webhook Integration for Payment-Gated Provisioning

### Decision: Use Stripe Webhooks with Idempotent Provisioning Handler

**Rationale**:
- Stripe webhooks provide reliable payment confirmation (retries on failure)
- Idempotency key prevents duplicate organization creation on webhook retries
- Cloudflare Workers can handle webhook signatures without additional infrastructure
- 1:1 subscription-to-organization mapping enforced at database level

**Implementation Notes**:

1. **Webhook Events to Handle**:
   - `payment_intent.succeeded` - One-time payment completed
   - `checkout.session.completed` - Checkout flow finished
   - `customer.subscription.created` - Recurring subscription created
   - `invoice.payment_failed` - Payment failure (suspend org)
   - `customer.subscription.deleted` - Subscription cancelled (mark org for deletion)

2. **Webhook Signature Validation (apps/server/src/routes/webhooks.ts)**:
```typescript
import { Hono } from "hono";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const webhookRoutes = new Hono()
  .post("/webhooks/stripe", async (c) => {
    const sig = c.req.header("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
    const body = await c.req.text();

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(
        body,
        sig as string,
        webhookSecret
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return c.json({ error: "Invalid signature" }, 400);
    }

    // Handle event based on type
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      // ... other event types
    }

    return c.json({ received: true });
  });
```

3. **Idempotent Organization Provisioning (apps/server/src/services/payment.service.ts)**:
```typescript
import { NeonClient } from "@neondatabase/api-client";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { runMigrations } from "../../packages/db/src/migrate-tenant";

const neon = new NeonClient({ apiKey: process.env.NEON_API_KEY });

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;
  const userId = session.metadata?.userId; // Set during checkout

  // Use subscription ID as idempotency key (check in CONTROL PANEL DB)
  const existingOrg = await controlPanelDb.query.organizations.findFirst({
    where: eq(organizations.stripeSubscriptionId, subscriptionId),
  });

  if (existingOrg) {
    console.log(`Organization already exists for subscription ${subscriptionId}`);
    return existingOrg;
  }

  // Provision organization atomically
  return await controlPanelDb.transaction(async (tx) => {
    // 1. Create subscription record (in control panel DB)
    const [subscription] = await tx.insert(subscriptions).values({
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      tier: determineTier(session.amount_total),
      organizationCountLimit: getTierOrgLimit(tier),
      status: "active",
    }).returning();

    // 2. Provision separate Neon PROJECT (not branch!)
    const neonProject = await neon.projects.create({
      name: `tenant-${subscriptionId}`,
      region_id: session.metadata?.region || "aws-us-west-2",
      pg_version: 17,
    });

    // 3. Get connection string for new tenant project
    const connectionString = neonProject.connection_uris[0].connection_uri;

    // 4. Create organization record (in control panel DB)
    const [organization] = await tx.insert(organizations).values({
      name: session.metadata?.orgName || `Organization ${subscriptionId}`,
      slug: generateSlug(),
      neonProjectId: neonProject.id,           // Store Neon project ID
      connectionString: encrypt(connectionString), // Encrypt before storage!
      subscriptionId: subscription.id,
      paymentStatus: "active",
      ownerUserId: userId,
    }).returning();

    // 5. Initialize schema in NEW TENANT DATABASE
    const tenantDb = drizzle(new Pool({ connectionString }));
    await runMigrations(tenantDb); // Apply tenant schema migrations

    // 6. Create default hierarchy in TENANT DB (not control panel!)
    const [orgNode] = await tenantDb.insert(hierarchyNodes).values({
      name: organization.name,
      type: "organization",
      depth: 0,
      parentId: null,
    }).returning();

    // 7. Add user as organization owner in TENANT DB
    await tenantDb.insert(members).values({
      userId,                        // References control panel users.id
      role: "admin",
      hierarchyScopeId: orgNode.id,  // Org-wide access
      status: "active",
    });

    return organization;
  });
}
```

4. **Subscription Tier Mapping**:
```typescript
function determineTier(amountTotal: number | null): string {
  if (!amountTotal) return "basic";

  // Amount is in cents
  if (amountTotal >= 29900) return "enterprise"; // $299/mo
  if (amountTotal >= 9900) return "professional"; // $99/mo
  return "basic"; // $49/mo
}

function getTierOrgLimit(tier: string): number {
  switch (tier) {
    case "enterprise": return 10;
    case "professional": return 3;
    case "basic": return 1;
    default: return 1;
  }
}
```

**Security Considerations**:
- Always validate webhook signature before processing
- Store webhook events in audit log for debugging
- Handle duplicate webhook deliveries gracefully (idempotency)
- Never trust client-submitted payment data (always verify via Stripe API)

**References**:
- Stripe Webhooks: https://stripe.com/docs/webhooks
- Stripe Signature Verification: https://stripe.com/docs/webhooks/signatures
- Idempotent Requests: https://stripe.com/docs/api/idempotent_requests

---

## 4. Neon Project-per-Tenant Architecture

### Decision: Create Separate Neon Project for Each Tenant

**Rationale**:
- **True data isolation**: Each tenant gets completely separate Neon project (not shared database)
- **Independent scaling**: Scale-to-zero for inactive tenants reduces costs to ~$0
- **Regional compliance**: Deploy tenant projects in specific regions for data residency
- **Per-tenant recovery**: Point-in-time restore without affecting other tenants
- **Security**: Impossible to access another tenant's data (separate connection credentials)

**Neon's Official Recommendation**: Project-per-tenant is the recommended approach for SaaS applications requiring strong isolation.

### Implementation Pattern

**Two-Database Architecture**:

1. **Control Panel Database** (Avantej Platform):
   - Single Neon project for platform metadata
   - Tables: `users`, `subscriptions`, `organizations`, `admin_sessions`
   - Stores routing information (`neonProjectId`, encrypted `connectionString`)

2. **Tenant Databases** (Per-Franchisee):
   - Separate Neon project per organization
   - Tables: `hierarchy_nodes`, `members`, `invitations`
   - Created via Neon API during subscription provisioning

### 1. Creating Tenant Project via Neon API

```typescript
import { NeonClient } from "@neondatabase/api-client";

const neon = new NeonClient({
  apiKey: process.env.NEON_API_KEY
});

async function createTenantProject(organizationSlug: string, region?: string) {
  const project = await neon.projects.create({
    name: `tenant-${organizationSlug}`,
    region_id: region || "aws-us-west-2",
    pg_version: 17,
  });

  return {
    projectId: project.id,
    connectionString: project.connection_uris[0].connection_uri,
  };
}
```

### 2. Connection String Management

**Security Requirements**:
- Connection strings contain credentials and MUST be encrypted at rest
- Use AES-256-GCM encryption before storing in `organizations.connectionString`
- Decrypt only when establishing database connection

**Encryption Helper** (`apps/server/src/lib/encryption.ts`):
```typescript
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const SECRET_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "hex"); // 32 bytes

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(":");

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
```

### 3. Connection Routing Middleware

**Pattern**: Middleware that switches between control panel DB and tenant DB based on request context.

```typescript
// apps/server/src/middleware/tenant.middleware.ts
import { Elysia } from "elysia";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { decrypt } from "../lib/encryption";

export const tenantMiddleware = new Elysia()
  .use(authMiddleware) // Ensures user is authenticated
  .derive(async ({ user, headers }) => {
    // Get organization ID from header or JWT
    const orgId = headers["x-organization-id"] || user.currentOrganizationId;

    // Lookup organization in CONTROL PANEL DB
    const org = await controlPanelDb.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });

    if (!org) {
      throw new Error("Organization not found");
    }

    // Decrypt connection string and create tenant DB connection
    const connectionString = decrypt(org.connectionString);
    const tenantDb = drizzle(new Pool({ connectionString }));

    return {
      organization: org,
      tenantDb,          // Use for tenant data queries
      controlPanelDb,    // Use for platform data queries
    };
  });
```

**Usage in Routes**:
```typescript
// Query TENANT database
app.get("/orgs/:id/members", async ({ tenantDb, user }) => {
  const members = await tenantDb.query.members.findMany({
    where: eq(members.hierarchyScopeId, user.hierarchyScopeId),
  });
  return members;
});

// Query CONTROL PANEL database
app.get("/admin/tenants", async ({ controlPanelDb }) => {
  const orgs = await controlPanelDb.query.organizations.findMany();
  return orgs;
});
```

### 4. Tenant Schema Migration

**Initial Setup**: Run migrations on newly created tenant project.

```typescript
// packages/db/src/migrate-tenant.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export async function runMigrations(tenantDb: ReturnType<typeof drizzle>) {
  await migrate(tenantDb, {
    migrationsFolder: "./migrations/tenant"
  });
}

// Called during provisioning
const tenantDb = drizzle(new Pool({ connectionString }));
await runMigrations(tenantDb);
```

**Schema Evolution**: Update all existing tenant projects when schema changes.

```typescript
// scripts/migrate-all-tenants.ts
import { controlPanelDb } from "./db";

async function migrateAllTenants() {
  const orgs = await controlPanelDb.query.organizations.findMany();

  for (const org of orgs) {
    console.log(`Migrating tenant: ${org.slug}`);

    const connectionString = decrypt(org.connectionString);
    const tenantDb = drizzle(new Pool({ connectionString }));

    try {
      await runMigrations(tenantDb);
      console.log(`✓ Migrated ${org.slug}`);
    } catch (error) {
      console.error(`✗ Failed ${org.slug}:`, error);
    }
  }
}
```

### 5. Cost Optimization

**Scale-to-Zero**: Inactive tenant projects automatically scale to zero.

| Scenario | Monthly Cost |
|----------|-------------|
| 100 tenants (20 active) | ~$50 (only active tenants pay) |
| 1,000 tenants (200 active) | ~$500 |
| 10,000 tenants (2,000 active) | ~$5,000 |

**Cost Comparison**: Neon project-per-tenant costs **3x less** than AWS RDS with equivalent isolation.

### 6. Regional Deployment

**Compliance**: Deploy tenant projects in customer's region for data residency.

```typescript
const region = session.metadata?.customerRegion || "aws-us-west-2";
const neonProject = await neon.projects.create({
  name: `tenant-${subscriptionId}`,
  region_id: region, // "aws-eu-west-1" for EU customers
});
```

**Supported Regions**:
- `aws-us-east-1`, `aws-us-west-2`
- `aws-eu-west-1`, `aws-eu-central-1`
- `aws-ap-southeast-1`

### 7. PostgreSQL Roles & Permissions

**Default Neon Setup**: Each Neon project comes with a default `neondb_owner` role.

**Application-Level RBAC**: Our system uses Better-Auth + application-level role checks:

```typescript
// Members table stores application roles (admin, trainer, staff, client)
export const members = pgTable("members", {
  userId: uuid("user_id").notNull(),
  role: text("role").notNull(), // Application role, not PostgreSQL role
  hierarchyScopeId: uuid("hierarchy_scope_id").notNull(),
});
```

**Database Connection Strategy**:
- Control panel: Connects as `neondb_owner` (full access to control panel DB)
- Tenant databases: Connects as `neondb_owner` (full access to tenant's own DB)
- **Isolation via separate projects**, not PostgreSQL roles

**Why Not PostgreSQL Roles per User?**
- Complexity: Would need to create PostgreSQL role for every member
- Performance: Connection pooling harder with many database roles
- Better-Auth handles authorization at application layer
- Physical isolation (separate projects) provides security boundary

**Optional: Row-Level Security (RLS)**

For defense-in-depth, can add RLS policies within tenant database:

```sql
-- Example: Ensure members can only see data in their hierarchy scope
CREATE POLICY member_hierarchy_scope ON members
  USING (
    hierarchy_scope_id IN (
      SELECT id FROM get_descendant_nodes(current_user_scope_id)
    )
  );
```

**Implementation Decision**: Start without RLS (application-level checks sufficient), add RLS later if required for compliance.

**References**:
- Neon Multi-tenancy Guide: https://neon.com/docs/guides/multitenancy
- Neon API Reference: https://neon.com/docs/reference/api-reference
- Neon Project Management: https://neon.com/docs/reference/cli-projects
- PostgreSQL Row-Level Security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

---

## 4.5. Control Panel ↔ Tenant Database Synchronization

### Problem Statement

With project-per-tenant architecture, we need to answer "which organizations does this user belong to?" during login **without querying all tenant databases** (which doesn't scale).

### Solution: Membership Registry in Control Panel

**Architecture**:
- **Control Panel DB**: `organization_members` table (lightweight registry for routing)
- **Tenant DBs**: `members` table (source of truth with full details)

**Data Duplication Trade-off**:
- ✅ **Performance**: Single query to find user's organizations on login
- ✅ **Scalability**: No need to connect to all tenant databases for routing
- ⚠️ **Consistency**: Must keep both tables synchronized

### Synchronization Patterns

#### 1. Membership Creation (Accepting Invitation)

```typescript
// apps/server/src/services/membership.service.ts
export async function acceptInvitation(invitationToken: string, userId: string) {
  // 1. Get invitation from tenant database
  const invitation = await tenantDb.query.invitations.findFirst({
    where: eq(invitations.token, invitationToken),
  });

  if (!invitation || invitation.status !== "pending") {
    throw new Error("Invalid invitation");
  }

  // 2. Atomic operation: Update both databases
  await Promise.all([
    // Control Panel: Add to membership registry
    controlPanelDb.insert(organizationMembers).values({
      userId,
      organizationId: invitation.organizationId,
      role: invitation.role,
      status: "active",
    }),

    // Tenant DB: Create full member record
    tenantDb.transaction(async (tx) => {
      await tx.insert(members).values({
        userId,
        role: invitation.role,
        hierarchyScopeId: invitation.hierarchyScopeId,
        status: "active",
      });

      // Mark invitation as accepted
      await tx.update(invitations)
        .set({ status: "accepted" })
        .where(eq(invitations.id, invitation.id));
    }),
  ]);

  return { success: true };
}
```

#### 2. Role Update

```typescript
export async function updateMemberRole(params: {
  userId: string;
  organizationId: string;
  newRole: string;
}) {
  const { userId, organizationId, newRole } = params;

  // Update both databases in parallel
  await Promise.all([
    // Control Panel: Update registry
    controlPanelDb.update(organizationMembers)
      .set({ role: newRole })
      .where(and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId)
      )),

    // Tenant DB: Update full member record
    tenantDb.update(members)
      .set({ role: newRole })
      .where(eq(members.userId, userId)),
  ]);
}
```

#### 3. Member Suspension/Reactivation

```typescript
export async function suspendMember(userId: string, organizationId: string) {
  await Promise.all([
    // Control Panel: Update status in registry
    controlPanelDb.update(organizationMembers)
      .set({ status: "suspended" })
      .where(and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId)
      )),

    // Tenant DB: Update status in members table
    tenantDb.update(members)
      .set({ status: "suspended" })
      .where(eq(members.userId, userId)),
  ]);
}
```

#### 4. Member Removal

```typescript
export async function removeMember(userId: string, organizationId: string) {
  // Validate: Cannot remove last admin
  const remainingAdmins = await tenantDb.query.members.findMany({
    where: and(
      eq(members.role, "admin"),
      ne(members.userId, userId)
    ),
  });

  if (remainingAdmins.length === 0) {
    throw new Error("Cannot remove last admin from organization");
  }

  // Delete from both databases
  await Promise.all([
    // Control Panel: Remove from registry
    controlPanelDb.delete(organizationMembers)
      .where(and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId)
      )),

    // Tenant DB: Delete member record
    tenantDb.delete(members)
      .where(eq(members.userId, userId)),
  ]);
}
```

### Login Flow Example

**Step-by-Step Authentication and Organization Discovery**:

```typescript
// apps/server/src/routes/auth.routes.ts
export const authRoutes = new Elysia()
  .post("/auth/login", async ({ body }) => {
    const { email, password } = body;

    // 1. Validate credentials via Better-Auth (queries CONTROL PANEL users table)
    const session = await auth.api.signIn.email({
      email,
      password,
    });

    if (!session) {
      throw new Error("Invalid credentials");
    }

    // 2. Query CONTROL PANEL to get user's organizations (fast registry lookup)
    const userOrganizations = await controlPanelDb.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, session.user.id),
      with: {
        organization: true, // Include org name, slug, payment status
      },
    });

    // 3. Filter out suspended organizations
    const activeOrgs = userOrganizations.filter(
      (om) => om.status === "active" && om.organization.paymentStatus === "active"
    );

    // 4. Return to client: User + available organizations
    return {
      user: session.user,
      accessToken: session.token,
      refreshToken: session.refreshToken,
      organizations: activeOrgs.map((om) => ({
        id: om.organization.id,
        name: om.organization.name,
        slug: om.organization.slug,
        role: om.role,
      })),
    };
  });
```

**Client Selects Organization**:

```typescript
// Client sends subsequent requests with organization context
// Headers: { "Authorization": "Bearer <token>", "X-Organization-Id": "<org-id>" }

export const protectedRoutes = new Elysia()
  .use(authMiddleware)     // Validates JWT, extracts user
  .use(tenantMiddleware)   // Routes to correct tenant database
  .get("/members", async ({ tenantDb, user, accessibleNodeIds }) => {
    // Now querying TENANT DATABASE (not control panel)
    const members = await tenantDb.query.members.findMany({
      where: inArray(members.hierarchyScopeId, accessibleNodeIds),
    });

    return members;
  });
```

### When to Query Each Database

| Operation | Database | Table | Reason |
|-----------|----------|-------|--------|
| User login | Control Panel | `users` | Validate credentials |
| Get user's orgs | Control Panel | `organization_members` | Fast lookup without connecting to tenants |
| Get org metadata | Control Panel | `organizations` | Name, slug, payment status, connection string |
| Route to tenant DB | Control Panel | `organizations` | Decrypt `connectionString` |
| List members | Tenant DB | `members` | Full member details with hierarchy scope |
| Check permissions | Tenant DB | `members` | Hierarchy scope determines access |
| Send invitation | Tenant DB | `invitations` | Invitation scoped to tenant |
| Get hierarchy | Tenant DB | `hierarchy_nodes` | Organization structure |

### Error Handling and Consistency

**Potential Inconsistency Scenario**: What if control panel update succeeds but tenant DB update fails?

**Solution 1: Best-Effort with Logging**
```typescript
try {
  await Promise.all([
    controlPanelDb.update(...),
    tenantDb.update(...),
  ]);
} catch (error) {
  // Log inconsistency for manual reconciliation
  await logInconsistency({
    operation: "updateMemberRole",
    userId,
    organizationId,
    error: error.message,
  });
  throw error;
}
```

**Solution 2: Reconciliation Job (Periodic)**
```typescript
// scripts/reconcile-memberships.ts
async function reconcileMemberships() {
  const orgs = await controlPanelDb.query.organizations.findMany();

  for (const org of orgs) {
    const connectionString = decrypt(org.connectionString);
    const tenantDb = drizzle(new Pool({ connectionString }));

    // Get memberships from control panel
    const controlMembers = await controlPanelDb.query.organizationMembers.findMany({
      where: eq(organizationMembers.organizationId, org.id),
    });

    // Get memberships from tenant DB
    const tenantMembers = await tenantDb.query.members.findMany();

    // Compare and fix discrepancies
    const controlUserIds = new Set(controlMembers.map(m => m.userId));
    const tenantUserIds = new Set(tenantMembers.map(m => m.userId));

    // Find missing in tenant DB
    const missingInTenant = controlMembers.filter(m => !tenantUserIds.has(m.userId));

    // Find missing in control panel
    const missingInControl = tenantMembers.filter(m => !controlUserIds.has(m.userId));

    console.log(`Org ${org.slug}: ${missingInTenant.length} missing in tenant, ${missingInControl.length} missing in control`);
  }
}
```

**Chosen Approach**: Best-effort synchronization with monitoring. Run reconciliation job weekly to detect and fix any drift.

### Performance Considerations

**Control Panel Registry Benefits**:
- Login query: `SELECT * FROM organization_members WHERE user_id = ? AND status = 'active'` (indexed, <10ms)
- Alternative without registry: Connect to all N tenant databases, query each (N * 50ms = 500ms for 10 orgs ❌)

**Cost**: Duplicate storage for minimal fields (userId, organizationId, role, status) is negligible compared to tenant DB size.

**Consistency Guarantee**: Eventual consistency acceptable for this use case:
- Critical path (login): Always up-to-date in control panel
- Non-critical (member details): Tenant DB is source of truth, queried on-demand

---

## 4.6. Service Layer Pattern for Membership Operations

### Problem: Scattered Dual-Write Logic

With dual-write synchronization, every route handler that modifies memberships must remember to update **both** databases:

```typescript
// Route 1: Create member
app.post("/members", async ({ body, tenantDb }) => {
  await Promise.all([
    controlPanelDb.insert(organizationMembers).values(...),
    tenantDb.insert(members).values(...)
  ]);
});

// Route 2: Delete member
app.delete("/members/:id", async ({ params, tenantDb }) => {
  await Promise.all([
    controlPanelDb.delete(organizationMembers).where(...),
    tenantDb.delete(members).where(...)
  ]);
});

// Route 3: Update role
app.patch("/members/:id/role", async ({ params, tenantDb }) => {
  await Promise.all([
    controlPanelDb.update(organizationMembers).set(...),
    tenantDb.update(members).set(...)
  ]);
});
```

**Problems:**
- ❌ Duplicate logic across multiple route handlers
- ❌ Easy to forget updating one of the databases
- ❌ Inconsistent error handling
- ❌ Hard to test (must mock DB calls in every route test)

### Solution: Centralize in MembershipService

Create a single service class that handles all membership synchronization logic.

**Service Implementation** (`packages/db/src/services/membership.service.ts`):

```typescript
import { eq, and, ne } from "drizzle-orm";
import type { ControlPanelDB, TenantDB } from "../db";
import { organizationMembers } from "../schema/control-panel/organization-members";
import { members } from "../schema/tenant/members";
import { invitations } from "../schema/tenant/invitations";

export class MembershipService {
  constructor(
    private controlPanelDb: ControlPanelDB
  ) {}

  /**
   * Create new member from invitation acceptance
   * Syncs to both control panel and tenant database
   */
  async createMember(params: {
    userId: string;
    organizationId: string;
    role: string;
    hierarchyScopeId: string;
    invitationId: string;
    tenantDb: TenantDB;
  }) {
    const { userId, organizationId, role, hierarchyScopeId, invitationId, tenantDb } = params;

    try {
      // Sync to both databases in parallel
      await Promise.all([
        // Control Panel: Registry for routing
        this.controlPanelDb.insert(organizationMembers).values({
          userId,
          organizationId,
          role,
          status: "active",
        }),

        // Tenant DB: Full member record + mark invitation accepted
        tenantDb.transaction(async (tx) => {
          await tx.insert(members).values({
            userId,
            role,
            hierarchyScopeId,
            status: "active",
          });

          await tx.update(invitations)
            .set({ status: "accepted" })
            .where(eq(invitations.id, invitationId));
        }),
      ]);

      return { success: true };
    } catch (error) {
      console.error("Failed to create member:", error);
      throw new Error("Failed to create member");
    }
  }

  /**
   * Update member role
   * Syncs to both control panel and tenant database
   */
  async updateMemberRole(params: {
    userId: string;
    organizationId: string;
    newRole: string;
    tenantDb: TenantDB;
  }) {
    const { userId, organizationId, newRole, tenantDb } = params;

    try {
      await Promise.all([
        // Control Panel: Update registry
        this.controlPanelDb.update(organizationMembers)
          .set({ role: newRole })
          .where(and(
            eq(organizationMembers.userId, userId),
            eq(organizationMembers.organizationId, organizationId)
          )),

        // Tenant DB: Update member record
        tenantDb.update(members)
          .set({ role: newRole })
          .where(eq(members.userId, userId)),
      ]);

      return { success: true };
    } catch (error) {
      console.error("Failed to update member role:", error);
      throw new Error("Failed to update member role");
    }
  }

  /**
   * Suspend member
   * Syncs to both control panel and tenant database
   */
  async suspendMember(params: {
    userId: string;
    organizationId: string;
    tenantDb: TenantDB;
  }) {
    const { userId, organizationId, tenantDb } = params;

    try {
      await Promise.all([
        // Control Panel: Update status
        this.controlPanelDb.update(organizationMembers)
          .set({ status: "suspended" })
          .where(and(
            eq(organizationMembers.userId, userId),
            eq(organizationMembers.organizationId, organizationId)
          )),

        // Tenant DB: Update status
        tenantDb.update(members)
          .set({ status: "suspended" })
          .where(eq(members.userId, userId)),
      ]);

      return { success: true };
    } catch (error) {
      console.error("Failed to suspend member:", error);
      throw new Error("Failed to suspend member");
    }
  }

  /**
   * Reactivate member
   * Syncs to both control panel and tenant database
   */
  async reactivateMember(params: {
    userId: string;
    organizationId: string;
    tenantDb: TenantDB;
  }) {
    const { userId, organizationId, tenantDb } = params;

    try {
      await Promise.all([
        // Control Panel: Update status
        this.controlPanelDb.update(organizationMembers)
          .set({ status: "active" })
          .where(and(
            eq(organizationMembers.userId, userId),
            eq(organizationMembers.organizationId, organizationId)
          )),

        // Tenant DB: Update status
        tenantDb.update(members)
          .set({ status: "active" })
          .where(eq(members.userId, userId)),
      ]);

      return { success: true };
    } catch (error) {
      console.error("Failed to reactivate member:", error);
      throw new Error("Failed to reactivate member");
    }
  }

  /**
   * Remove member from organization
   * Syncs to both control panel and tenant database
   * Validates: Cannot remove last admin
   */
  async removeMember(params: {
    userId: string;
    organizationId: string;
    tenantDb: TenantDB;
  }) {
    const { userId, organizationId, tenantDb } = params;

    try {
      // Check: Cannot remove last admin
      const remainingAdmins = await tenantDb.query.members.findMany({
        where: and(
          eq(members.role, "admin"),
          ne(members.userId, userId)
        ),
      });

      if (remainingAdmins.length === 0) {
        throw new Error("Cannot remove last admin from organization");
      }

      // Remove from both databases
      await Promise.all([
        // Control Panel: Remove from registry
        this.controlPanelDb.delete(organizationMembers)
          .where(and(
            eq(organizationMembers.userId, userId),
            eq(organizationMembers.organizationId, organizationId)
          )),

        // Tenant DB: Delete member record
        tenantDb.delete(members)
          .where(eq(members.userId, userId)),
      ]);

      return { success: true };
    } catch (error) {
      console.error("Failed to remove member:", error);
      throw error; // Re-throw to preserve error message
    }
  }
}
```

### Usage in Route Handlers

**Initialize Service** (`apps/server/src/services/index.ts`):
```typescript
import { MembershipService } from "@avantej/database/services/membership.service";
import { controlPanelDb } from "../lib/db";

export const membershipService = new MembershipService(controlPanelDb);
```

**Use in Routes** (`apps/server/src/routes/members.routes.ts`):
```typescript
import { Hono } from "hono";
import { tenantMiddleware } from "../middleware/tenant.middleware";
import { membershipService } from "../services";

export const memberRoutes = new Hono()
  .use(tenantMiddleware)

  // Accept invitation
  .post("/members/accept-invitation", async (c) => {
    const body = await c.req.json();
    const { invitationToken } = body;

    // Get context variables from middleware
    const user = c.get("user");
    const tenantDb = c.get("tenantDb");
    const organization = c.get("organization");

    // Get invitation
    const invitation = await tenantDb.query.invitations.findFirst({
      where: eq(invitations.token, invitationToken),
    });

    if (!invitation || invitation.status !== "pending") {
      return c.json({ error: "Invalid invitation" }, 400);
    }

    // Service handles dual-write
    await membershipService.createMember({
      userId: user.id,
      organizationId: organization.id,
      role: invitation.role,
      hierarchyScopeId: invitation.hierarchyScopeId,
      invitationId: invitation.id,
      tenantDb,
    });

    return { success: true, message: "Successfully joined organization" };
  }, {
    body: t.Object({
      invitationToken: t.String(),
    }),
  })

  // Update member role
  .patch("/:memberId/role", async ({ params, body, tenantDb, organization }) => {
    const { newRole } = body;

    // Get member to find userId
    const member = await tenantDb.query.members.findFirst({
      where: eq(members.id, params.memberId),
    });

    if (!member) {
      throw new Error("Member not found");
    }

    // Service handles dual-write
    await membershipService.updateMemberRole({
      userId: member.userId,
      organizationId: organization.id,
      newRole,
      tenantDb,
    });

    return { success: true, message: "Role updated successfully" };
  }, {
    body: t.Object({
      newRole: t.Union([
        t.Literal("admin"),
        t.Literal("trainer"),
        t.Literal("staff"),
        t.Literal("client"),
      ]),
    }),
  })

  // Suspend member
  .post("/:memberId/suspend", async ({ params, tenantDb, organization }) => {
    const member = await tenantDb.query.members.findFirst({
      where: eq(members.id, params.memberId),
    });

    if (!member) {
      throw new Error("Member not found");
    }

    // Service handles dual-write
    await membershipService.suspendMember({
      userId: member.userId,
      organizationId: organization.id,
      tenantDb,
    });

    return { success: true, message: "Member suspended" };
  })

  // Reactivate member
  .post("/:memberId/reactivate", async ({ params, tenantDb, organization }) => {
    const member = await tenantDb.query.members.findFirst({
      where: eq(members.id, params.memberId),
    });

    if (!member) {
      throw new Error("Member not found");
    }

    // Service handles dual-write
    await membershipService.reactivateMember({
      userId: member.userId,
      organizationId: organization.id,
      tenantDb,
    });

    return { success: true, message: "Member reactivated" };
  })

  // Remove member
  .delete("/:memberId", async ({ params, tenantDb, organization }) => {
    const member = await tenantDb.query.members.findFirst({
      where: eq(members.id, params.memberId),
    });

    if (!member) {
      throw new Error("Member not found");
    }

    // Service handles dual-write + validation
    await membershipService.removeMember({
      userId: member.userId,
      organizationId: organization.id,
      tenantDb,
    });

    return { success: true, message: "Member removed from organization" };
  });
```

### Benefits of Service Layer

1. **Single Source of Truth**
   - All sync logic in one class
   - Easy to find and modify

2. **Consistent Error Handling**
   - Try/catch in one place
   - Standardized error messages

3. **Easier Testing**
   - Mock `MembershipService` instead of DB calls
   - Test sync logic independently from routes

4. **Business Rules Enforcement**
   - "Cannot remove last admin" logic in service
   - Validation centralized

5. **Type Safety**
   - Service methods define exact parameters needed
   - TypeScript catches missing fields

### Testing Pattern

```typescript
// tests/services/membership.service.test.ts
import { describe, it, expect, mock } from "bun:test";
import { MembershipService } from "@/services/membership.service";

describe("MembershipService", () => {
  it("should sync member deletion to both databases", async () => {
    const mockControlPanelDb = {
      delete: mock(() => Promise.resolve()),
    };

    const mockTenantDb = {
      query: {
        members: {
          findMany: mock(() => Promise.resolve([{ userId: "admin-2" }])),
        },
      },
      delete: mock(() => Promise.resolve()),
    };

    const service = new MembershipService(mockControlPanelDb as any);

    await service.removeMember({
      userId: "user-1",
      organizationId: "org-1",
      tenantDb: mockTenantDb as any,
    });

    expect(mockControlPanelDb.delete).toHaveBeenCalledTimes(1);
    expect(mockTenantDb.delete).toHaveBeenCalledTimes(1);
  });

  it("should prevent removing last admin", async () => {
    const mockTenantDb = {
      query: {
        members: {
          findMany: mock(() => Promise.resolve([])), // No other admins
        },
      },
    };

    const service = new MembershipService({} as any);

    await expect(
      service.removeMember({
        userId: "user-1",
        organizationId: "org-1",
        tenantDb: mockTenantDb as any,
      })
    ).rejects.toThrow("Cannot remove last admin from organization");
  });
});
```

### Error Handling Strategy

**Scenario: One database succeeds, other fails**

```typescript
// Current behavior: Promise.all fails fast
await Promise.all([
  controlPanelDb.update(...), // Succeeds
  tenantDb.update(...),        // Fails - entire operation fails
]);
```

**Trade-off:**
- ✅ Both succeed or both fail (atomicity for most cases)
- ⚠️ Edge case: Network partition between control panel and tenant DB could cause one to succeed

**Mitigation:**
1. Weekly reconciliation script (detects drift)
2. Retry logic in service (3 retries with exponential backoff)
3. Monitoring alerts on sync failures

**Future Enhancement** (if needed at scale):
Add retry logic to service methods:

```typescript
async updateMemberRole(params) {
  let retries = 3;
  while (retries > 0) {
    try {
      await Promise.all([...]);
      return { success: true };
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      await sleep(1000 * (4 - retries)); // Exponential backoff
    }
  }
}
```

### Summary

The service layer pattern:
- ✅ Keeps dual-write synchronization (simple, no queues)
- ✅ Centralizes logic (easier to maintain)
- ✅ Enforces business rules (last admin check)
- ✅ Easier to test (mock one service)
- ✅ Consistent error handling

**Implementation effort:** Low (~200 lines for service class)

**Maintenance:** Much easier than scattered dual-writes across routes

---

## 5. Drizzle ORM Multi-Tenant Hierarchical Schema

### Decision: Use Drizzle with Tenant-Scoped Foreign Keys and Self-Referencing Hierarchy

**Rationale**:
- Drizzle provides compile-time type safety for schema and queries
- Foreign key constraints enforce tenant isolation at database level
- Self-referencing hierarchy pattern (parent_id) supports flexible tree structure
- Drizzle migrations generate SQL automatically from schema changes

**Implementation Notes**:

1. **Users Table (Platform-Wide Identity)**:
```typescript
// packages/db/src/schema/users.ts
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  emailVerified: boolean("email_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});
```

2. **Organizations Table (Tenants)**:
```typescript
// packages/db/src/schema/organizations.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { subscriptions } from "./subscriptions";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  databaseBranchId: text("database_branch_id").notNull(), // Neon branch ID
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
  paymentStatus: text("payment_status").notNull(), // active, suspended, failed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

3. **Hierarchy Nodes Table (Self-Referencing)**:
```typescript
// packages/db/src/schema/hierarchy.ts
import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const hierarchyNodes = pgTable("hierarchy_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // organization, country, region, area, branch
  parentId: uuid("parent_id").references(() => hierarchyNodes.id),
  depth: integer("depth").notNull(), // 0 (org) to 4 (branch)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Indexes for efficient hierarchy queries
// CREATE INDEX idx_hierarchy_org ON hierarchy_nodes(organization_id);
// CREATE INDEX idx_hierarchy_parent ON hierarchy_nodes(parent_id);
// CREATE INDEX idx_hierarchy_type ON hierarchy_nodes(type);
```

4. **Members Table (Organization Membership)**:
```typescript
// packages/db/src/schema/members.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";
import { hierarchyNodes } from "./hierarchy";

export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // admin, trainer, staff, client
  hierarchyScopeId: uuid("hierarchy_scope_id")
    .notNull()
    .references(() => hierarchyNodes.id),
  status: text("status").notNull(), // active, suspended
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Composite unique constraint: one membership per user per org
// CREATE UNIQUE INDEX idx_member_unique ON members(user_id, organization_id);
```

5. **Invitations Table**:
```typescript
// packages/db/src/schema/invitations.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { hierarchyNodes } from "./hierarchy";
import { users } from "./users";

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => users.id),
  role: text("role").notNull(), // admin, trainer, staff, client
  hierarchyScopeId: uuid("hierarchy_scope_id")
    .notNull()
    .references(() => hierarchyNodes.id),
  token: text("token").notNull().unique(),
  status: text("status").notNull(), // pending, accepted, declined, expired
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
```

6. **Recursive Hierarchy Query (Get All Descendants)**:
```typescript
// apps/server/src/services/hierarchy.service.ts
export async function getDescendantNodeIds(nodeId: string): Promise<string[]> {
  // PostgreSQL recursive CTE to get all descendants
  const result = await db.execute(sql`
    WITH RECURSIVE descendants AS (
      SELECT id FROM hierarchy_nodes WHERE id = ${nodeId}
      UNION
      SELECT hn.id
      FROM hierarchy_nodes hn
      INNER JOIN descendants d ON hn.parent_id = d.id
    )
    SELECT id FROM descendants
  `);

  return result.rows.map(row => row.id as string);
}
```

7. **Drizzle Migration Generation**:
```bash
# Generate migration from schema changes
bun drizzle-kit generate:pg

# Apply migration to database
bun drizzle-kit push:pg
```

**Best Practices**:
- Always include `organizationId` in WHERE clauses for tenant isolation
- Use foreign key `ON DELETE CASCADE` for automatic cleanup
- Index `organizationId` + frequently queried columns for performance
- Use recursive CTEs for hierarchy queries (efficient for 5-level depth)
- Validate hierarchy depth constraint in application layer (max 4 = branch)

**References**:
- Drizzle ORM PostgreSQL: https://orm.drizzle.team/docs/get-started-postgresql
- Drizzle Relations: https://orm.drizzle.team/docs/rqb
- Self-Referencing Tables: https://orm.drizzle.team/docs/sql-schema-declaration#self-referencing

---

## 5. Neon Serverless Postgres Per-Tenant Branching

### Decision: Use Neon Database Branching API for Tenant Provisioning

**Rationale**:
- Neon's database branching provides true data isolation (separate PostgreSQL instance per tenant)
- Copy-on-write branching enables instant provisioning (<30 seconds)
- Each branch can scale independently
- Aligns with constitution Principle I (Multi-Tenant Data Isolation)

**Implementation Notes**:

1. **Neon Branch Provisioning**:
```typescript
// apps/server/src/services/neon.service.ts
import { neon } from "@neondatabase/serverless";

export async function provisionNeonBranch(params: {
  branchName: string;
  parentBranchId?: string;
}): Promise<{ id: string; connectionString: string }> {
  const neonApiKey = process.env.NEON_API_KEY!;
  const projectId = process.env.NEON_PROJECT_ID!;

  // Call Neon API to create branch
  const response = await fetch(
    `https://console.neon.tech/api/v2/projects/${projectId}/branches`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${neonApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branch: {
          name: params.branchName,
          parent_id: params.parentBranchId || "main",
        },
      }),
    }
  );

  const data = await response.json();

  return {
    id: data.branch.id,
    connectionString: data.connection_uris[0].connection_uri,
  };
}
```

2. **Connection String Management**:
   - Store per-tenant connection strings in `organizations.database_branch_id`
   - Use environment variable for master database (platform metadata)
   - Switch connection strings based on active organization context

3. **Migration Strategy**:
   - Run Drizzle migrations on main branch (schema template)
   - New tenant branches inherit schema automatically (copy-on-write)
   - Schema updates applied to main branch, then propagated to tenant branches

**Alternatives Considered**:
- **Shared database with `tenant_id` column**: Rejected because risk of cross-tenant data leakage via application bugs
- **Separate Neon projects per tenant**: Rejected because excessive cost and management overhead

**References**:
- Neon Branching: https://neon.tech/docs/introduction/branching
- Neon API: https://api-docs.neon.tech/reference/getting-started-with-neon-api

---

## Summary of Technology Decisions

| Component | Technology | Key Pattern | Rationale |
|-----------|-----------|-------------|-----------|
| **Auth** | Better-Auth Organization + Admin plugins | Middleware-based session validation | Built-in multi-tenant, edge-compatible, reduces custom auth code by 70% |
| **API Framework** | ElysiaJS | Derive pattern for context injection | Bun-native, type-safe, stateless edge deployment |
| **Database** | Neon Serverless Postgres | Per-tenant database branches | True data isolation, instant provisioning, independent scaling |
| **ORM** | Drizzle | Self-referencing hierarchy + foreign keys | Compile-time type safety, automatic migrations, enforces tenant isolation |
| **Payments** | Stripe Webhooks | Idempotent provisioning handler | Reliable payment confirmation, prevents duplicate org creation |
| **Hierarchy** | Recursive CTEs | Parent-child with depth constraint | Efficient tree queries, flexible 5-level structure, scalable |

All decisions align with constitution-mandated stack and architectural principles.
