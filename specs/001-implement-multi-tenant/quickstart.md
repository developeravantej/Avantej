# Quickstart: Multi-Tenant Authentication Development

**Feature**: 001-implement-multi-tenant
**Date**: 2025-10-08
**Prerequisites**: Bun 1.x, Neon account (free tier), Stripe account (test mode)

## Local Development Setup

### 1. Install Dependencies

```bash
# From repository root
bun install

# Install Turborepo globally (optional)
bun add -g turbo
```

### 2. Environment Configuration

Create `.env` files for each app:

**`apps/server/.env`**:
```env
# Control Panel Database (platform metadata, routing)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/avantej_control_panel

# Better-Auth
BETTER_AUTH_SECRET=your-secret-key-min-32-characters
BETTER_AUTH_URL=http://localhost:3000

# Encryption (for tenant connection strings)
ENCRYPTION_KEY=64-character-hex-string-32-bytes  # Generate: openssl rand -hex 32

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Neon API (for creating tenant projects)
NEON_API_KEY=your-neon-api-key

# Cloudflare (for production only)
# CLOUDFLARE_API_TOKEN=...
```

**`apps/web/.env`**:
```env
VITE_API_URL=http://localhost:3000
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**`apps/admin/.env`**:
```env
VITE_API_URL=http://localhost:3000
```

### 3. Database Setup

This project uses a **two-database architecture** with **project-per-tenant isolation**:
- **Control Panel Database**: Neon project for platform metadata (users, subscriptions, organizations)
- **Tenant Databases**: Separate Neon project per organization (created dynamically via API)

#### 3.1 Setup Control Panel Database (Neon)

Create a Neon project for the Avantej platform control panel:

```bash
# Option 1: Via Neon Console
# 1. Go to https://console.neon.tech
# 2. Create new project: "avantej-control-panel"
# 3. Copy connection string

# Option 2: Via Neon CLI
neon projects create \
  --name avantej-control-panel \
  --region-id aws-us-west-2

# Copy the connection string to apps/server/.env
# DATABASE_URL=postgresql://user:pass@ep-xxx.aws-us-west-2.neon.tech/neondb
```

Run control panel migrations:

```bash
cd packages/db

# Apply control panel schema
bun run drizzle-kit push:pg --config=drizzle.control-panel.config.ts

# Seed test data (optional)
bun run src/seed-control-panel.ts
```

#### 3.2 Setup Development Tenant Database (Neon)

For local development and testing, create a dev tenant project manually:

```bash
# Create dev tenant project via Neon CLI
neon projects create \
  --name tenant-dev \
  --region-id aws-us-west-2

# Copy connection string (you'll use this when testing tenant features)
# Store in .env.test or use directly in tests
```

Apply tenant schema to dev project:

```bash
cd packages/db

# Set tenant database URL temporarily
TENANT_DATABASE_URL=postgresql://user:pass@ep-yyy.neon.tech/neondb \
  bun run drizzle-kit push:pg --config=drizzle.tenant.config.ts

# Seed dev tenant data (optional)
TENANT_DATABASE_URL=postgresql://... bun run src/seed-tenant.ts
```

#### 3.3 Production Tenant Databases

**Automatic Provisioning**:
- Production tenant databases are created **automatically** via Neon API
- Triggered by Stripe webhook when subscription is confirmed
- Each tenant gets a completely isolated Neon project
- Connection strings are encrypted and stored in control panel database

**No manual setup required** - see `research.md` section 4 for provisioning details.

### 4. Start Development Servers

```bash
# From repository root, start all apps in parallel
turbo dev

# Or start individually:
cd apps/server && bun run dev      # API on http://localhost:3000
cd apps/web && bun run dev      # Web app on http://localhost:5173
cd apps/admin && bun run dev    # Admin panel on http://localhost:5174
```

### 5. Stripe Setup & Webhook Testing

#### Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-brew/stripe

# Windows
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe

# Linux
wget -O stripe.tar.gz https://github.com/stripe/stripe-cli/releases/download/v1.21.11/stripe_1.21.11_linux_x86_64.tar.gz
tar -xvf stripe.tar.gz
sudo mv stripe /usr/local/bin
```

#### Configure Stripe Connect (Manual Steps)

1. **Enable Stripe Connect**:
   - Go to: https://dashboard.stripe.com/test/settings/connect
   - Click "Get started" (if not already enabled)

2. **Configure Connect Settings**:
   - Brand name: "Avantej Core"
   - Support email: your-email@avantej.com
   - Icon/Logo: Upload if available

