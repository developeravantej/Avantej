/**
 * Wipe and Reseed Services
 *
 * Wipes all services, service_categories, and package_instances (plus FK-cascaded
 * rows) for the "test-fitness-franchise" organization, then reseeds via
 * seed-business-data.ts.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/wipe-and-reseed-services.ts
 *
 * Tables wiped (in order):
 *   1. package_instances  -> cascades installments, installment_events, preferred_times
 *                            -> nulls appointments.packageInstanceId, appointment_clients.packageInstanceId
 *   2. services           -> cascades service_members, class_slots,
 *                            member_service_buffer_overrides
 *                            -> nulls appointments.serviceId, sales_order_items.serviceId
 *   3. service_categories -> cascades service_category_config,
 *                            member_category_buffer_overrides,
 *                            category_commission_configs
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	packageInstances,
	serviceCategories,
	services,
} from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TARGET_ORG_SLUG = "test-fitness-franchise";

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
	} catch (err) {
		console.warn("Could not load .dev.vars:", err);
	}
}

async function main() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	console.log(`🧨 Wipe + reseed for org: ${TARGET_ORG_SLUG}\n`);

	const controlPool = new Pool({ connectionString: databaseUrl });
	const controlDb = drizzle({ client: controlPool, schema: controlPanelSchema });

	let tenantPool: Pool | null = null;

	try {
		// 1. Resolve tenant connection
		const org = await controlDb.query.organizations.findFirst({
			where: (orgs, { eq }) => eq(orgs.slug, TARGET_ORG_SLUG),
		});
		if (!org) throw new Error(`Org not found: ${TARGET_ORG_SLUG}`);
		console.log(`   Org: ${org.name} (${org.id})`);

		const tenantConn = decrypt(org.connectionString);
		tenantPool = new Pool({ connectionString: tenantConn });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		// 2. Counts BEFORE
		const before = {
			pkgInstances: (await tenantDb.select().from(packageInstances)).length,
			services: (await tenantDb.select().from(services)).length,
			categories: (await tenantDb.select().from(serviceCategories)).length,
		};
		console.log("\n   Before:", before);

		// 3. Wipe (FK-safe order)
		console.log("\n🧹 Wiping...");
		const delPkg = await tenantDb.delete(packageInstances).returning({ id: packageInstances.id });
		console.log(`   package_instances: ${delPkg.length} deleted`);

		const delSvc = await tenantDb.delete(services).returning({ id: services.id });
		console.log(`   services:          ${delSvc.length} deleted`);

		const delCat = await tenantDb.delete(serviceCategories).returning({ id: serviceCategories.id });
		console.log(`   service_categories: ${delCat.length} deleted`);

		// 4. Verify empty
		const after = {
			pkgInstances: (await tenantDb.select().from(packageInstances)).length,
			services: (await tenantDb.select().from(services)).length,
			categories: (await tenantDb.select().from(serviceCategories)).length,
		};
		console.log("\n   After wipe:", after);
	} finally {
		if (tenantPool) await tenantPool.end();
		await controlPool.end();
	}

	// 5. Reseed by invoking seed-business-data.ts as a child process
	console.log("\n🌱 Reseeding via seed-business-data.ts...\n");
	const seedScript = join(__dirname, "seed-business-data.ts");
	const result = spawnSync("bun", ["run", seedScript], {
		stdio: "inherit",
		cwd: join(__dirname, ".."),
	});
	if (result.status !== 0) {
		throw new Error(`seed-business-data.ts exited with code ${result.status}`);
	}

	console.log("\n✅ Done.");
}

main().catch((err) => {
	console.error("❌ Failed:", err);
	process.exit(1);
});
