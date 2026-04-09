/**
 * Seed Script: 3 Trainers (Members + Member Profiles)
 *
 * Creates 3 trainers:
 *   - A control panel user for each (email/password accounts)
 *   - An organization membership entry (role: trainer)
 *   - A tenant members row (role: trainer)
 *   - A tenant member_profiles row with specialization, certifications, etc.
 *
 * The script is idempotent — it skips records that already exist.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/seed-trainers.ts
 */

import { decrypt } from "@avantej-core/db";
import { account } from "@avantej-core/db/schema/auth";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizationMembers, users } from "@avantej-core/db/schema/control-panel/index";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { members, memberProfiles } from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const DEFAULT_PASSWORD = "password123";

// ─── trainer definitions ─────────────────────────────────────────────────────

const TRAINERS = [
	{
		email: "coach.alex@example.com",
		name: "Alex Wong",
		displayName: "Coach Alex",
		bio: "10+ years in strength and conditioning. Former national powerlifting athlete. Specialises in progressive overload programming for all fitness levels.",
		specialization: "Strength & Conditioning",
		phoneNumber: "+60 12-456 7890",
		certifications: ["ACE Certified Personal Trainer", "NSCA-CSCS", "CrossFit Level 2"],
	},
	{
		email: "maya.trainer@example.com",
		name: "Maya Krishnan",
		displayName: "Maya K.",
		bio: "Yoga and mobility specialist with a background in sports physiotherapy. Passionate about injury prevention and functional movement.",
		specialization: "Yoga & Mobility",
		phoneNumber: "+60 17-234 5678",
		certifications: ["RYT-500 Yoga Alliance", "FMS Level 2", "Sports Physiotherapy Diploma"],
	},
	{
		email: "daniel.fit@example.com",
		name: "Daniel Tan",
		displayName: "Danny T",
		bio: "HIIT and cardio specialist. Runs group fitness classes and 1-on-1 fat loss programmes. Energetic and results-driven.",
		specialization: "HIIT & Cardio",
		phoneNumber: "+60 19-876 5432",
		certifications: ["NASM-CPT", "Les Mills Body Combat Instructor", "First Aid & CPR"],
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

async function seedTrainers() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	console.log("Starting trainer seed...\n");

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

		// ── Resolve hierarchy scope (use org root node, depth 0) ─────────────
		console.log("Step 2: Resolving hierarchy scope...");
		const orgNode = await tenantDb.query.hierarchyNodes.findFirst({
			where: (nodes, { eq }) => eq(nodes.depth, 0),
		});
		if (!orgNode) throw new Error("No root hierarchy node found. Run seed-franchise-owner.ts first.");
		console.log(`   Using hierarchy node: ${orgNode.id} (${orgNode.name})`);

		// ── Seed each trainer ─────────────────────────────────────────────────
		for (const [i, trainer] of TRAINERS.entries()) {
			console.log(`\nStep ${i + 3}: Seeding trainer "${trainer.name}"...`);

			// 1. Control panel user
			let userId: string;
			const existingUser = await controlDb.query.users.findFirst({
				where: (u, { eq }) => eq(u.email, trainer.email.toLowerCase()),
			});

			if (existingUser) {
				console.log(`   User already exists: ${existingUser.id}`);
				userId = existingUser.id;
			} else {
				userId = crypto.randomUUID();
				await controlDb.insert(users).values({
					id: userId,
					email: trainer.email.toLowerCase(),
					name: trainer.name,
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
					accountId: trainer.email.toLowerCase(),
					providerId: "credential",
					userId,
					password: hashedPassword,
					createdAt: new Date(),
					updatedAt: new Date(),
				});
				console.log("   Created password account");
			}

			// 3. Organization member entry (trainer role)
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
					role: "trainer",
					status: "active",
				});
				console.log("   Created organization member entry (role: trainer)");
			}

			// 4. Tenant members table
			let memberId: string;
			const existingMember = await tenantDb.query.members.findFirst({
				where: (m, { eq }) => eq(m.userId, userId),
			});

			if (existingMember) {
				console.log(`   Tenant member already exists: ${existingMember.id}`);
				memberId = existingMember.id;
			} else {
				const [created] = await tenantDb
					.insert(members)
					.values({
						userId,
						role: "trainer",
						hierarchyScopeId: orgNode.id,
						status: "active",
					})
					.returning();
				if (!created) throw new Error(`Failed to create tenant member for ${trainer.name}`);
				memberId = created.id;
				console.log(`   Created tenant member: ${memberId}`);
			}

			// 5. Member profile (trainer-specific data)
			const existingProfile = await tenantDb.query.memberProfiles.findFirst({
				where: (mp, { eq }) => eq(mp.memberId, memberId),
			});

			if (existingProfile) {
				console.log(`   Member profile already exists: ${existingProfile.id}`);
			} else {
				const [created] = await tenantDb
					.insert(memberProfiles)
					.values({
						memberId,
						displayName: trainer.displayName,
						bio: trainer.bio,
						specialization: trainer.specialization,
						phoneNumber: trainer.phoneNumber,
						certifications: [...trainer.certifications],
					})
					.returning();
				if (!created) throw new Error(`Failed to create profile for ${trainer.name}`);
				console.log(`   Created member profile: ${created.id}`);
			}
		}

		// ── Summary ───────────────────────────────────────────────────────────
		console.log("\n" + "=".repeat(60));
		console.log("TRAINER SEED SUMMARY");
		console.log("=".repeat(60));
		for (const trainer of TRAINERS) {
			console.log(`  ${trainer.displayName} (${trainer.name})`);
			console.log(`    Email: ${trainer.email}  Password: ${DEFAULT_PASSWORD}`);
			console.log(`    Specialization: ${trainer.specialization}`);
			console.log(`    Certifications: ${trainer.certifications.join(", ")}`);
			console.log("");
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
	seedTrainers()
		.then(() => {
			console.log("\nSeed script completed successfully.");
			process.exit(0);
		})
		.catch((error) => {
			console.error("Seed script failed:", error);
			process.exit(1);
		});
}

export { seedTrainers };