3. **Get OAuth Client ID**:
   - Under "OAuth settings"
   - Copy the **Client ID** (starts with `ca_`)
   - Add to `apps/server/.env`: `STRIPE_CONNECT_CLIENT_ID=ca_...`
   - Add to `apps/web/.env`: `VITE_STRIPE_CONNECT_CLIENT_ID=ca_...`

4. **Add Product Metadata** (for organization limits):
   - Go to: https://dashboard.stripe.com/test/products
   - For each product (Basic, Pro, Enterprise):
     - Click product name
     - Scroll to "Metadata" section
     - Add keys (see `stripe-config.md` for exact values)
     - Save changes

#### Local Webhook Testing

```bash
# Login to Stripe (opens browser)
stripe login

# Forward webhooks to local API
stripe listen --forward-to http://localhost:8787/webhooks/stripe

# Output will include webhook signing secret:
# > Ready! Your webhook signing secret is whsec_... (^C to quit)

# Copy this secret to apps/server/.env
# STRIPE_WEBHOOK_SECRET=whsec_...
```

#### Test Webhook Events

In a separate terminal:

```bash
# Trigger successful checkout
stripe trigger checkout.session.completed

# Trigger subscription created
stripe trigger customer.subscription.created

# Trigger payment failure
stripe trigger invoice.payment_failed

# View webhook events in dashboard
open https://dashboard.stripe.com/test/webhooks
```

#### Test Stripe Connect Account Creation

```bash
# Test Express account creation (requires API running)
curl -X POST http://localhost:8787/admin/connect/create-account \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "franchise@test.com",
    "country": "US",
    "businessType": "company"
  }'

# Response includes account_id and onboarding_link
```

**See `stripe-config.md` for complete Stripe configuration details.**

---

## Testing the Authentication Flow

### 1. Register a New User

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@test.com",
    "password": "SecurePass123!",
    "name": "Test Owner"
  }'
```

Response:
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "owner@test.com",
  "message": "Verification email sent"
}
```

### 2. Verify Email (Development)

In development, verification tokens are logged to console. Copy the token and:

```bash
curl -X POST http://localhost:3000/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }'
```

### 3. Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@test.com",
    "password": "SecurePass123!"
  }'
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "owner@test.com",
    "name": "Test Owner",
    "emailVerified": true
  },
  "organizations": []
}
```

### 4. Create Organization (After Simulated Payment)

For development, bypass Stripe webhook by directly creating subscription:

```bash
# Insert subscription record directly (or use seed script)
psql $DATABASE_URL -c "
INSERT INTO subscriptions (stripe_subscription_id, stripe_customer_id, tier, organization_count_limit, status)
VALUES ('sub_dev_test', 'cus_dev_test', 'professional', 3, 'active');
"

# Then create organization via API
curl -X POST http://localhost:3000/orgs \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Downtown Fitness",
    "slug": "downtown-fitness",
    "subscriptionId": "<subscription_id_from_above>"
  }'
```

---

## Development Workflow

### Running Tests

```bash
# Run all tests
turbo test

# Run API unit tests
cd apps/server && bun test

# Run E2E tests (requires apps running)
cd apps/web && bun test:e2e

# Run with coverage
turbo test -- --coverage
```

### Database Migrations

```bash
# Generate migration from schema changes
cd packages/db
bun run drizzle-kit generate:pg

# Apply migration
bun run drizzle-kit push:pg

# View migration SQL
cat migrations/0001_*.sql
```

### Stripe Webhook Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-brew/stripe

# Login to Stripe
stripe login

# Forward webhooks to local API
stripe listen --forward-to http://localhost:3000/webhooks/stripe

# Trigger test webhook
stripe trigger payment_intent.succeeded
```

### Better-Auth Configuration

Edit `apps/server/src/lib/better-auth.ts`:

```typescript
import { betterAuth } from "better-auth";
import { organization, admin } from "better-auth/plugins";

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  session: {
    expiresIn: 60 * 15, // 15 minutes (constitution requirement)
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: async ({ user }) => {
        // Custom logic: check if user has valid subscription
        const subscription = await getActiveSubscription(user.id);
        return !!subscription;
      },
    }),
    admin({
      impersonationSessionDuration: 60 * 60, // 1 hour
    }),
  ],
});
```

---

## Common Development Tasks

### Add a New API Endpoint

1. Define route in `apps/server/src/routes/<domain>.ts`:
```typescript
import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";

export const myRoutes = new Elysia()
  .use(authMiddleware)
  .get("/my-endpoint", async ({ user }) => {
    return { message: `Hello ${user.name}` };
  });
```

2. Register route in `apps/server/src/index.ts`:
```typescript
import { myRoutes } from "./routes/my-routes";

const app = new Elysia()
  .use(myRoutes)
  .listen(3000);
```

