/**
 * Seed Script: 3 Customers (Customer Profiles)
 *
 * Creates 3 registered customers:
 *   - A control panel user for each (email/password accounts)
 *   - A customer_profiles row in the tenant DB for each
 *
 * The script is idempotent — it skips records that already exist.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/seed-customers.ts
 */

import { decrypt } from "@avantej-core/db";
import { account } from "@avantej-core/db/schema/auth";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizationMembers, users } from "@avantej-core/db/schema/control-panel/index";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { customerProfiles, members } from "@avantej-core/db/schema/tenant/index";
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
const DEFAULT_PASSWORD = "password123";

// ─── customer definitions ─────────────────────────────────────────────────────

const CUSTOMERS = [
	{
		email: "sarah.lim@example.com",
		name: "Sarah Lim",
		phone: "+60 12-345 6789",
		gender: "female",
		dateOfBirth: new Date("1996-04-15"),
		address: "12 Jalan Bukit Bintang, 55100 Kuala Lumpur",
		fitnessGoals: ["weight_loss", "toning"],
		medicalNotes: null,
		emergencyContactName: "Lim Ah Kow",
		emergencyContactPhone: "+60 11-234 5678",
		creditPoints: 150,
		notes: "Prefers morning sessions. Lactose intolerant.",
	},
	{
		email: "ahmad.ridzwan@example.com",
		name: "Ahmad Ridzwan",
		phone: "+60 17-891 2345",
		gender: "male",
		dateOfBirth: new Date("1989-11-02"),
		address: "88 Lorong Maarof, Bangsar, 59000 Kuala Lumpur",
		fitnessGoals: ["strength", "muscle_gain"],
		medicalNotes: "Mild lower-back pain — avoid heavy deadlifts.",
		emergencyContactName: "Siti Ridzwan",
		emergencyContactPhone: "+60 16-789 0123",
		creditPoints: 320,
		notes: "Advanced lifter. Trains 5× per week.",
	},
	{
		email: "priya.nair@example.com",
		name: "Priya Nair",
		phone: "+60 19-567 8901",
		gender: "female",
		dateOfBirth: new Date("2000-07-28"),
		address: "3A Residensi Hartamas, 50480 Kuala Lumpur",
		fitnessGoals: ["flexibility", "stress_relief"],
		medicalNotes: null,
		emergencyContactName: "Nair Gopalan",
		emergencyContactPhone: "+60 12-678 9012",
		creditPoints: 50,
		notes: "New member. Interested in yoga-fusion classes.",
	},
] as const;

// ─── env loader ───────────────────────────────────────────────────────────────

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
				if (!process.env[key]) process.env[key] = value;
			}
		}
	} catch (error) {
		console.warn("Could not load .dev.vars:", error);
	}
}

// ─── db helpers ───────────────────────────────────────────────────────────────

function createControlPanelDb(databaseUrl: string) {
	const pool = new Pool({ connectionString: databaseUrl });
	return { db: drizzle({ client: pool, schema: controlPanelSchema }), pool };
}

