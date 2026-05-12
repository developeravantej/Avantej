/**
 * Seed Script: Extended App Data
 *
 * Adds richer data for the native app:
 * - More service categories (Classes, Yoga, Wellness)
 * - More services across categories
 * - More packages with varied pricing
 * - Package instances for customer users
 * - Notifications for testing
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/seed-app-data.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	notifications,
	packageInstances,
	serviceCategories,
	services,
} from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

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
	} catch {
		console.warn("Could not load .dev.vars");
	}
}

function createControlPanelDb(databaseUrl: string) {
	const pool = new Pool({ connectionString: databaseUrl });
	return { db: drizzle({ client: pool, schema: controlPanelSchema }), pool };
}

function createTenantDb(connectionString: string) {
	const pool = new Pool({ connectionString });
	return { db: drizzle({ client: pool, schema: tenantSchema }), pool };
}

async function main() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	console.log("Starting extended app data seed...\n");

	const { db: controlDb, pool: controlPool } = createControlPanelDb(databaseUrl);
	let tenantPool: Pool | null = null;

	try {
		// Resolve tenant connection
		const org = await controlDb.query.organizations.findFirst({
			where: (orgs, { eq: eqFn }) => eqFn(orgs.id, TARGET_ORG_ID),
		});
		if (!org) throw new Error("Organization not found");
		console.log(`Org: ${org.name}`);

		const tenantConnectionString = decrypt(org.connectionString);
		const { db: tenantDb, pool } = createTenantDb(tenantConnectionString);
		tenantPool = pool;

		// Find branch node
		const branchNode = await tenantDb.query.hierarchyNodes.findFirst({
			where: (nodes, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(nodes.type, "branch"), eqFn(nodes.depth, 4)),
		});
		if (!branchNode) throw new Error("No branch node found");
		const branchId = branchNode.id;
		console.log(`Branch: ${branchNode.name}\n`);

		// Find all users in the organization (to assign packages to them)
		const allOrgMembers = await controlDb.query.organizationMembers.findMany({
			where: (om, { eq: eqFn }) => eqFn(om.organizationId, TARGET_ORG_ID),
		});
		const userIds = allOrgMembers.map((m) => m.userId);
		console.log(`Found ${userIds.length} users in org\n`);

		// ──── SERVICE CATEGORIES ────
		console.log("Seeding service categories...");

		const categoryDefs = [
			{ name: "Group Classes", description: "High-energy group workout sessions", displayOrder: 2 },
			{ name: "Yoga & Mindfulness", description: "Flexibility, balance, and mental wellness", displayOrder: 3 },
			{ name: "Recovery & Wellness", description: "Recovery, stretching, and rehabilitation", displayOrder: 4 },
			{ name: "Cardio & Endurance", description: "Cardiovascular fitness and stamina building", displayOrder: 5 },
		];

		const createdCategories: Record<string, string> = {};
		for (const cat of categoryDefs) {
			const existing = await tenantDb.query.serviceCategories.findFirst({
				where: (sc, { eq: eqFn, and: andFn }) =>
					andFn(eqFn(sc.name, cat.name), eqFn(sc.branchId, branchId)),
			});
			if (existing) {
				createdCategories[cat.name] = existing.id;
				console.log(`  [exists] ${cat.name}`);
			} else {
				const [created] = await tenantDb
					.insert(serviceCategories)
					.values({ ...cat, branchId, isActive: true })
					.returning();
				createdCategories[cat.name] = created!.id;
				console.log(`  [created] ${cat.name}`);
			}
		}

		// Get existing "Personal Training" category
		const ptCategory = await tenantDb.query.serviceCategories.findFirst({
			where: (sc, { eq: eqFn }) => eqFn(sc.name, "Personal Training"),
		});
		if (ptCategory) createdCategories["Personal Training"] = ptCategory.id;

		// ──── SERVICES ────
		console.log("\nSeeding services...");

		const serviceDefs = [
			// Group Classes
			{
				name: "HIIT Bootcamp",
				categoryName: "Group Classes",
				duration: 45,
				type: "semi_private" as const,
				price: 2500,
				maxAttendees: 15,
				description: "High-intensity interval training for maximum calorie burn",
				schedulingType: "class_slot" as const,
			},
			{
				name: "Spin Cycle",
				categoryName: "Group Classes",
				duration: 45,
				type: "semi_private" as const,
				price: 2000,
				maxAttendees: 20,
				description: "Indoor cycling with energizing music and interval sprints",
				schedulingType: "class_slot" as const,
			},
			{
				name: "Boxing Fitness",
				categoryName: "Group Classes",
				duration: 60,
				type: "semi_private" as const,
				price: 3000,
				maxAttendees: 12,
				description: "Boxing-inspired workout combining cardio and strength",
				schedulingType: "class_slot" as const,
			},
			// Yoga
			{
				name: "Vinyasa Flow",
				categoryName: "Yoga & Mindfulness",
				duration: 60,
				type: "semi_private" as const,
				price: 2000,
				maxAttendees: 20,
				description: "Dynamic flowing yoga connecting breath with movement",
				schedulingType: "class_slot" as const,
			},
			{
				name: "Yin Yoga",
				categoryName: "Yoga & Mindfulness",
				duration: 75,
				type: "semi_private" as const,
				price: 2000,
				maxAttendees: 15,
				description: "Slow-paced yoga with deep stretching and relaxation",
				schedulingType: "class_slot" as const,
			},
			// Recovery
			{
				name: "Sports Massage",
				categoryName: "Recovery & Wellness",
				duration: 60,
				type: "private" as const,
				price: 8000,
				maxAttendees: 1,
				description: "Deep tissue massage targeting muscle recovery",
				schedulingType: "appointment" as const,
			},
			{
				name: "Stretch & Mobility",
				categoryName: "Recovery & Wellness",
				duration: 30,
				type: "semi_private" as const,
				price: 1500,
				maxAttendees: 8,
				description: "Guided stretching session for flexibility and injury prevention",
				schedulingType: "class_slot" as const,
			},
			// Cardio
			{
				name: "Treadmill Intervals",
				categoryName: "Cardio & Endurance",
				duration: 30,
				type: "semi_private" as const,
				price: 1800,
				maxAttendees: 10,
				description: "Structured treadmill workout with varying speeds and inclines",
				schedulingType: "class_slot" as const,
			},
			// Additional Personal Training
			{
				name: "Strength & Conditioning",
				categoryName: "Personal Training",
				duration: 60,
				type: "private" as const,
				price: 10000,
				maxAttendees: 1,
				description: "Focused strength training with progressive overload programming",
				schedulingType: "appointment" as const,
			},
		];

		const createdServices: Record<string, string> = {};
		for (const svc of serviceDefs) {
			const categoryId = createdCategories[svc.categoryName];
			if (!categoryId) {
				console.log(`  [skip] ${svc.name} - category "${svc.categoryName}" not found`);
				continue;
			}

			const existing = await tenantDb.query.services.findFirst({
				where: (s, { eq: eqFn, and: andFn }) =>
					andFn(eqFn(s.name, svc.name), eqFn(s.branchId, branchId)),
			});

			if (existing) {
				createdServices[svc.name] = existing.id;
				console.log(`  [exists] ${svc.name}`);
			} else {
				const [created] = await tenantDb
					.insert(services)
					.values({
						name: svc.name,
						categoryId,
						duration: svc.duration,
						durationUnitType: "minutes",
						maxAttendees: svc.maxAttendees,
						branchId,
						isActive: true,
						type: svc.type,
						price: svc.price,
						priceUnit: svc.type === "private" ? "session" : "class",
						taxable: false,
						taxPercentage: 0,
						isRecommended: false,
						schedulingType: svc.schedulingType,
						description: svc.description,
					})
					.returning();
				createdServices[svc.name] = created!.id;
				console.log(`  [created] ${svc.name}`);
			}
		}

		// ──── PACKAGE-STYLE SERVICES ────
		console.log("\nSeeding package-style services...");

		const packageDefs = [
			{
				name: "Group 10-Class Pass",
				type: "semi_private" as const,
				sessionCount: 10,
				price: 2200,
				maxAttendees: 20,
				expiryDays: 90,
			},
			{
				name: "Group 20-Class Pass",
				type: "semi_private" as const,
				sessionCount: 20,
				price: 2000,
				maxAttendees: 20,
				expiryDays: 180,
			},
			{
				name: "Private 5-Session Starter",
				type: "private" as const,
				sessionCount: 5,
				price: 12000,
				maxAttendees: 1,
				expiryDays: 60,
			},
			{
				name: "Unlimited Monthly",
				type: "both" as const,
				sessionCount: 30,
				price: 3000,
				maxAttendees: 20,
				expiryDays: 30,
			},
			{
				name: "Recovery 8-Session Pack",
				type: "private" as const,
				sessionCount: 8,
				price: 7500,
				maxAttendees: 1,
				expiryDays: 120,
			},
		];

		const createdPackages: Array<{ id: string; name: string; sessionCount: number; price: number; expiryDays: number }> = [];
		for (const pkg of packageDefs) {
			const existing = await tenantDb.query.services.findFirst({
				where: (s, { eq: eqFn, and: andFn }) =>
					andFn(eqFn(s.name, pkg.name), eqFn(s.branchId, branchId)),
			});

			if (existing) {
				createdPackages.push({
					id: existing.id,
					name: existing.name,
					sessionCount: existing.sessionCount ?? pkg.sessionCount,
					price: existing.price ?? pkg.price,
					expiryDays: existing.expiryDays ?? 365,
				});
				console.log(`  [exists] ${pkg.name}`);
			} else {
				const [created] = await tenantDb
					.insert(services)
					.values({
						name: pkg.name,
						type: pkg.type,
						sessionCount: pkg.sessionCount,
						price: pkg.price,
						maxAttendees: pkg.maxAttendees,
						expiryDays: pkg.expiryDays,
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
				createdPackages.push({
					id: created!.id,
					name: created!.name,
					sessionCount: created!.sessionCount ?? pkg.sessionCount,
					price: created!.price ?? pkg.price,
					expiryDays: created!.expiryDays ?? 365,
				});
				console.log(`  [created] ${pkg.name}`);
			}
		}

		// ──── PACKAGE INSTANCES (for each user) ────
		console.log("\nSeeding package instances for users...");

		for (const userId of userIds) {
			// Check if user already has any instances
			const existingInstances = await tenantDb.query.packageInstances.findMany({
				where: (pi, { eq: eqFn }) => eqFn(pi.clientId, userId),
			});

			if (existingInstances.length >= 2) {
				console.log(`  [skip] User ${userId.substring(0, 8)}... already has ${existingInstances.length} instances`);
				continue;
			}

			const now = new Date();

			// Active package
			const activePkg = createdPackages[0];
			if (activePkg) {
				const expiresAt = new Date(now.getTime() + activePkg.expiryDays * 24 * 60 * 60 * 1000);
				const creditsUsed = Math.floor(Math.random() * Math.floor(activePkg.sessionCount / 2));

				try {
					await tenantDb.insert(packageInstances).values({
						serviceId: activePkg.id,
						clientId: userId,
						source: "purchased",
						totalPrice: activePkg.sessionCount * activePkg.price,
						taxAmount: 0,
						paymentStatus: "paid",
						paymentMethod: "card",
						creditsTotal: activePkg.sessionCount,
						creditsUsed,
						startsAt: now,
						expiresAt,
						status: "active",
					});
					console.log(`  [created] Active "${activePkg.name}" for user ${userId.substring(0, 8)}...`);
				} catch {
					console.log(`  [skip] Duplicate for user ${userId.substring(0, 8)}...`);
				}
			}

			// Second package (different one)
			const secondPkg = createdPackages[2] ?? createdPackages[1];
			if (secondPkg && secondPkg.id !== activePkg?.id) {
				const expiresAt = new Date(now.getTime() + secondPkg.expiryDays * 24 * 60 * 60 * 1000);

				try {
					await tenantDb.insert(packageInstances).values({
						serviceId: secondPkg.id,
						clientId: userId,
						source: "purchased",
						totalPrice: secondPkg.sessionCount * secondPkg.price,
						taxAmount: 0,
						paymentStatus: "paid",
						paymentMethod: "card",
						creditsTotal: secondPkg.sessionCount,
						creditsUsed: 0,
						startsAt: now,
						expiresAt,
						status: "active",
					});
					console.log(`  [created] Active "${secondPkg.name}" for user ${userId.substring(0, 8)}...`);
				} catch {
					console.log(`  [skip] Duplicate for user ${userId.substring(0, 8)}...`);
				}
			}
		}

		// ──── NOTIFICATIONS (for each user) ────
		console.log("\nSeeding notifications...");

		const now = new Date();
		const notifDefs = [
			{ type: "booking", title: "Booking Confirmed", message: "Your HIIT Bootcamp session on Monday at 10:00 AM has been confirmed" },
			{ type: "reminder", title: "Upcoming Session", message: "You have a Vinyasa Flow class tomorrow at 9:00 AM" },
			{ type: "promotion", title: "New Package Available", message: "Check out our new Unlimited Monthly package - only $90/month!" },
			{ type: "system", title: "Welcome!", message: "Welcome to Avantej Fitness! Start exploring our services and book your first session." },
		];

		for (const userId of userIds) {
			const existingNotifs = await tenantDb.query.notifications.findMany({
				where: (n, { eq: eqFn }) => eqFn(n.userId, userId),
			});

			if (existingNotifs.length > 0) {
				console.log(`  [skip] User ${userId.substring(0, 8)}... already has ${existingNotifs.length} notifications`);
				continue;
			}

			for (let i = 0; i < notifDefs.length; i++) {
				const notif = notifDefs[i]!;
				const createdAt = new Date(now.getTime() - (i + 1) * 3600000); // stagger by hours

				try {
					await tenantDb.insert(notifications).values({
						userId,
						type: notif.type,
						title: notif.title,
						message: notif.message,
						isRead: i >= 2, // first 2 unread, rest read
						createdAt,
					});
				} catch {
					// Skip if table doesn't exist or constraint fails
				}
			}
			console.log(`  [created] 4 notifications for user ${userId.substring(0, 8)}...`);
		}

		console.log("\n" + "=".repeat(60));
		console.log("EXTENDED SEED COMPLETE");
		console.log("=".repeat(60));
		console.log(`Categories: ${Object.keys(createdCategories).length}`);
		console.log(`Services: ${Object.keys(createdServices).length} new`);
		console.log(`Packages: ${createdPackages.length} new`);
		console.log(`Users with data: ${userIds.length}`);
		console.log("=".repeat(60));
	} catch (error) {
		console.error("\nSeed failed:", error);
		throw error;
	} finally {
		await controlPool.end();
		if (tenantPool) await tenantPool.end();
	}
}

main()
	.then(() => {
		console.log("\nDone.");
		process.exit(0);
	})
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
