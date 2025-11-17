/**
 * Control Panel Database Client
 *
 * Provides Drizzle ORM client for the control panel database.
 * This is the single Neon project that stores platform metadata:
 * - Better-Auth tables (users, sessions, accounts, verifications)
 * - Control panel tables (subscriptions, organizations, organization_members, platform_admins, admin_sessions)
 *
 * Environment Variable:
 * - DATABASE_URL: Connection string for the control panel Neon database
 *
 * Usage:
 * ```typescript
 * import { controlPanelDb } from "@/lib/db";
 *
 * const users = await controlPanelDb.query.user.findMany();
 * const org = await controlPanelDb.query.organizations.findFirst({...});
 * ```
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "cloudflare:workers";
import ws from "ws";
import { eq } from "drizzle-orm";
// Import control panel schemas (auth + control-panel tables)
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
// Import tenant schemas (hierarchy_nodes, members, invitations)
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
// Import organizations table for lookups
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
// Import encryption utilities
import { decrypt } from "@avantej-core/db";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

// Configure Neon for Cloudflare Workers (WebSocket support for transactions)
neonConfig.webSocketConstructor = ws;

/**
 * Get control panel database connection string from environment
 */
function getDatabaseUrl(): string {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is required for control panel database"
    );
  }

  return databaseUrl;
}

/**
 * Create Pool for control panel database
 * Uses Pool with neon-serverless adapter for transaction support
 */
const controlPanelPool = new Pool({ connectionString: getDatabaseUrl() });

/**
 * Drizzle ORM client for control panel database
 *
 * Includes all control panel schemas:
 * - Better-Auth: user, session, account, verification
 * - Control Panel: subscriptions, organizations, organization_members, platform_admins, admin_sessions
 *
 * Supports transactions via WebSocket connection
 */
export const controlPanelDb = drizzle({
  client: controlPanelPool,
  schema: controlPanelSchema,
});

/**
 * Tenant Database Connection Router
 *
 * Routes requests to the correct tenant database based on organization ID.
 *
 * Process:
 * 1. Queries control panel database to find organization record
 * 2. Decrypts the stored connection string
 * 3. Creates and returns Drizzle client connected to that tenant's database
 *
 * @param organizationId - UUID of the organization
 * @returns Drizzle client for the tenant database with tenant schemas
 * @throws Error if organization not found or connection string invalid
 *
 * Usage:
 * ```typescript
 * import { getTenantDb } from "@/lib/db";
 *
 * const tenantDb = await getTenantDb("org-123-uuid");
 * const members = await tenantDb.query.members.findMany();
 * ```
 */
export async function getTenantDb(
  organizationId: string
): Promise<NeonDatabase<typeof tenantSchema>> {
  // Lookup organization in control panel database
  const organization = await controlPanelDb.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });

  if (!organization) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  // Decrypt connection string
  let connectionString: string;
  try {
    connectionString = decrypt(organization.connectionString);
  } catch (error) {
    throw new Error(
      `Failed to decrypt connection string for organization ${organizationId}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  // Create Pool for tenant database (supports transactions)
  const tenantPool = new Pool({ connectionString });

  // Create and return Drizzle client with tenant schemas
  return drizzle({
    client: tenantPool,
    schema: tenantSchema,
  });
}