function createTenantDb(connectionString: string) {
	const pool = new Pool({ connectionString });
	return { db: drizzle({ client: pool, schema: tenantSchema }), pool };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function seedCustomers() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	console.log("Starting customer seed...\n");

	const { db: controlDb, pool: controlPool } = createControlPanelDb(databaseUrl);
	let tenantPool: Pool | null = null;

	try {
		// ── Resolve org → tenant connection ──────────────────────────────────
		console.log("Step 1: Resolving organization...");

		const org = await controlDb.query.organizations.findFirst({
			where: (orgs, { eq }) => eq(orgs.id, TARGET_ORG_ID),
		});

		if (!org) throw new Error(`Organization not found: ${TARGET_ORG_ID}`);
		console.log(`   Found org: ${org.name} (${org.id})`);

		const tenantConnStr = decrypt(org.connectionString);
		const { db: tenantDb, pool } = createTenantDb(tenantConnStr);
		tenantPool = pool;

		const bcrypt = await import("bcryptjs");

		// ── Resolve hierarchy scope for customers (use org root node, depth 0) ─
		console.log("Step 2: Resolving hierarchy scope...");
		const orgNode = await tenantDb.query.hierarchyNodes.findFirst({
			where: (nodes, { eq }) => eq(nodes.depth, 0),
		});
		if (!orgNode) throw new Error("No root hierarchy node found. Run seed-franchise-owner.ts first.");
		console.log(`   Using hierarchy node: ${orgNode.id} (${orgNode.name})`);

		// ── Seed each customer ────────────────────────────────────────────────
		for (const [i, customer] of CUSTOMERS.entries()) {
			console.log(`\nStep ${i + 2}: Seeding customer "${customer.name}"...`);

			// 1. Control panel user
			let userId: string;
			const existingUser = await controlDb.query.users.findFirst({
				where: (u, { eq }) => eq(u.email, customer.email.toLowerCase()),
			});

			if (existingUser) {
				console.log(`   User already exists: ${existingUser.id}`);
				userId = existingUser.id;
			} else {
				userId = crypto.randomUUID();
				await controlDb.insert(users).values({
					id: userId,
					email: customer.email.toLowerCase(),
					name: customer.name,
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				});
				console.log(`   Created user: ${userId}`);
			}

			// 2. Password account
			const existingAccount = await controlDb.query.account.findFirst({
				where: (a, { eq, and }) =>
					and(eq(a.userId, userId), eq(a.providerId, "credential")),
			});

			if (existingAccount) {
				console.log("   Password account already exists");
			} else {
				const hashedPassword = await bcrypt.default.hash(DEFAULT_PASSWORD, 10);
				await controlDb.insert(account).values({
					id: crypto.randomUUID(),
					accountId: customer.email.toLowerCase(),
					providerId: "credential",
					userId,
					password: hashedPassword,
					createdAt: new Date(),
					updatedAt: new Date(),
				});
				console.log("   Created password account");
			}

			// 3. Organization member entry (customer role)
			const existingOrgMember = await controlDb.query.organizationMembers.findFirst({
				where: (om, { eq, and }) =>
					and(eq(om.userId, userId), eq(om.organizationId, TARGET_ORG_ID)),
			});

			if (existingOrgMember) {
				console.log("   Organization member entry already exists");
			} else {
				await controlDb.insert(organizationMembers).values({
					userId,
					organizationId: TARGET_ORG_ID,
					role: "client",
					status: "active",
				});
				console.log("   Created organization member entry (role: client)");
			}

			// 4. Tenant members table (required for members.list API)
			const existingMember = await tenantDb.query.members.findFirst({
				where: (m, { eq }) => eq(m.userId, userId),
			});

			if (existingMember) {
				console.log(`   Tenant member already exists: ${existingMember.id}`);
			} else {
				const [created] = await tenantDb
					.insert(members)
					.values({
						userId,
						role: "client",
						hierarchyScopeId: orgNode.id,
						status: "active",
					})
					.returning();
				if (!created) throw new Error(`Failed to create tenant member for ${customer.name}`);
				console.log(`   Created tenant member: ${created.id}`);
			}

			// 6. Tenant customer profile
			const existingProfile = await tenantDb.query.customerProfiles.findFirst({
				where: (cp, { eq }) => eq(cp.userId, userId),
			});

			if (existingProfile) {
				console.log(`   Customer profile already exists: ${existingProfile.id}`);
			} else {
				const [created] = await tenantDb
					.insert(customerProfiles)
					.values({
						userId,
						phone: customer.phone,
						dateOfBirth: customer.dateOfBirth,
						gender: customer.gender,
						address: customer.address,
						fitnessGoals: [...customer.fitnessGoals],
						medicalNotes: customer.medicalNotes ?? null,
						emergencyContactName: customer.emergencyContactName,
						emergencyContactPhone: customer.emergencyContactPhone,
						creditPoints: customer.creditPoints,
						notes: customer.notes,
						isDeleted: false,
					})
					.returning();

				if (!created) throw new Error(`Failed to create profile for ${customer.name}`);
				console.log(`   Created customer profile: ${created.id}`);
			}
		}

		// ── Summary ───────────────────────────────────────────────────────────
		console.log("\n" + "=".repeat(60));
		console.log("CUSTOMER SEED SUMMARY");
		console.log("=".repeat(60));
		for (const customer of CUSTOMERS) {
			console.log(`  ${customer.name} <${customer.email}>  password: ${DEFAULT_PASSWORD}`);
		}
		console.log("=".repeat(60));
	} catch (error) {
		console.error("\nSeed failed:", error);
		throw error;
	} finally {
		await controlPool.end();
		if (tenantPool) await tenantPool.end();
	}
}

if (import.meta.main) {
	seedCustomers()
		.then(() => {
			console.log("\nSeed script completed successfully.");
			process.exit(0);
		})
		.catch((error) => {
			console.error("Seed script failed:", error);
			process.exit(1);
		});
}

export { seedCustomers };
