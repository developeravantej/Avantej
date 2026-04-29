/**
 * Fix: Grant customer_management + walk_in_customer_management to admin role
 *
 * Root cause: permissions added to seeds/permissions.seed.ts never flowed into
 * the admin role's role_permissions. The canonical admin-grant seed is
 * packages/db/src/seed-rbac.ts. This script re-runs seedRBACData against the
 * target tenant DB; seedRBACData is idempotent (onConflictDoNothing) so existing
 * rows are safe.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/fix-customer-permissions.ts
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { seedRBACData } from "@avantej-core/db/seed-rbac";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined) {
				if (!process.env[match[1]]) process.env[match[1]] = match[2];
			}
		}
	} catch {
		console.warn("Could not load .dev.vars");
	}
}

async function main() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const controlPool = new Pool({ connectionString: databaseUrl });
	const controlDb = drizzle({ client: controlPool, schema: controlPanelSchema });

	let tenantPool: Pool | null = null;

	try {
		const org = await controlDb.query.organizations.findFirst({
			where: (orgs, { eq: eqFn }) => eqFn(orgs.id, TARGET_ORG_ID),
		});
		if (!org) throw new Error(`Organization ${TARGET_ORG_ID} not found`);

		const tenantConnectionString = decrypt(org.connectionString);
		tenantPool = new Pool({ connectionString: tenantConnectionString });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		console.log(`Re-running seedRBACData on tenant DB for org ${TARGET_ORG_ID}...`);
		await seedRBACData(tenantDb);
		console.log("seedRBACData completed.");

		const adminRole = await tenantDb.query.roles.findFirst({
			where: (r, { eq: eqFn }) => eqFn(r.name, "admin"),
		});
		if (!adminRole) throw new Error("admin role missing after seed");

		const grantedCustomer = await tenantDb.query.permissions.findMany({
			where: (p, { inArray: inArrayFn }) =>
				inArrayFn(p.resource, ["customer_management", "walk_in_customer_management"]),
		});
		console.log(`\nCatalog rows for customer_management + walk_in_customer_management: ${grantedCustomer.length}`);
		for (const perm of grantedCustomer) {
			console.log(`  - ${perm.resource}:${perm.action} (${perm.id})`);
		}
	} finally {
		await controlPool.end();
		if (tenantPool) await tenantPool.end();
	}
}

main()
	.then(() => {
		console.log("\nDone.");
		process.exit(0);
	})
	.catch((error) => {
		console.error("Failed:", error);
		process.exit(1);
	});
