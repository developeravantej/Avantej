/**
 * E2E Database Fixtures
 *
 * Provides direct Drizzle clients for control-panel and tenant databases.
 *
 * NOTE: Uses TENANT_DATABASE_URL directly (bypasses the encrypted-connectionString
 * lookup in getTenantDb). This works because the dev environment has a single tenant.
 * In multi-tenant prod, you would need to decrypt the org's connectionString via
 * the control-panel instead.
 *
 * Required env vars (pulled from apps/server/.env at test runtime):
 *   DATABASE_URL        — control panel Neon database
 *   TENANT_DATABASE_URL — dev tenant Neon database
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

// WebSocket support required by @neondatabase/serverless in Node
neonConfig.webSocketConstructor = ws;

export function getControlPanelDb() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL required for E2E tests");
	const pool = new Pool({ connectionString: url });
	return drizzle({ client: pool, schema: controlPanelSchema });
}

export function getTenantDb() {
	const url = process.env.TENANT_DATABASE_URL;
	if (!url) throw new Error("TENANT_DATABASE_URL required for E2E tests");
	const pool = new Pool({ connectionString: url });
	return drizzle({ client: pool, schema: tenantSchema });
}
