/**
 * Pre-migration fix: Create service rows for packages that have no matching service.
 *
 * The 0008_schema_consolidation migration requires every package to map to a
 * service by (name, branch_id). This script finds unmatched packages and creates
 * the missing service rows so the backfill can proceed.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/fix-unmatched-packages.ts
 *
 * Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING semantics via a
 * pre-check (only inserts if no matching service exists).
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
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
				if (!process.env[match[1]]) process.env[match[1]] = match[2];
			}
		}
	} catch (error) {
		console.warn("Could not load .dev.vars file:", error);
	}
}

loadDevVars();

const TARGET_ORG_ID =
	process.env.TARGET_ORG_ID || "996febce-aaad-4ded-8f47-02d2b566c8ee";

interface UnmatchedPackage {
	id: string;
	name: string;
	appointment_type: string;
	session_count: number;
	price_per_session: number;
	max_clients_per_session: number;
	expiry_days: number | null;
	expiry_date: Date | null;
	branch_id: string | null;
	is_archived: boolean;
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const controlPool = new Pool({ connectionString: databaseUrl });
	const controlDb = drizzle({ client: controlPool, schema: controlPanelSchema });

	const org = await controlDb.query.organizations.findFirst({
		where: (orgs, { eq }) => eq(orgs.id, TARGET_ORG_ID),
	});
	if (!org) throw new Error(`Organization not found: ${TARGET_ORG_ID}`);

	console.log(`Organization: ${org.name} (${org.id})`);

	const tenantConnectionString = decrypt(org.connectionString);
	const tenantPool = new Pool({ connectionString: tenantConnectionString });
	const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

	// 1. Find unmatched packages
	const unmatchedResult = await tenantDb.execute<UnmatchedPackage & Record<string, unknown>>(sql`
		SELECT p.id, p.name, p.appointment_type, p.session_count,
		       p.price_per_session, p.max_clients_per_session,
		       p.expiry_days, p.expiry_date, p.branch_id, p.is_archived
		FROM packages p
		WHERE NOT EXISTS (
			SELECT 1 FROM services s
			WHERE s.name = p.name
			  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
		)
	`);

	const unmatched = unmatchedResult.rows;
	console.log(`\nFound ${unmatched.length} unmatched package(s):\n`);

	if (unmatched.length === 0) {
		console.log("Nothing to fix. All packages have matching services.");
		await controlPool.end();
		await tenantPool.end();
		return;
	}

	for (const pkg of unmatched) {
		console.log(
			`  "${pkg.name}" | type=${pkg.appointment_type} | sessions=${pkg.session_count} ` +
				`| price=${pkg.price_per_session} | branch=${pkg.branch_id ?? "null"} | archived=${pkg.is_archived}`,
		);
	}

	// 2. Create matching service for each unmatched package
	console.log("\nCreating missing service rows...\n");

	let created = 0;
	for (const pkg of unmatched) {
		await tenantDb.execute(sql`
			INSERT INTO services (
				name, type, duration, duration_unit_type, max_attendees,
				price, branch_id, is_active,
				session_count, expirable, expiry_days, expiry_date,
				created_at, updated_at
			) VALUES (
				${pkg.name},
				${pkg.appointment_type},
				${3600},
				${"minutes"},
				${pkg.max_clients_per_session},
				${pkg.price_per_session},
				${pkg.branch_id},
				${!pkg.is_archived},
				${pkg.session_count},
				${pkg.expiry_days !== null || pkg.expiry_date !== null},
				${pkg.expiry_days},
				${pkg.expiry_date},
				now(),
				now()
			)
		`);
		console.log(`  [CREATED] service "${pkg.name}" (branch=${pkg.branch_id ?? "null"})`);
		created++;
	}

	// 3. Verify — re-run the unmatched check
	const verifyResult = await tenantDb.execute<{ count: string }>(sql`
		SELECT COUNT(*) as count
		FROM packages p
		WHERE NOT EXISTS (
			SELECT 1 FROM services s
			WHERE s.name = p.name
			  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
		)
	`);
	const remainingUnmatched = parseInt(verifyResult.rows[0]?.count ?? "0", 10);

	console.log(`\nCreated ${created} service(s). Remaining unmatched: ${remainingUnmatched}`);

	if (remainingUnmatched > 0) {
		console.error(
			"WARNING: Still have unmatched packages. Investigate manually before running migration.",
		);
	} else {
		console.log("All packages now have matching services. Safe to re-run migration.");
	}

	await controlPool.end();
	await tenantPool.end();
}

main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
