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
	packageInstances,
	packages,
	serviceCategories,
	services,
} from "@avantej-core/db/schema/tenant/index";
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
		// STEP 5: Seed packages
		// ================================================================
		console.log("\nStep 5: Seeding packages...");

		// Package 1: Private 10-Session Pack
		let package1: typeof packages.$inferSelect;
		const existingPackage1 = await tenantDb.query.packages.findFirst({
			where: (p, { eq: eqFn, and: andFn }) =>
				andFn(
					eqFn(p.name, "Private 10-Session Pack"),
					eqFn(p.branchId, branchId),
				),
		});

		if (existingPackage1) {
			console.log(
				`   Already exists: ${existingPackage1.id} (${existingPackage1.name})`,
			);
			package1 = existingPackage1;
		} else {
			const [created] = await tenantDb
				.insert(packages)
				.values({
					name: "Private 10-Session Pack",
					appointmentType: "private",
					crossUsageEnabled: false,
					sessionCount: 10,
					pricePerSession: 15000,
					maxClientsPerSession: 1,
					expiryDays: 180,
					autoGenerateInvoice: false,
					branchId,
					allowedServiceIds: null,
					isArchived: false,
				})
				.returning();

			if (!created) throw new Error("Failed to create package 1");
			package1 = created;
			console.log(`   Created: ${package1.id} (${package1.name})`);
		}

		// Package 2: Semi-Private 20-Session Pack
		let package2: typeof packages.$inferSelect;
		const existingPackage2 = await tenantDb.query.packages.findFirst({
			where: (p, { eq: eqFn, and: andFn }) =>
				andFn(
					eqFn(p.name, "Semi-Private 20-Session Pack"),
					eqFn(p.branchId, branchId),
				),
		});

		if (existingPackage2) {
			console.log(
				`   Already exists: ${existingPackage2.id} (${existingPackage2.name})`,
			);
			package2 = existingPackage2;
		} else {
			const [created] = await tenantDb
				.insert(packages)
				.values({
					name: "Semi-Private 20-Session Pack",
					appointmentType: "semi-private",
					crossUsageEnabled: false,
					sessionCount: 20,
					pricePerSession: 8000,
					maxClientsPerSession: 3,
					expiryDays: 365,
					autoGenerateInvoice: false,
					branchId,
					allowedServiceIds: null,
					isArchived: false,
				})
				.returning();

			if (!created) throw new Error("Failed to create package 2");
			package2 = created;
			console.log(`   Created: ${package2.id} (${package2.name})`);
		}

		// ================================================================
		// STEP 6: Seed package instance
		// ================================================================
		console.log("\nStep 6: Seeding package instance...");

		let packageInstance: typeof packageInstances.$inferSelect;
		const existingInstance = await tenantDb.query.packageInstances.findFirst({
			where: (pi, { eq: eqFn, and: andFn }) =>
				andFn(
					eqFn(pi.packageId, package1.id),
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
					packageId: package1.id,
					clientId,
					source: "assigned",
					assignedBy: clientId,
					purchaseNumber: "TEST-PKG-001",
					totalPrice: 150000,
					taxAmount: 0,
					paymentStatus: "paid",
					paymentMethod: "cash",
					creditsTotal: 10,
					creditsRemaining: 10,
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
			package1Id: package1.id,
			package1Name: package1.name,
			package2Id: package2.id,
			package2Name: package2.name,
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
			`Package 1:         ${package1.id} ("${package1.name}") [${existingPackage1 ? "existing" : "created"}]`,
		);
		console.log(
			`Package 2:         ${package2.id} ("${package2.name}") [${existingPackage2 ? "existing" : "created"}]`,
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
