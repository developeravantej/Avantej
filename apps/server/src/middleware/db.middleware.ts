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
import { decrypt } from "@avantej-core/db";
import { getBetterAuth } from "@/lib/better-auth";
import {
	dispatchStaffSync as dispatchStaffSyncRaw,
	dispatchProfileSync as dispatchProfileSyncRaw,
	type ServerDispatchStaffSyncArgs,
	type ServerDispatchProfileSyncArgs,
} from "@/services/ghl/dispatch-staff-sync";
import {
	dispatchBranchSync as dispatchBranchSyncRaw,
	dispatchBranchRename as dispatchBranchRenameRaw,
	dispatchBranchRemove as dispatchBranchRemoveRaw,
	dispatchBranchMove as dispatchBranchMoveRaw,
	type ServerDispatchBranchSyncArgs,
	type DispatchBranchRenameArgs,
	type DispatchBranchRemoveArgs,
	type DispatchBranchMoveArgs,
} from "@/services/ghl/dispatch-branch-sync";

/**
 * Env-bound staff sync dispatcher: identical to the underlying dispatcher
 * but with `env` already filled from request-scoped Cloudflare bindings,
 * so call sites in shared routers (`@avantej-core/api`) don't need to know
 * about Cloudflare-only env access.
 */
export type BoundDispatchStaffSync = (
	args: Omit<ServerDispatchStaffSyncArgs, "env">,
) => ReturnType<typeof dispatchStaffSyncRaw>;

export type BoundDispatchProfileSync = (
	args: Omit<ServerDispatchProfileSyncArgs, "env">,
) => ReturnType<typeof dispatchProfileSyncRaw>;

export type BoundDispatchBranchSync = (
	args: ServerDispatchBranchSyncArgs,
) => ReturnType<typeof dispatchBranchSyncRaw>;

export type BoundDispatchBranchRename = (
	args: DispatchBranchRenameArgs,
) => ReturnType<typeof dispatchBranchRenameRaw>;

export type BoundDispatchBranchRemove = (
	args: DispatchBranchRemoveArgs,
) => ReturnType<typeof dispatchBranchRemoveRaw>;

export type BoundDispatchBranchMove = (
	args: DispatchBranchMoveArgs,
) => ReturnType<typeof dispatchBranchMoveRaw>;

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
			500,
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
	c.set("decrypt", decrypt);
	// Store getBetterAuth function reference for use in createContext
	c.set("getBetterAuth", () => getBetterAuth(c));

	// Bind GHL staff sync dispatchers with request-scoped env. Routers in
	// `@avantej-core/api` cannot import from `apps/server` (would be a circular
	// dep) and have no access to `cloudflare:workers` env, so we expose the
	// dispatchers via Hono context the same way `controlPanelDb` is exposed.
	const ghlAgencyId = getEnvVar("GHL_AGENCY_ID");
	if (ghlAgencyId) {
		const env = { GHL_AGENCY_ID: ghlAgencyId };
		const boundDispatchStaffSync: BoundDispatchStaffSync = (args) =>
			dispatchStaffSyncRaw({ ...args, env });
		const boundDispatchProfileSync: BoundDispatchProfileSync = (args) =>
			dispatchProfileSyncRaw({ ...args, env });
		c.set("dispatchStaffSync", boundDispatchStaffSync);
		c.set("dispatchProfileSync", boundDispatchProfileSync);
	}

	// Branch sync needs no env vars (org-scoped api key lives in DB), so it's
	// always available — gate runtime in the dispatcher itself (org-shared
	// flag + presence of ghlLocationId).
	const boundDispatchBranchSync: BoundDispatchBranchSync = (args) =>
		dispatchBranchSyncRaw(args);
	c.set("dispatchBranchSync", boundDispatchBranchSync);

	const boundDispatchBranchRename: BoundDispatchBranchRename = (args) =>
		dispatchBranchRenameRaw(args);
	c.set("dispatchBranchRename", boundDispatchBranchRename);

	const boundDispatchBranchRemove: BoundDispatchBranchRemove = (args) =>
		dispatchBranchRemoveRaw(args);
	c.set("dispatchBranchRemove", boundDispatchBranchRemove);

	const boundDispatchBranchMove: BoundDispatchBranchMove = (args) =>
		dispatchBranchMoveRaw(args);
	c.set("dispatchBranchMove", boundDispatchBranchMove);

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
