/**
 * Grant sales-pipeline-fixes permissions to the admin role.
 *
 * The 2026-05-12 sales-pipeline-fixes session introduced new gates:
 *  - commission_payout (Phase 2 Payouts UI)
 *  - package_management (Phase 5 lifecycle CRUD)
 *  - hierarchy_management (Phase 0 branch QR — verify present)
 *  - pos (Phase 7 — verify present; POS create gate)
 *
 * Without seeding these for the admin role, the new pages render "Permission
 * Denied" even for tenant admins. Idempotent — safe to run multiple times.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/grant-sales-pipeline-permissions.ts
 *   # Optional: --org=<orgId> (defaults to test fitness franchise)
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	permissions,
	rolePermissions,
} from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

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

const NEW_PERMISSIONS: ReadonlyArray<{ resource: string; action: string }> = [
	// Phase 2 Payouts
	{ resource: "commission_payout", action: "read" },
	{ resource: "commission_payout", action: "create" },
	{ resource: "commission_payout", action: "update" },
	{ resource: "commission_payout", action: "process" },
	{ resource: "commission_payout", action: "delete" },
	// Commission management — listLedger / approve / etc. (seed-rbac defines
	// these but older tenants may not have them; backfill here so admin gets
	// all rows via "priority >= 100" all-perms branch in userContext).
	{ resource: "commission_management", action: "read" },
	{ resource: "commission_management", action: "update" },
	{ resource: "commission_management", action: "approve" },
	{ resource: "commission_management", action: "process" },
	// Phase 5 Package lifecycle
	{ resource: "package_management", action: "read" },
	{ resource: "package_management", action: "create" },
	{ resource: "package_management", action: "update" },
	{ resource: "package_management", action: "delete" },
	{ resource: "package_management", action: "manage" },
	// Phase 0 Branch QR onboarding
	{ resource: "hierarchy_management", action: "read" },
	{ resource: "hierarchy_management", action: "create" },
	{ resource: "hierarchy_management", action: "update" },
	{ resource: "hierarchy_management", action: "delete" },
	// Phase 7 / Phase 6 — POS create + sales cancel
	{ resource: "pos", action: "create" },
	{ resource: "pos", action: "read" },
	{ resource: "sales", action: "read" },
	{ resource: "sales", action: "create" },
	{ resource: "sales", action: "update" },
	{ resource: "sales", action: "delete" },
];

async function main() {
	const orgArg = process.argv.find((a) => a.startsWith("--org="));
	const orgId = orgArg ? orgArg.split("=")[1] : DEFAULT_ORG_ID;
	if (!orgId) throw new Error("Invalid --org argument");

	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const cpPool = new Pool({ connectionString: databaseUrl });
	const cpDb = drizzle({ client: cpPool, schema: controlPanelSchema });
	let tPool: Pool | null = null;

	try {
		const org = await cpDb.query.organizations.findFirst({
			where: (o, { eq }) => eq(o.id, orgId),
		});
		if (!org) throw new Error(`Organization ${orgId} not found`);
		console.log(`Org: ${org.name} (${org.id})`);

		tPool = new Pool({ connectionString: decrypt(org.connectionString) });
		const tDb = drizzle({ client: tPool, schema: tenantSchema });

		const adminRole = await tDb.query.roles.findFirst({
			where: (r, { eq }) => eq(r.name, "admin"),
		});
		if (!adminRole) throw new Error("Admin role not found");
		console.log(`Admin role: ${adminRole.id}\n`);

		let created = 0;
		let granted = 0;

		for (const perm of NEW_PERMISSIONS) {
			const existing = await tDb.query.permissions.findFirst({
				where: (p, { and, eq }) =>
					and(eq(p.resource, perm.resource), eq(p.action, perm.action)),
			});

			let permId: string;
			if (existing) {
				permId = existing.id;
				console.log(`  EXISTS  ${perm.resource}:${perm.action}`);
			} else {
				const [inserted] = await tDb
					.insert(permissions)
					.values(perm)
					.returning();
				permId = inserted!.id;
				created++;
				console.log(`  CREATED ${perm.resource}:${perm.action}`);
			}

			const grantResult = await tDb
				.insert(rolePermissions)
				.values({ roleId: adminRole.id, permissionId: permId })
				.onConflictDoNothing()
				.returning();
			if (grantResult.length > 0) granted++;
		}

		console.log(
			`\nDone. ${created} permissions created, ${granted} new grants to admin role.`,
		);
		console.log(
			"Clear browser localStorage (key: permission cache) and reload to pick up new permissions.",
		);
	} finally {
		await cpPool.end();
		if (tPool) await tPool.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
