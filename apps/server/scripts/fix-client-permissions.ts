/**
 * Fix: Grant service_management:read to client role
 *
 * The client role needs to browse services, categories, and packages
 * in the native app. This script adds the missing permission mapping.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/fix-client-permissions.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { rolePermissions } from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
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
		if (!org) throw new Error("Organization not found");

		const tenantConnectionString = decrypt(org.connectionString);
		tenantPool = new Pool({ connectionString: tenantConnectionString });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		// Find client role
		const clientRole = await tenantDb.query.roles.findFirst({
			where: (r, { eq: eqFn }) => eqFn(r.name, "client"),
		});
		if (!clientRole) throw new Error("Client role not found");
		console.log(`Client role: ${clientRole.id}`);

		// Find service_management:read permission
		const serviceReadPerm = await tenantDb.query.permissions.findFirst({
			where: (p, { eq: eqFn, and: andFn }) =>
				andFn(
					eqFn(p.resource, "service_management"),
					eqFn(p.action, "read"),
				),
		});
		if (!serviceReadPerm) throw new Error("service_management:read permission not found");
		console.log(`Permission: ${serviceReadPerm.id} (service_management:read)`);

		// Grant permission to client role
		await tenantDb
			.insert(rolePermissions)
			.values({
				roleId: clientRole.id,
				permissionId: serviceReadPerm.id,
			})
			.onConflictDoNothing();

		console.log("\nGranted service_management:read to client role");

		// Also update the seed-rbac.ts for future tenant creations
		console.log("\nNOTE: Also update packages/db/src/seed-rbac.ts to include");
		console.log('  "service_management:read" in the client role mappings.');
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
