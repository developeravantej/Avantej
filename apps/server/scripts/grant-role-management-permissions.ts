/**
 * Grant role_management and permission_management permissions to the admin role.
 *
 * These permissions are not in the default seed-rbac.ts, so the access-control
 * routes (user-assignment, roles, permissions) redirect franchisee users with
 * ?unauthorized=true even when they have role:"admin".
 *
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/grant-role-management-permissions.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { permissions, rolePermissions } from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const m = line.trim().match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined && !process.env[m[1]])
				process.env[m[1]] = m[2];
		}
	} catch {
		console.warn("Could not load .dev.vars");
	}
}

const NEW_PERMISSIONS = [
	{ resource: "role_management", action: "create" },
	{ resource: "role_management", action: "read" },
	{ resource: "role_management", action: "update" },
	{ resource: "role_management", action: "delete" },
	{ resource: "permission_management", action: "create" },
	{ resource: "permission_management", action: "read" },
	{ resource: "permission_management", action: "update" },
	{ resource: "permission_management", action: "delete" },
];

async function main() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const cpPool = new Pool({ connectionString: databaseUrl });
	const cpDb = drizzle({ client: cpPool, schema: controlPanelSchema });
	let tPool: Pool | null = null;

	try {
		const org = await cpDb.query.organizations.findFirst({
			where: (o, { eq }) => eq(o.id, TARGET_ORG_ID),
		});
		if (!org) throw new Error("Organization not found");

		tPool = new Pool({ connectionString: decrypt(org.connectionString) });
		const tDb = drizzle({ client: tPool, schema: tenantSchema });

		// 1. Find admin role
		const adminRole = await tDb.query.roles.findFirst({
			where: (r, { eq }) => eq(r.name, "admin"),
		});
		if (!adminRole) throw new Error("Admin role not found");
		console.log(`Admin role: ${adminRole.id}`);

		// 2. Upsert each new permission and grant to admin
		for (const perm of NEW_PERMISSIONS) {
			// Insert permission if missing
			const existing = await tDb.query.permissions.findFirst({
				where: (p, { and, eq }) => and(eq(p.resource, perm.resource), eq(p.action, perm.action)),
			});

			let permId: string;
			if (existing) {
				permId = existing.id;
				console.log(`  EXISTS  ${perm.resource}:${perm.action} (${permId})`);
			} else {
				const [inserted] = await tDb.insert(permissions).values(perm).returning();
				permId = inserted!.id;
				console.log(`  CREATED ${perm.resource}:${perm.action} (${permId})`);
			}

			// Grant to admin role
			await tDb.insert(rolePermissions).values({ roleId: adminRole.id, permissionId: permId }).onConflictDoNothing();
			console.log(`  GRANTED ${perm.resource}:${perm.action} → admin`);
		}

		console.log("\nDone. Clear browser localStorage and reload to pick up new permissions.");
	} finally {
		await cpPool.end();
		if (tPool) await tPool.end();
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => { console.error(err); process.exit(1); });
