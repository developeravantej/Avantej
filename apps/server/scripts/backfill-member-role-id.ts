#!/usr/bin/env bun
/**
 * One-shot backfill: set members.role_id from roles.id WHERE roles.name = members.role
 * for all members where role_id IS NULL.
 *
 * Safe to re-run — only touches rows with role_id IS NULL.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/backfill-member-role-id.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { members } from "@avantej-core/db/schema/tenant/members";
import { roles } from "@avantej-core/db/schema/tenant/roles";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined) {
				const key = match[1];
				const value = match[2];
				if (!process.env[key]) {
					process.env[key] = value;
				}
			}
		}
	} catch (error) {
		console.warn("Could not load .dev.vars file:", error);
	}
}

async function backfillMemberRoleId() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL required");

	// Connect to control panel DB to get all organizations
	const controlPanelPool = new Pool({ connectionString: databaseUrl });
	const controlPanelDb = drizzle({ client: controlPanelPool, schema: controlPanelSchema });

	const allOrgs = await controlPanelDb.query.organizations.findMany();
	console.log(`Found ${allOrgs.length} organization(s)\n`);

	let grandTotal = 0;

	for (const org of allOrgs) {
		console.log(`Processing: ${org.name} (${org.id})`);

		let tenantConnectionString: string;
		try {
			tenantConnectionString = decrypt(org.connectionString);
		} catch {
			console.error(`  Failed to decrypt connection string, skipping`);
			continue;
		}

		const tenantPool = new Pool({ connectionString: tenantConnectionString });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		try {
			// Run: UPDATE members SET role_id = roles.id FROM roles
			//      WHERE members.role = roles.name AND members.role_id IS NULL
			const result = await tenantDb.execute(sql`
				UPDATE ${members}
				SET role_id = ${roles}.id
				FROM ${roles}
				WHERE ${members}.role = ${roles}.name
				  AND ${members}.role_id IS NULL
			`);

			const rowCount = (result as unknown as { rowCount: number }).rowCount ?? 0;
			console.log(`  Updated ${rowCount} member(s)`);
			grandTotal += rowCount;

			// Report any members that still have no matching role (unmatched role strings)
			const unmatched = await tenantDb.execute(sql`
				SELECT role, count(*) AS cnt
				FROM ${members}
				WHERE role_id IS NULL
				GROUP BY role
				ORDER BY cnt DESC
			`);

			if (unmatched.rows.length > 0) {
				console.log(`  Unmatched role strings (no matching roles row):`);
				for (const row of unmatched.rows) {
					const r = row as { role: string; cnt: string };
					console.log(`    role="${r.role}" — ${r.cnt} member(s)`);
				}
			}
		} catch (error) {
			console.error(`  Error:`, error instanceof Error ? error.message : error);
		} finally {
			await tenantPool.end();
		}

		console.log("");
	}

	await controlPanelPool.end();
	console.log(`Total members updated across all orgs: ${grandTotal}`);
	console.log("Backfill complete.");
}

if (import.meta.main) {
	backfillMemberRoleId()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error("Script failed:", error);
			process.exit(1);
		});
}
