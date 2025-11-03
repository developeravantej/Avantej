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

import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "cloudflare:workers";
import ws from "ws";
// Import control panel schemas (auth + control-panel tables)
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";

// Configure Neon for Cloudflare Workers
neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

/**
 * Get control panel database connection string from environment
 */
function getDatabaseUrl(): string {
	const databaseUrl = env.DATABASE_URL;
	
	if (!databaseUrl) {
		throw new Error("DATABASE_URL environment variable is required for control panel database");
	}
	
	return databaseUrl;
}

/**
 * Create Neon SQL client for control panel database
 */
const sql = neon(getDatabaseUrl());

/**
 * Drizzle ORM client for control panel database
 * 
 * Includes all control panel schemas:
 * - Better-Auth: user, session, account, verification
 * - Control Panel: subscriptions, organizations, organization_members, platform_admins, admin_sessions
 */
export const controlPanelDb = drizzle(sql, {
	schema: controlPanelSchema,
});

/**
 * Export the Neon SQL client for direct queries if needed
 */
export { sql };

