/**
 * E2E Database Fixtures
 *
 * Provides direct Drizzle clients for control-panel and tenant databases.
 * Tenant DB is resolved per-organization by decrypting organizations.connectionString
 * (matches what the dev server does at request time).
 *
 * Required env vars (pulled from apps/server/.env at test runtime):
 *   DATABASE_URL    — control panel Neon database
 *   ENCRYPTION_KEY  — used to decrypt organizations.connectionString
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import ws from "ws";
import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

// WebSocket support required by @neondatabase/serverless in Node
neonConfig.webSocketConstructor = ws;

// Default dev org name. Override via E2E_ORG_NAME if needed.
const DEFAULT_ORG_NAME = "Test Fitness Franchise";

export function getControlPanelDb() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL required for E2E tests");
	const pool = new Pool({ connectionString: url });
	return drizzle({ client: pool, schema: controlPanelSchema });
}

let cachedTenantUrl: { orgName: string; url: string } | null = null;

/**
 * Resolves the tenant DB connection string for the dev test organization
 * by reading and decrypting organizations.connectionString. Cached per
 * orgName for the lifetime of the test process.
 */
export async function getTenantDb() {
	const orgName = process.env.E2E_ORG_NAME ?? DEFAULT_ORG_NAME;
	let url: string;
	if (cachedTenantUrl && cachedTenantUrl.orgName === orgName) {
		url = cachedTenantUrl.url;
	} else {
		const cp = getControlPanelDb();
		const org = await cp.query.organizations.findFirst({
			where: eq(controlPanelSchema.organizations.name, orgName),
		});
		if (!org) {
			throw new Error(`Organization "${orgName}" not found in control panel DB`);
		}
		url = decrypt(org.connectionString);
		cachedTenantUrl = { orgName, url };
	}
	const pool = new Pool({ connectionString: url });
	return drizzle({ client: pool, schema: tenantSchema });
}
