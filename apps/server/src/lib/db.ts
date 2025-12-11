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
 * Usage in request handlers (preferred):
 * ```typescript
 * import { getControlPanelDb } from "@/lib/db";
 * import type { Context } from "hono";
 *
 * const db = getControlPanelDb(c); // c is Hono context
 * const users = await db.query.user.findMany();
 * ```
 *
 * Usage outside request handlers (tests, scripts):
 * ```typescript
 * import { controlPanelDb } from "@/lib/db";
 *
 * const users = await controlPanelDb.query.user.findMany();
 * ```
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
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
 * Get environment variable from Cloudflare Workers env or process.env (for Node.js/test environments)
 */
function getEnvVar(key: string): string | undefined {
	try {
		// Try to access Cloudflare Workers env (only available in Workers runtime)
		// Using dynamic require to avoid TypeScript errors in Node.js/test environments
		const cloudflareWorkers = require("cloudflare:workers") as { env?: Record<string, string> };
		if (cloudflareWorkers?.env?.[key]) {
			return cloudflareWorkers.env[key];
		}
	} catch {
		// Not in Cloudflare Workers environment (e.g., in tests)
	}
	// Fall back to process.env
	return process.env[key];
}

/**
 * Get control panel database connection string from environment
 */
function getDatabaseUrl(): string {
	const databaseUrl = getEnvVar("DATABASE_URL");

	if (!databaseUrl) {
		throw new Error(
			"DATABASE_URL environment variable is required for control panel database"
		);
	}

	return databaseUrl;
}

/**
 * Lazy-loaded Pool for control panel database (initialized on first use)
 * Uses Pool with neon-serverless adapter for transaction support
 */
let controlPanelPool: Pool | null = null;

/**
 * Get control panel database pool (lazy-loaded)
 */
function getControlPanelPool(): Pool {
	if (!controlPanelPool) {
		controlPanelPool = new Pool({ connectionString: getDatabaseUrl() });
	}
	return controlPanelPool;
}

/**
 * Get request-scoped control panel database client from Hono context
 *
 * Prefers request-scoped pool from context (created by dbMiddleware).
 * Falls back to singleton pool for non-request contexts (tests, scripts).
 *
 * @param c - Optional Hono context. If provided, uses request-scoped pool.
 * @returns Drizzle client for control panel database
 */
export function getControlPanelDb(
	c?: Context
): NeonDatabase<typeof controlPanelSchema> {
	// If context is provided and has request-scoped pool, use it
	if (c) {
		const contextDb = c.get("controlPanelDb");
		if (contextDb) {
			return contextDb;
		}
	}

	// Fall back to singleton pool (for tests, scripts, etc.)
	return drizzle({
		client: getControlPanelPool(),
		schema: controlPanelSchema,
	});
}

/**
 * Legacy export: Singleton control panel database client
 *
 * @deprecated Use getControlPanelDb(c) in request handlers for Cloudflare Workers compatibility.
 * This singleton pool cannot be shared across requests in Cloudflare Workers.
 * Only use this in test environments or scripts outside request handlers.
 */
export const controlPanelDb = drizzle({
	client: getControlPanelPool(),
	schema: controlPanelSchema,
});

/**
 * Tenant Database Connection Router
 *
 * Routes requests to the correct tenant database based on organization ID.
 * Uses request-scoped pools when available (from Hono context) for Cloudflare Workers compatibility.
 *
 * Process:
 * 1. Queries control panel database to find organization record
 * 2. Decrypts the stored connection string
 * 3. Creates or reuses request-scoped pool for the tenant database
 * 4. Returns Drizzle client connected to that tenant's database
 *
 * @param organizationId - UUID of the organization
 * @param c - Optional Hono context. If provided, uses request-scoped pools and caches within request.
 * @returns Drizzle client for the tenant database with tenant schemas
 * @throws Error if organization not found or connection string invalid
 *
 * Usage in request handlers (preferred):
 * ```typescript
 * import { getTenantDb } from "@/lib/db";
 * import type { Context } from "hono";
 *
 * const tenantDb = await getTenantDb("org-123-uuid", c); // c is Hono context
 * const members = await tenantDb.query.members.findMany();
 * ```
 *
 * Usage outside request handlers (tests, scripts):
 * ```typescript
 * import { getTenantDb } from "@/lib/db";
 *
 * const tenantDb = await getTenantDb("org-123-uuid");
 * const members = await tenantDb.query.members.findMany();
 * ```
 */
export async function getTenantDb(
	organizationId: string,
	c?: Context
): Promise<NeonDatabase<typeof tenantSchema>> {
	// Get control panel database (prefer request-scoped)
	const controlPanelDb = getControlPanelDb(c);

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

	// If context is provided, use request-scoped pool caching
	if (c) {
		const tenantPools = c.get("tenantPools");
		if (tenantPools) {
			// Check if pool already exists for this organization in this request
			let tenantPool = tenantPools.get(organizationId);
			if (!tenantPool) {
				// Create new request-scoped pool and cache it
				tenantPool = new Pool({ connectionString });
				tenantPools.set(organizationId, tenantPool);
			}

			// Create and return Drizzle client with tenant schemas
			return drizzle({
				client: tenantPool,
				schema: tenantSchema,
			});
		} else {
			// tenantPools not initialized - create a temporary pool
			// This shouldn't happen if dbMiddleware runs first, but handle it gracefully
			console.warn("tenantPools not found in context, creating temporary pool for organization:", organizationId);
			const tenantPool = new Pool({ connectionString });
			return drizzle({
				client: tenantPool,
				schema: tenantSchema,
			});
		}
	}

	// Fall back to creating a new pool (for tests, scripts, etc.)
	// Note: In Cloudflare Workers, this should not be used in request handlers
	const tenantPool = new Pool({ connectionString });

	// Create and return Drizzle client with tenant schemas
	return drizzle({
		client: tenantPool,
		schema: tenantSchema,
	});
}