### Add a New Database Table

1. Define schema in `packages/db/src/schema/<table>.ts`:
```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const myTable = pgTable("my_table", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
```

2. Export from `packages/db/src/schema/index.ts`:
```typescript
export * from "./my-table";
```

3. Generate and apply migration:
```bash
cd packages/db
bun run drizzle-kit generate:pg
bun run drizzle-kit push:pg
```

### Add a Frontend Component

1. Create component in `apps/web/app/components/<Component>.tsx`:
```typescript
export function MyComponent() {
  return <div>Hello from component</div>;
}
```

2. Use in route `apps/web/app/routes/<route>.tsx`:
```typescript
import { MyComponent } from "../components/MyComponent";

export default function Page() {
  return <MyComponent />;
}
```

### Manage Organization Memberships

Use the `MembershipService` to handle member operations (create, update, delete). This service automatically syncs changes between control panel and tenant databases.

**1. Import the service:**
```typescript
// apps/server/src/routes/members.routes.ts
import { membershipService } from "../services";
import { tenantMiddleware } from "../middleware/tenant.middleware";
```

**2. Use in member routes:**
```typescript
import { Elysia } from "elysia";

export const memberRoutes = new Elysia({ prefix: "/members" })
  .use(tenantMiddleware)

  // Delete member example
  .delete("/:memberId", async ({ params, tenantDb, organization }) => {
    // Get member details
    const member = await tenantDb.query.members.findFirst({
      where: eq(members.id, params.memberId),
    });

    if (!member) {
      throw new Error("Member not found");
    }

    // Service handles sync to both databases
    await membershipService.removeMember({
      userId: member.userId,
      organizationId: organization.id,
      tenantDb,
    });

    return { success: true, message: "Member removed" };
  });
```

**Available methods:**
- `createMember()` - Create member from invitation
- `updateMemberRole()` - Change member role
- `suspendMember()` - Suspend member access
- `reactivateMember()` - Restore member access
- `removeMember()` - Remove member from organization

See `research.md` section 4.6 for complete implementation details and all service methods.

---

## Troubleshooting

### Database Connection Issues

```bash
# Test control panel database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check Neon project status
neon projects list

# Reset control panel database (WARNING: deletes all data)
# 1. Delete project via Neon console
# 2. Recreate project and re-run migrations
neon projects create --name avantej-control-panel
cd packages/db
bun run drizzle-kit push:pg --config=drizzle.control-panel.config.ts
```

### Better-Auth Session Issues

```bash
# Clear session cookies in browser DevTools

# Verify JWT secret is set
echo $BETTER_AUTH_SECRET

# Check session expiry (15 min by default)
# If token expired, use refresh token endpoint
```

### Type Errors After Schema Changes

```bash
# Regenerate TypeScript types from Drizzle schema
cd packages/db
bun run drizzle-kit introspect:pg

# Rebuild all packages
turbo build
```

---

## Production Deployment Checklist

- [ ] Set production environment variables (DATABASE_URL, STRIPE keys, NEON keys)
- [ ] Run database migrations on production database
- [ ] Configure Cloudflare Workers for API deployment
- [ ] Configure Cloudflare Pages for frontend deployments
- [ ] Set up Stripe webhook endpoint (verify signature)
- [ ] Enable HTTPS/TLS 1.3 (automatic with Cloudflare)
- [ ] Configure rate limiting (Cloudflare Workers KV)
- [ ] Set up monitoring (OpenTelemetry, Cloudflare Analytics)
- [ ] Test payment flow end-to-end (use Stripe test mode first)
- [ ] Verify tenant isolation (cannot access other org data)
- [ ] Enable audit logging for admin actions
- [ ] Configure backup strategy (Neon point-in-time recovery)

---

## Useful Commands

```bash
# Build all apps and packages
turbo build

# Lint all code
turbo lint

# Format code
turbo format

# Type check
turbo typecheck

# Clean build artifacts
turbo clean

# Run specific package script
turbo run build --filter=@avantej/database

# Watch mode for API development
cd apps/server && bun --watch src/index.ts
```

---

## Next Steps

After completing local development setup:

1. Review the [API contracts](./contracts/README.md)
2. Read the [data model documentation](./data-model.md)
3. Implement features following the [tasks](./tasks.md) (generated via `/speckit.tasks`)
4. Write tests first (TDD per constitution Principle VIII)
5. Ensure ≥80% test coverage before PR
6. Follow Conventional Commits format for all commits
7. Reference spec ID in PR description: `Closes spec:001-implement-multi-tenant`

Happy coding! 🚀
