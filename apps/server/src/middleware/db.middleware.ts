/**
 * Database Middleware
 *
 * Creates request-scoped database connection pools for Cloudflare Workers compatibility.
 * In Cloudflare Workers, connection pools cannot be shared across requests, so we create
 * a new pool for each request and store it in the Hono context.
 *
 * This middleware must be applied early in the middleware chain, before any database access.
 * It ensures that all database operations within a request use the same pool, enabling
 * transaction support.
 *
 * Usage:
 * ```typescript
 * import { dbMiddleware } from "@/middleware/db.middleware";
 *
 * app.use("/*", dbMiddleware);
 * ```
 */

import { createMiddleware } from "hono/factory";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { getBetterAuth } from "@/lib/better-auth";
import type { Context } from "hono";

/**
 * Get environment variable from Cloudflare Workers env or process.env
 */
function getEnvVar(key: string): string | undefined {
	try {
		const cloudflareWorkers = require("cloudflare:workers") as {
			env?: Record<string, string>;
		};
		if (cloudflareWorkers?.env?.[key]) {
			return cloudflareWorkers.env[key];
		}
	} catch {
		// Not in Cloudflare Workers environment
	}
	return process.env[key];
}

/**
 * Database middleware
 *
 * Creates request-scoped connection pools and stores them in Hono context.
 * Ensures proper cleanup after request completion.
 *
 * Injects into context:
 * - `controlPanelPool`: Request-scoped Pool for control panel database
 * - `controlPanelDb`: Request-scoped Drizzle client for control panel database
 * - `tenantPools`: Map of organizationId -> Pool for caching tenant pools within request
 */
export const dbMiddleware = createMiddleware(async (c, next) => {
	const databaseUrl = getEnvVar("DATABASE_URL");
	if (!databaseUrl) {
		return c.json(
			{ error: "DATABASE_URL environment variable is required" },
			500
		);
	}

	// Create request-scoped pool for control panel database
	const controlPanelPool = new Pool({ connectionString: databaseUrl });
	const controlPanelDb = drizzle({
		client: controlPanelPool,
		schema: controlPanelSchema,
	});

	// Map to cache tenant pools within this request
	const tenantPools = new Map<string, Pool>();

	// Store in context
	c.set("controlPanelPool", controlPanelPool);
	c.set("controlPanelDb", controlPanelDb);
	c.set("tenantPools", tenantPools);
	// Store getBetterAuth function reference for use in createContext
	c.set("getBetterAuth", () => getBetterAuth(c));

	try {
		await next();
	} finally {
		// Cleanup: Close all pools after request completes
		// This ensures proper resource cleanup in Cloudflare Workers
		try {
			await controlPanelPool.end();
		} catch (error) {
			console.error("Error closing control panel pool:", error);
		}

		// Close all tenant pools
		for (const [orgId, pool] of tenantPools.entries()) {
			try {
				await pool.end();
			} catch (error) {
				console.error(`Error closing tenant pool for org ${orgId}:`, error);
			}
		}
		tenantPools.clear();
	}
});



