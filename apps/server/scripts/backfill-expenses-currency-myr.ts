/**
 * Backfill Script: Flip leftover expenses.currency = 'usd' rows to 'myr'
 *
 * Migration 0016_worried_wolfpack changed the expenses.currency default
 * from 'usd' to 'myr', but only at the column-default level. Existing
 * rows inserted before that migration (or with an explicit 'usd' value)
 * are not touched by the ALTER. This script flips them.
 *
 * Idempotent — re-running on an already-clean DB is a no-op.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/backfill-expenses-currency-myr.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
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

async function backfillExpensesCurrencyMyr() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL required");

	console.log("🔄 Starting expenses.currency usd→myr backfill...\n");

	const controlPanelPool = new Pool({ connectionString: databaseUrl });
	const controlPanelDb = drizzle({
		client: controlPanelPool,
		schema: controlPanelSchema,
	});

	const allOrgs = await controlPanelDb.query.organizations.findMany();
	console.log(`Found ${allOrgs.length} organization(s)\n`);

	let totalUpdated = 0;
	let totalOrgsTouched = 0;
	let totalOrgsClean = 0;
	let totalOrgsFailed = 0;

	for (const org of allOrgs) {
		console.log(`📂 ${org.name} (${org.id})`);

		let tenantConnectionString: string;
		try {
			tenantConnectionString = decrypt(org.connectionString);
		} catch {
			console.error(`   ❌ Failed to decrypt connection string, skipping`);
			totalOrgsFailed++;
			continue;
		}

		const tenantPool = new Pool({ connectionString: tenantConnectionString });
		const tenantDb = drizzle({ client: tenantPool });

		try {
			const result = await tenantDb.execute(
				sql`UPDATE expenses SET currency = 'myr' WHERE currency = 'usd'`,
			);
			const rowsUpdated = result.rowCount ?? 0;

			if (rowsUpdated > 0) {
				console.log(`   ✅ Updated ${rowsUpdated} row(s) usd→myr`);
				totalUpdated += rowsUpdated;
				totalOrgsTouched++;
			} else {
				console.log(`   ⏭️  Already clean (0 rows)`);
				totalOrgsClean++;
			}
		} catch (error) {
			console.error(
				`   ❌ Error:`,
				error instanceof Error ? error.message : error,
			);
			totalOrgsFailed++;
		} finally {
			await tenantPool.end();
		}
	}

	await controlPanelPool.end();

	console.log("\n📊 Summary:");
	console.log(`   Rows updated:  ${totalUpdated}`);
	console.log(`   Orgs touched:  ${totalOrgsTouched}`);
	console.log(`   Orgs clean:    ${totalOrgsClean}`);
	console.log(`   Orgs failed:   ${totalOrgsFailed}`);
	console.log("\n✅ Backfill completed!");
}

if (import.meta.main) {
	backfillExpensesCurrencyMyr()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error("❌ Script failed:", error);
			process.exit(1);
		});
}
