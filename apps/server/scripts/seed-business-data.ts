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
import { account } from "@avantej-core/db/schema/auth";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
	organizationMembers,
	users,
} from "@avantej-core/db/schema/control-panel/index";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	hierarchyNodes,
	installments,
	members,
	packageInstances,
	rooms,
	serviceCategories,
	serviceCategoryConfig,
	services,
	trainerAvailability,
} from "@avantej-core/db/schema/tenant/index";
import { eq, and } from "drizzle-orm";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";
import { hashPassword } from "better-auth/crypto";

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

	const { db: controlDb, pool: controlPool } =
		createControlPanelDb(databaseUrl);

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
		console.log(
			`   Franchisee user: ${franchiseeUser.id} (${franchiseeUser.email})`,
		);

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
					priceUnit: "session",
					taxable: false,
					taxPercentage: 0,
					isRecommended: false,
				})
				.returning();

			if (!created) throw new Error("Failed to create package-style service 1");
			packageService1 = created;
			console.log(
				`   Created: ${packageService1.id} (${packageService1.name})`,
			);
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
					priceUnit: "session",
					taxable: false,
					taxPercentage: 0,
					isRecommended: false,
				})
				.returning();

			if (!created) throw new Error("Failed to create package-style service 2");
			packageService2 = created;
			console.log(
				`   Created: ${packageService2.id} (${packageService2.name})`,
			);
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
		// STEP 8: Deterministic trainer
		// ================================================================
		console.log("\nStep 8: Seeding deterministic trainer...");

		const TRAINER_EMAIL = "trainer.deterministic@test.com";
		const TRAINER_PASSWORD = "password123";

		// 8a. Control panel user
		let trainerUserId: string;
		const existingTrainerUser = await controlDb.query.users.findFirst({
			where: (u, { eq: eqFn }) => eqFn(u.email, TRAINER_EMAIL.toLowerCase()),
		});

		if (existingTrainerUser) {
			console.log(`   Trainer user already exists: ${existingTrainerUser.id}`);
			trainerUserId = existingTrainerUser.id;
		} else {
			const newId = crypto.randomUUID();
			await controlDb.insert(users).values({
				id: newId,
				email: TRAINER_EMAIL.toLowerCase(),
				name: "Deterministic Trainer",
				firstName: "Deterministic",
				lastName: "Trainer",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			trainerUserId = newId;
			console.log(`   Created trainer user: ${trainerUserId}`);

			// 8b. Password account
			const hashedPassword = await hashPassword(TRAINER_PASSWORD);
			await controlDb.insert(account).values({
				id: crypto.randomUUID(),
				accountId: trainerUserId,
				providerId: "credential",
				userId: trainerUserId,
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			console.log("   Created trainer password account");
		}

		// Ensure password account exists even if user already existed
		const existingTrainerAccount = await controlDb.query.account.findFirst({
			where: (a, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(a.userId, trainerUserId), eqFn(a.providerId, "credential")),
		});
		if (!existingTrainerAccount) {
			const hashedPassword = await hashPassword(TRAINER_PASSWORD);
			await controlDb.insert(account).values({
				id: crypto.randomUUID(),
				accountId: trainerUserId,
				providerId: "credential",
				userId: trainerUserId,
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			console.log("   Created trainer password account (backfill)");
		}

		// 8c. Organization member (control panel registry)
		const existingTrainerOrgMember =
			await controlDb.query.organizationMembers.findFirst({
				where: (om, { eq: eqFn, and: andFn }) =>
					andFn(
						eqFn(om.userId, trainerUserId),
						eqFn(om.organizationId, TARGET_ORG_ID),
					),
			});
		if (existingTrainerOrgMember) {
			console.log("   Trainer org member entry already exists");
		} else {
			await controlDb.insert(organizationMembers).values({
				userId: trainerUserId,
				organizationId: TARGET_ORG_ID,
				role: "trainer",
				status: "active",
			});
			console.log("   Created trainer org member entry");
		}

		// 8d. Tenant member
		let trainerMemberId: string;
		const existingTrainerMember = await tenantDb.query.members.findFirst({
			where: (m, { eq: eqFn }) => eqFn(m.userId, trainerUserId),
		});
		if (existingTrainerMember) {
			console.log(
				`   Trainer tenant member already exists: ${existingTrainerMember.id}`,
			);
			trainerMemberId = existingTrainerMember.id;
		} else {
			const [createdMember] = await tenantDb
				.insert(members)
				.values({
					userId: trainerUserId,
					role: "trainer",
					hierarchyScopeId: branchId,
					status: "active",
				})
				.returning();
			if (!createdMember)
				throw new Error("Failed to create trainer tenant member");
			trainerMemberId = createdMember.id;
			console.log(`   Created trainer tenant member: ${trainerMemberId}`);
		}

		// 8e. Weekly availability Mon–Fri 09:00–17:00
		const AVAILABILITY_DAYS = [
			"monday",
			"tuesday",
			"wednesday",
			"thursday",
			"friday",
		] as const;
		for (const day of AVAILABILITY_DAYS) {
			const existing = await tenantDb.query.trainerAvailability.findFirst({
				where: (ta, { eq: eqFn, and: andFn }) =>
					andFn(eqFn(ta.trainerId, trainerMemberId), eqFn(ta.dayOfWeek, day)),
			});
			if (existing) {
				console.log(`   [skip] Availability ${day} already exists`);
			} else {
				await tenantDb.insert(trainerAvailability).values({
					trainerId: trainerMemberId,
					dayOfWeek: day,
					startTime: "09:00",
					endTime: "17:00",
					isActive: true,
				});
				console.log(`   Created availability: ${day} 09:00–17:00`);
			}
		}

		// ================================================================
		// STEP 9: Deterministic staff member
		// ================================================================
		console.log("\nStep 9: Seeding deterministic staff member...");

		const STAFF_EMAIL = "staff.deterministic@test.com";
		const STAFF_PASSWORD = "password123";

		// 9a. Control panel user
		let staffUserId: string;
		const existingStaffUser = await controlDb.query.users.findFirst({
			where: (u, { eq: eqFn }) => eqFn(u.email, STAFF_EMAIL.toLowerCase()),
		});

		if (existingStaffUser) {
			console.log(`   Staff user already exists: ${existingStaffUser.id}`);
			staffUserId = existingStaffUser.id;
		} else {
			const newId = crypto.randomUUID();
			await controlDb.insert(users).values({
				id: newId,
				email: STAFF_EMAIL.toLowerCase(),
				name: "Deterministic Staff",
				firstName: "Deterministic",
				lastName: "Staff",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			staffUserId = newId;
			console.log(`   Created staff user: ${staffUserId}`);

			// 9b. Password account
			const hashedPassword = await hashPassword(STAFF_PASSWORD);
			await controlDb.insert(account).values({
				id: crypto.randomUUID(),
				accountId: staffUserId,
				providerId: "credential",
				userId: staffUserId,
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			console.log("   Created staff password account");
		}

		// Ensure password account exists even if user already existed
		const existingStaffAccount = await controlDb.query.account.findFirst({
			where: (a, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(a.userId, staffUserId), eqFn(a.providerId, "credential")),
		});
		if (!existingStaffAccount) {
			const hashedPassword = await hashPassword(STAFF_PASSWORD);
			await controlDb.insert(account).values({
				id: crypto.randomUUID(),
				accountId: staffUserId,
				providerId: "credential",
				userId: staffUserId,
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			console.log("   Created staff password account (backfill)");
		}

		// 9c. Organization member (control panel registry)
		const existingStaffOrgMember =
			await controlDb.query.organizationMembers.findFirst({
				where: (om, { eq: eqFn, and: andFn }) =>
					andFn(
						eqFn(om.userId, staffUserId),
						eqFn(om.organizationId, TARGET_ORG_ID),
					),
			});
		if (existingStaffOrgMember) {
			console.log("   Staff org member entry already exists");
		} else {
			await controlDb.insert(organizationMembers).values({
				userId: staffUserId,
				organizationId: TARGET_ORG_ID,
				role: "staff",
				status: "active",
			});
			console.log("   Created staff org member entry");
		}

		// 9d. Tenant member (scoped to branch)
		let staffMemberId: string;
		const existingStaffMember = await tenantDb.query.members.findFirst({
			where: (m, { eq: eqFn }) => eqFn(m.userId, staffUserId),
		});
		if (existingStaffMember) {
			console.log(
				`   Staff tenant member already exists: ${existingStaffMember.id}`,
			);
			staffMemberId = existingStaffMember.id;
		} else {
			const [createdMember] = await tenantDb
				.insert(members)
				.values({
					userId: staffUserId,
					role: "staff",
					hierarchyScopeId: branchId,
					status: "active",
				})
				.returning();
			if (!createdMember)
				throw new Error("Failed to create staff tenant member");
			staffMemberId = createdMember.id;
			console.log(`   Created staff tenant member: ${staffMemberId}`);
		}

		// ================================================================
		// STEP 10: E2E Category with buffer config
		// ================================================================
		console.log("\nStep 10: Seeding E2E Category with buffer config...");

		let e2eCategory: typeof serviceCategories.$inferSelect;
		const existingE2ECategory =
			await tenantDb.query.serviceCategories.findFirst({
				where: (sc, { eq: eqFn, and: andFn }) =>
					andFn(eqFn(sc.name, "E2E Category"), eqFn(sc.branchId, branchId)),
			});

		if (existingE2ECategory) {
			console.log(`   E2E category already exists: ${existingE2ECategory.id}`);
			e2eCategory = existingE2ECategory;
		} else {
			const [created] = await tenantDb
				.insert(serviceCategories)
				.values({
					name: "E2E Category",
					description: "Deterministic category for E2E test protocols",
					displayOrder: 99,
					branchId,
					isActive: true,
				})
				.returning();
			if (!created) throw new Error("Failed to create E2E category");
			e2eCategory = created;
			console.log(`   Created E2E category: ${e2eCategory.id}`);
		}

		// Upsert service_category_config (bufferTimeMinutes: 15)
		const existingCategoryConfig =
			await tenantDb.query.serviceCategoryConfig.findFirst({
				where: (scc, { eq: eqFn }) => eqFn(scc.categoryId, e2eCategory.id),
			});
		if (existingCategoryConfig) {
			console.log(
				`   Category config already exists: ${existingCategoryConfig.id}`,
			);
		} else {
			const [createdConfig] = await tenantDb
				.insert(serviceCategoryConfig)
				.values({
					categoryId: e2eCategory.id,
					bufferTimeMinutes: 15,
					defaultDuration: 60,
					defaultMaxAttendees: 1,
				})
				.returning();
			if (!createdConfig)
				throw new Error("Failed to create E2E category config");
			console.log(
				`   Created category config: ${createdConfig.id} (bufferTimeMinutes: 15)`,
			);
		}

		// ================================================================
		// STEP 11: E2E service with package fields
		// ================================================================
		console.log("\nStep 11: Seeding E2E Test Session service...");

		let e2eService: typeof services.$inferSelect;
		const existingE2EService = await tenantDb.query.services.findFirst({
			where: (s, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(s.name, "E2E Test Session"), eqFn(s.branchId, branchId)),
		});

		if (existingE2EService) {
			console.log(`   E2E service already exists: ${existingE2EService.id}`);
			e2eService = existingE2EService;
		} else {
			const [created] = await tenantDb
				.insert(services)
				.values({
					name: "E2E Test Session",
					categoryId: e2eCategory.id,
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
					sessionCount: 10,
					price: 50000, // RM 500.00 in cents
					availablePaymentPlans: ["full", "half"],
					installmentIntervalDays: 14,
					expirable: false,
				})
				.returning();
			if (!created) throw new Error("Failed to create E2E service");
			e2eService = created;
			console.log(
				`   Created E2E service: ${e2eService.id} (price: RM 500.00)`,
			);
		}

		// ================================================================
		// STEP 12: E2E client user + package instance + installments
		// ================================================================
		console.log(
			"\nStep 12: Seeding E2E client user, package instance, and installments...",
		);

		const CLIENT_EMAIL = "e2e.client@test.com";
		const CLIENT_PASSWORD = "password123";

		// 12a. Control panel user (clients are NOT members — no org membership or tenant member row)
		let clientUserId: string;
		const existingClientUser = await controlDb.query.users.findFirst({
			where: (u, { eq: eqFn }) => eqFn(u.email, CLIENT_EMAIL.toLowerCase()),
		});

		if (existingClientUser) {
			console.log(`   Client user already exists: ${existingClientUser.id}`);
			clientUserId = existingClientUser.id;
		} else {
			const newId = crypto.randomUUID();
			await controlDb.insert(users).values({
				id: newId,
				email: CLIENT_EMAIL.toLowerCase(),
				name: "E2E Client",
				firstName: "E2E",
				lastName: "Client",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			clientUserId = newId;
			console.log(`   Created client user: ${clientUserId}`);

			// 12b. Password account
			const hashedPassword = await hashPassword(CLIENT_PASSWORD);
			await controlDb.insert(account).values({
				id: crypto.randomUUID(),
				accountId: clientUserId,
				providerId: "credential",
				userId: clientUserId,
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			console.log("   Created client password account");
		}

		// Ensure password account exists even if user already existed
		const existingClientAccount = await controlDb.query.account.findFirst({
			where: (a, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(a.userId, clientUserId), eqFn(a.providerId, "credential")),
		});
		if (!existingClientAccount) {
			const hashedPassword = await hashPassword(CLIENT_PASSWORD);
			await controlDb.insert(account).values({
				id: crypto.randomUUID(),
				accountId: clientUserId,
				providerId: "credential",
				userId: clientUserId,
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			console.log("   Created client password account (backfill)");
		}

		// 12c. Package instance (half plan, 10 credits, 1 installment paid → 5 credits unlocked)
		// paymentStatus: "pending" because installment 2 is not yet paid (1 of 2 paid)
		// creditsUnlocked: 5 (half plan: credits unlocked after 1st installment paid)
		// NOTE: creditsRemaining is a GENERATED column — do NOT insert it
		let e2ePackageInstance: typeof packageInstances.$inferSelect;
		const existingE2EInstance = await tenantDb.query.packageInstances.findFirst(
			{
				where: (pi, { eq: eqFn }) => eqFn(pi.purchaseNumber, "E2E-PKG-001"),
			},
		);

		if (existingE2EInstance) {
			console.log(
				`   E2E package instance already exists: ${existingE2EInstance.id}`,
			);
			e2ePackageInstance = existingE2EInstance;
		} else {
			const now = new Date();
			const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

			const [created] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: e2eService.id,
					clientId: clientUserId,
					source: "purchased",
					purchaseNumber: "E2E-PKG-001",
					totalPrice: 50000, // RM 500.00 in cents
					taxAmount: 0,
					paymentStatus: "pending", // 1 of 2 installments paid → not fully paid
					paymentMethod: "cash",
					creditsTotal: 10,
					creditsUsed: 0,
					creditsUnlocked: 5, // 1st installment paid → half of credits unlocked
					startsAt: now,
					expiresAt,
					status: "active",
					paymentPlanType: "half",
					installmentsTotal: 2,
					installmentsPaid: 1,
					isLocked: false,
					nextDueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // ~60 days from now
				})
				.returning();
			if (!created) throw new Error("Failed to create E2E package instance");
			e2ePackageInstance = created;
			console.log(`   Created E2E package instance: ${e2ePackageInstance.id}`);
		}

		// 12d. Installment rows (2 installments for half plan)
		// Installment 1: paid (status: "paid")
		// Installment 2: pending (status: "pending", due in ~60 days)
		const existingInstallment1 = await tenantDb
			.select()
			.from(installments)
			.where(
				and(
					eq(installments.packageInstanceId, e2ePackageInstance.id),
					eq(installments.installmentNumber, 1),
				),
			)
			.limit(1);

		if (existingInstallment1.length > 0) {
			console.log("   Installment 1 already exists");
		} else {
			await tenantDb.insert(installments).values({
				packageInstanceId: e2ePackageInstance.id,
				installmentNumber: 1,
				amount: 25000, // RM 250.00 (half of RM 500)
				taxAmount: 0,
				status: "paid",
				dueDate: new Date(), // due now / already paid
				paidAt: new Date(),
				paymentMethod: "cash",
				creditsUnlockedByThis: 5, // unlocks first half of credits
				notes: "E2E seed — first installment (paid)",
			});
			console.log("   Created installment 1 (paid, 5 credits unlocked)");
		}

		const existingInstallment2 = await tenantDb
			.select()
			.from(installments)
			.where(
				and(
					eq(installments.packageInstanceId, e2ePackageInstance.id),
					eq(installments.installmentNumber, 2),
				),
			)
			.limit(1);

		if (existingInstallment2.length > 0) {
			console.log("   Installment 2 already exists");
		} else {
			const dueDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days from now
			await tenantDb.insert(installments).values({
				packageInstanceId: e2ePackageInstance.id,
				installmentNumber: 2,
				amount: 25000, // RM 250.00 (second half)
				taxAmount: 0,
				status: "pending",
				dueDate,
				creditsUnlockedByThis: 5, // unlocks second half of credits when paid
				notes: "E2E seed — second installment (pending)",
			});
			console.log("   Created installment 2 (pending, due in ~60 days)");
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
			// Steps 8–12
			trainerUserId,
			trainerMemberId,
			trainerEmail: TRAINER_EMAIL,
			staffUserId,
			staffMemberId,
			staffEmail: STAFF_EMAIL,
			e2eCategoryId: e2eCategory.id,
			e2eServiceId: e2eService.id,
			e2eClientUserId: clientUserId,
			e2eClientEmail: CLIENT_EMAIL,
			e2ePackageInstanceId: e2ePackageInstance.id,
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
		console.log("");
		console.log("--- Steps 8–12 (E2E fixtures) ---");
		console.log(`Trainer:           ${trainerUserId} (${TRAINER_EMAIL})`);
		console.log(`Trainer member:    ${trainerMemberId}`);
		console.log(`Staff:             ${staffUserId} (${STAFF_EMAIL})`);
		console.log(`Staff member:      ${staffMemberId}`);
		console.log(`E2E Category:      ${e2eCategory.id} (${e2eCategory.name})`);
		console.log(`E2E Service:       ${e2eService.id} (${e2eService.name})`);
		console.log(`E2E Client:        ${clientUserId} (${CLIENT_EMAIL})`);
		console.log(
			`E2E Pkg Instance:  ${e2ePackageInstance.id} (E2E-PKG-001, half plan)`,
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
