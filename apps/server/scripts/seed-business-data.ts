/**
 * Seed Script: Business Data (Packages, Package Instances, Services)
 *
 * Seeds packages and package instances into the test tenant database so
 * the full API test suite can run. The script is idempotent — it skips
 * records that already exist.
 *
 * Seeds:
 * - Service category: "Personal Training"
 * - Service: "Private Session"
 * - Package 1: "Private 10-Session Pack"
 * - Package 2: "Semi-Private 20-Session Pack"
 * - Package Instance for Package 1 assigned to the franchisee user
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/seed-business-data.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	hierarchyNodes,
	packageInstances,
	rooms,
	serviceCategories,
	services,
} from "@avantej-core/db/schema/tenant/index";
import { eq } from "drizzle-orm";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const FRANCHISEE_EMAIL = "franchisee@gmail.com";

// ─── env loader ──────────────────────────────────────────────────────────────

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

// ─── db helpers ──────────────────────────────────────────────────────────────

function createControlPanelDb(databaseUrl: string) {
	const pool = new Pool({ connectionString: databaseUrl });
	return { db: drizzle({ client: pool, schema: controlPanelSchema }), pool };
}

function createTenantDb(connectionString: string) {
	const pool = new Pool({ connectionString });
	return { db: drizzle({ client: pool, schema: tenantSchema }), pool };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function seedBusinessData() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	console.log("Starting business data seed...\n");

	const { db: controlDb, pool: controlPool } = createControlPanelDb(databaseUrl);

	let tenantPool: Pool | null = null;

	try {
		// ================================================================
		// STEP 1: Resolve org -> decrypt tenant connection string
		// ================================================================
		console.log("Step 1: Resolving organization and tenant connection...");

		const org = await controlDb.query.organizations.findFirst({
			where: (orgs, { eq: eqFn }) => eqFn(orgs.id, TARGET_ORG_ID),
		});

		if (!org) {
			throw new Error(`Organization not found: ${TARGET_ORG_ID}`);
		}

		console.log(`   Found org: ${org.name} (${org.id})`);

		const tenantConnectionString = decrypt(org.connectionString);
		const { db: tenantDb, pool } = createTenantDb(tenantConnectionString);
		tenantPool = pool;

		// ================================================================
		// STEP 2: Discover existing data in tenant DB
		// ================================================================
		console.log("\nStep 2: Discovering existing tenant data...");

		// Find branch node (type = 'branch', depth = 4)
		const branchNode = await tenantDb.query.hierarchyNodes.findFirst({
			where: (nodes, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(nodes.type, "branch"), eqFn(nodes.depth, 4)),
		});

		if (!branchNode) {
			throw new Error(
				"No branch node found (type=branch, depth=4). Run seed-franchise-owner.ts first.",
			);
		}
		console.log(`   Branch node: ${branchNode.id} (${branchNode.name})`);

		// Find franchisee user in control panel DB
		const franchiseeUser = await controlDb.query.users.findFirst({
			where: (u, { eq: eqFn }) => eqFn(u.email, FRANCHISEE_EMAIL),
		});

		if (!franchiseeUser) {
			throw new Error(
				`Franchisee user not found in control panel: ${FRANCHISEE_EMAIL}`,
			);
		}
		console.log(`   Franchisee user: ${franchiseeUser.id} (${franchiseeUser.email})`);

		const clientId = franchiseeUser.id;
		const branchId = branchNode.id;

		// ================================================================
		// STEP 3: Seed service category
		// ================================================================
		console.log("\nStep 3: Seeding service category...");

		let category: typeof serviceCategories.$inferSelect;
		const existingCategory = await tenantDb.query.serviceCategories.findFirst({
			where: (sc, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(sc.name, "Personal Training"), eqFn(sc.branchId, branchId)),
		});

		if (existingCategory) {
			console.log(
				`   Already exists: ${existingCategory.id} (${existingCategory.name})`,
			);
			category = existingCategory;
		} else {
			const [created] = await tenantDb
				.insert(serviceCategories)
				.values({
					name: "Personal Training",
					description: "One-on-one training sessions",
					displayOrder: 1,
					branchId,
					isActive: true,
				})
				.returning();

			if (!created) throw new Error("Failed to create service category");
			category = created;
			console.log(`   Created: ${category.id} (${category.name})`);
		}

		// ================================================================
		// STEP 4: Seed service
		// ================================================================
		console.log("\nStep 4: Seeding service...");

		let service: typeof services.$inferSelect;
		const existingService = await tenantDb.query.services.findFirst({
			where: (s, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(s.name, "Private Session"), eqFn(s.branchId, branchId)),
		});

		if (existingService) {
			console.log(
				`   Already exists: ${existingService.id} (${existingService.name})`,
			);
			service = existingService;
		} else {
			const [created] = await tenantDb
				.insert(services)
				.values({
					name: "Private Session",
					categoryId: category.id,
					duration: 60,
					durationUnitType: "minutes",
					maxAttendees: 1,
					branchId,
					isActive: true,
					type: "private",
					priceUnit: "session",
					taxable: false,
					taxPercentage: 0,
					isRecommended: false,
					schedulingType: "appointment",
				})
				.returning();

			if (!created) throw new Error("Failed to create service");
			service = created;
			console.log(`   Created: ${service.id} (${service.name})`);
		}

		// ================================================================
		// STEP 5: Seed package-style services
		// ================================================================
		console.log("\nStep 5: Seeding package-style services...");

		// Service 1: Private 10-Session Pack
		let packageService1: typeof services.$inferSelect;
		const existingPackageService1 = await tenantDb.query.services.findFirst({
			where: (s, { eq: eqFn, and: andFn }) =>
				andFn(
					eqFn(s.name, "Private 10-Session Pack"),
					eqFn(s.branchId, branchId),
				),
		});

		if (existingPackageService1) {
			console.log(
				`   Already exists: ${existingPackageService1.id} (${existingPackageService1.name})`,
			);
			packageService1 = existingPackageService1;
		} else {
			const [created] = await tenantDb
				.insert(services)
				.values({
					name: "Private 10-Session Pack",
					categoryId: category.id,
					type: "private",
					sessionCount: 10,
					price: 15000,
					maxAttendees: 1,
					expiryDays: 180,
					expirable: true,
					branchId,
					isActive: true,
					duration: 60,
					durationUnitType: "minutes",
					schedulingType: "appointment",
					priceUnit: "session",
					taxable: false,
					taxPercentage: 0,
					isRecommended: false,
				})
				.returning();

			if (!created) throw new Error("Failed to create package-style service 1");
			packageService1 = created;
			console.log(`   Created: ${packageService1.id} (${packageService1.name})`);
		}

		// Service 2: Semi-Private 20-Session Pack
		let packageService2: typeof services.$inferSelect;
		const existingPackageService2 = await tenantDb.query.services.findFirst({
			where: (s, { eq: eqFn, and: andFn }) =>
				andFn(
					eqFn(s.name, "Semi-Private 20-Session Pack"),
					eqFn(s.branchId, branchId),
				),
		});

		if (existingPackageService2) {
			console.log(
				`   Already exists: ${existingPackageService2.id} (${existingPackageService2.name})`,
			);
			packageService2 = existingPackageService2;
		} else {
			const [created] = await tenantDb
				.insert(services)
				.values({
					name: "Semi-Private 20-Session Pack",
					categoryId: category.id,
					type: "semi_private",
					sessionCount: 20,
					price: 8000,
					maxAttendees: 3,
					expiryDays: 365,
					expirable: true,
					branchId,
					isActive: true,
					duration: 60,
					durationUnitType: "minutes",
					schedulingType: "appointment",
					priceUnit: "session",
					taxable: false,
					taxPercentage: 0,
					isRecommended: false,
				})
				.returning();

			if (!created) throw new Error("Failed to create package-style service 2");
			packageService2 = created;
			console.log(`   Created: ${packageService2.id} (${packageService2.name})`);
		}

		// ================================================================
		// STEP 6: Seed package instance
		// ================================================================
		console.log("\nStep 6: Seeding package instance...");

		let packageInstance: typeof packageInstances.$inferSelect;
		const existingInstance = await tenantDb.query.packageInstances.findFirst({
			where: (pi, { eq: eqFn, and: andFn }) =>
				andFn(
					eqFn(pi.serviceId, packageService1.id),
					eqFn(pi.clientId, clientId),
				),
		});

		if (existingInstance) {
			console.log(`   Already exists: ${existingInstance.id}`);
			packageInstance = existingInstance;
		} else {
			const now = new Date();
			const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

			const [created] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: packageService1.id,
					clientId,
					source: "assigned",
					assignedBy: clientId,
					purchaseNumber: "TEST-PKG-001",
					totalPrice: 150000,
					taxAmount: 0,
					paymentStatus: "paid",
					paymentMethod: "cash",
					creditsTotal: 10,
					creditsUsed: 0,
					startsAt: now,
					expiresAt,
					status: "active",
				})
				.returning();

			if (!created) throw new Error("Failed to create package instance");
			packageInstance = created;
			console.log(`   Created: ${packageInstance.id}`);
		}

		// ================================================================
		// STEP 7: Seed default rooms (one per branch, idempotent)
		// ================================================================
		console.log("\nStep 7: Seeding default rooms per branch...");

		const branches = await tenantDb
			.select()
			.from(hierarchyNodes)
			.where(eq(hierarchyNodes.type, "branch"));

		for (const branch of branches) {
			const existing = await tenantDb
				.select()
				.from(rooms)
				.where(eq(rooms.branchId, branch.id))
				.limit(1);
			if (existing.length > 0) {
				console.log(`   [skip] Branch "${branch.name}" already has rooms`);
				continue;
			}

			await tenantDb.insert(rooms).values({
				name: `Main Room - ${branch.name}`,
				type: "training",
				capacity: 20,
				branchId: branch.id,
				isActive: true,
			});
			console.log(`   [ok] Created default room for branch "${branch.name}"`);
		}

		// ================================================================
		// SUMMARY
		// ================================================================
		const summaryData = {
			orgId: TARGET_ORG_ID,
			branchNodeId: branchId,
			branchNodeName: branchNode.name,
			franchiseeUserId: clientId,
			categoryId: category.id,
			categoryName: category.name,
			serviceId: service.id,
			serviceName: service.name,
			packageService1Id: packageService1.id,
			packageService1Name: packageService1.name,
			packageService2Id: packageService2.id,
			packageService2Name: packageService2.name,
			packageInstanceId: packageInstance.id,
		};

		// Write IDs to JSON file for test scripts
		const seedIdsPath = join(__dirname, "seed-ids.json");
		writeFileSync(seedIdsPath, JSON.stringify(summaryData, null, 2));
		console.log(`\nSeed IDs written to: ${seedIdsPath}`);

		// Print summary table
		console.log("\n" + "=".repeat(60));
		console.log("SEED SUMMARY");
		console.log("=".repeat(60));
		console.log(`Org ID:            ${summaryData.orgId}`);
		console.log(`Branch Node:       ${branchId} (${branchNode.name})`);
		console.log(`Franchisee userId: ${clientId}`);
		console.log(
			`Category:          ${category.id} (${category.name}) [${existingCategory ? "existing" : "created"}]`,
		);
		console.log(
			`Service:           ${service.id} (${service.name}) [${existingService ? "existing" : "created"}]`,
		);
		console.log(
			`Package Service 1: ${packageService1.id} ("${packageService1.name}") [${existingPackageService1 ? "existing" : "created"}]`,
		);
		console.log(
			`Package Service 2: ${packageService2.id} ("${packageService2.name}") [${existingPackageService2 ? "existing" : "created"}]`,
		);
		console.log(
			`Package Instance:  ${packageInstance.id} [${existingInstance ? "existing" : "created"}]`,
		);
		console.log("=".repeat(60));

		return summaryData;
	} catch (error) {
		console.error("\nSeed failed:", error);
		throw error;
	} finally {
		await controlPool.end();
		if (tenantPool) {
			await tenantPool.end();
		}
	}
}

if (import.meta.main) {
	seedBusinessData()
		.then(() => {
			console.log("\nSeed script completed successfully.");
			process.exit(0);
		})
		.catch((error) => {
			console.error("Seed script failed:", error);
			process.exit(1);
		});
}

export { seedBusinessData };
