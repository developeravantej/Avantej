/**
 * Warm-up script: for a given org-shared tenant, fire syncBranchToGhl for
 * every branch in the hierarchy. Eagerly creates the per-country GHL
 * custom field (if absent) and adds every branch's option label.
 *
 * Without this, those happen lazily on first contact/staff sync. Running
 * it explicitly validates Phase G end-to-end against the real GHL API.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/warmup-ghl-org-shared-branches.ts --tenant "<name>"
 *   bun run scripts/warmup-ghl-org-shared-branches.ts --tenant "<name>" --dry-run
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { syncBranchToGhl } from "../src/services/ghl/branch-sync";

neonConfig.webSocketConstructor = ws;

interface CliArgs {
	tenant: string;
	dryRun: boolean;
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const ti = args.indexOf("--tenant");
	if (ti === -1 || !args[ti + 1]) {
		console.error(
			'Usage: bun run warmup-ghl-org-shared-branches.ts --tenant "<name>" [--dry-run]',
		);
		process.exit(1);
	}
	return {
		tenant: args[ti + 1]!,
		dryRun: args.includes("--dry-run"),
	};
}

async function main() {
	const { tenant, dryRun } = parseArgs();
	const cpUrl = process.env.DATABASE_URL;
	if (!cpUrl) throw new Error("DATABASE_URL not set");

	const cpPool = new Pool({ connectionString: cpUrl });
	const cpDb = drizzle({ client: cpPool, schema: controlPanelSchema });

	// 1. Find org + validate org-shared
	const org = await cpDb.query.organizations.findFirst({
		where: eq(organizations.name, tenant),
	});
	if (!org) {
		await cpPool.end();
		throw new Error(`Tenant not found: ${tenant}`);
	}
	console.log(`\nTenant: ${org.name} (${org.id})`);
	console.log(`Sync model: ${org.ghlSyncModel ?? "NULL"}`);
	console.log(`Location: ${org.ghlLocationId ?? "—"}`);

	if (org.ghlSyncModel !== "org-shared" || !org.ghlLocationId) {
		await cpPool.end();
		throw new Error(
			"Tenant is not on org-shared model. Run migrate-tenant-to-org-shared.ts first.",
		);
	}

	// 2. Connect to tenant DB
	let tenantConn: string;
	try {
		tenantConn = decrypt(org.connectionString);
	} catch {
		tenantConn = org.connectionString;
	}
	const tPool = new Pool({ connectionString: tenantConn });
	const tDb = drizzle({ client: tPool, schema: tenantSchema });

	// 3. List branches (active only)
	const branches = await tDb
		.select()
		.from(hierarchyNodes)
		.where(and(eq(hierarchyNodes.type, "branch"), isNull(hierarchyNodes.archivedAt)));

	console.log(`\nFound ${branches.length} active branch(es):\n`);
	for (const b of branches) {
		console.log(`  ${b.name.padEnd(45)} id=${b.id.slice(0, 8)}`);
	}

	if (dryRun) {
		console.log("\n🔍 DRY RUN — would syncBranchToGhl for each above. No GHL calls.");
		await tPool.end();
		await cpPool.end();
		return;
	}

	// 4. Sync each branch
	console.log(`\nFiring syncBranchToGhl per branch:\n`);
	let synced = 0;
	let skipped = 0;
	let errored = 0;
	for (const b of branches) {
		const result = await syncBranchToGhl({
			controlPanelDb: cpDb,
			tenantDb: tDb,
			organizationId: org.id,
			branchNodeId: b.id,
			decryptApiKey: decrypt,
		});
		const tag =
			result.status === "synced" ? "✅" : result.status === "skipped" ? "⏭️" : "❌";
		console.log(
			`  ${tag} ${b.name.padEnd(45)} ${JSON.stringify(result)}`,
		);
		if (result.status === "synced") synced++;
		else if (result.status === "skipped") skipped++;
		else errored++;
	}

	console.log(
		`\nSummary: ${synced} synced, ${skipped} skipped, ${errored} error(s)`,
	);

	// 5. Show updated countryFieldMap
	const fresh = await cpDb.query.organizations.findFirst({
		where: eq(organizations.id, org.id),
	});
	const map = (fresh?.ghlCountryFieldMap as Record<string, unknown> | null) ?? {};
	console.log(
		`\nghlCountryFieldMap now has ${Object.keys(map).length} country entries:`,
	);
	for (const [cid, entry] of Object.entries(map)) {
		console.log(`  country=${cid.slice(0, 8)}  ${JSON.stringify(entry)}`);
	}

	await tPool.end();
	await cpPool.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
