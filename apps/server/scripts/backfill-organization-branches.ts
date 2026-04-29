/**
 * Backfill Script: Sync tenant branch nodes to control panel organization_branches
 *
 * For each organization in the control panel DB:
 * 1. Connect to its tenant database
 * 2. Query all hierarchy_nodes where type = 'branch'
 * 3. Resolve the country ancestor for each branch (depth=1 in hierarchy)
 * 4. Insert/update organization_branches in the control panel DB
 *
 * This is idempotent — updates existing branches with country if missing, inserts new ones.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/backfill-organization-branches.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizationBranches } from "@avantej-core/db/schema/control-panel/index";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
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

async function backfillOrganizationBranches() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL required");

	console.log("🔄 Starting organization_branches backfill...\n");

	// Connect to control panel DB
	const controlPanelPool = new Pool({ connectionString: databaseUrl });
	const controlPanelDb = drizzle({
		client: controlPanelPool,
		schema: controlPanelSchema,
	});

	// Get all organizations
	const allOrgs = await controlPanelDb.query.organizations.findMany();
	console.log(`Found ${allOrgs.length} organization(s)\n`);

	let totalInserted = 0;
	let totalUpdated = 0;
	let totalSkipped = 0;

	for (const org of allOrgs) {
		console.log(`📂 Processing: ${org.name} (${org.id})`);

		let tenantConnectionString: string;
		try {
			tenantConnectionString = decrypt(org.connectionString);
		} catch (error) {
			console.error(`   ❌ Failed to decrypt connection string, skipping`);
			continue;
		}

		// Connect to tenant DB
		const tenantPool = new Pool({ connectionString: tenantConnectionString });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		try {
			// Get all hierarchy nodes from tenant DB (need full tree to resolve country)
			const allNodes = await tenantDb.query.hierarchyNodes.findMany();
			const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

			// Helper: walk up the tree to find the country ancestor (depth=1, type="country")
			function resolveCountry(nodeId: string | null): { id: string; name: string } | null {
				let currentId = nodeId;
				while (currentId) {
					const node = nodeMap.get(currentId);
					if (!node) return null;
					if (node.type === "country") return { id: node.id, name: node.name };
					currentId = node.parentId;
				}
				return null;
			}

			const branchNodes = allNodes.filter((n) => n.type === "branch");
			console.log(`   Found ${branchNodes.length} branch node(s)`);

			for (const branch of branchNodes) {
				const countryInfo = resolveCountry(branch.parentId);

				// Check if already exists in organization_branches
				const existing =
					await controlPanelDb.query.organizationBranches.findFirst({
						where: eq(organizationBranches.name, branch.name),
					});

				if (existing) {
					// Update country/countryTenantNodeId if missing
					if (!existing.countryTenantNodeId && countryInfo) {
						await controlPanelDb
							.update(organizationBranches)
							.set({
								country: countryInfo.name,
								countryTenantNodeId: countryInfo.id,
								updatedAt: new Date(),
							})
							.where(eq(organizationBranches.id, existing.id));
						console.log(`   🔄 Updated "${branch.name}" with country "${countryInfo.name}" (${countryInfo.id})`);
						totalUpdated++;
					} else {
						console.log(`   ⏭️  Skipped "${branch.name}" (already exists)`);
						totalSkipped++;
					}
					continue;
				}

				// Insert into organization_branches
				await controlPanelDb.insert(organizationBranches).values({
					organizationId: org.id,
					tenantNodeId: branch.id,
					name: branch.name,
					countryTenantNodeId: countryInfo?.id,
					country: countryInfo?.name,
					address: branch.address,
				});

				console.log(`   ✅ Inserted "${branch.name}" (country: ${countryInfo?.name || "none"})`);
				totalInserted++;
			}
		} catch (error) {
			console.error(
				`   ❌ Error processing ${org.name}:`,
				error instanceof Error ? error.message : error,
			);
		} finally {
			await tenantPool.end();
		}

		console.log("");
	}

	await controlPanelPool.end();

	console.log("📊 Summary:");
	console.log(`   Inserted: ${totalInserted}`);
	console.log(`   Updated:  ${totalUpdated}`);
	console.log(`   Skipped:  ${totalSkipped}`);
	console.log("\n✅ Backfill completed!");
}

if (import.meta.main) {
	backfillOrganizationBranches()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error("❌ Script failed:", error);
			process.exit(1);
		});
}
