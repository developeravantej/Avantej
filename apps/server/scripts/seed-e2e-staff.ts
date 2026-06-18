/**
 * Seed Script: E2E staff user (for /e2e-deep RBAC specs).
 *
 * Provisions a single VERIFIED, non-admin staff user in the Test Fitness
 * Franchise tenant — without the full business-data chain. Idempotent.
 *
 *   staff.deterministic@test.com / password123  (role "staff")
 *
 * Creates: control-panel user (emailVerified) + credential account +
 * organization_members cache row + tenant member scoped to a branch node.
 *
 * Usage:  cd apps/server && bun run scripts/seed-e2e-staff.ts
 */
import { decrypt } from "@avantej-core/db";
import { account } from "@avantej-core/db/schema/auth";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
	organizationMembers,
	users,
} from "@avantej-core/db/schema/control-panel/index";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { members } from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";
import { hashPassword } from "better-auth/crypto";

neonConfig.webSocketConstructor = ws;
const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const STAFF_EMAIL = "staff.deterministic@test.com";
const STAFF_PASSWORD = "password123";

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#")) continue;
			const m = t.match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined && !process.env[m[1]])
				process.env[m[1]] = m[2];
		}
	} catch (e) {
		console.warn("Could not load .dev.vars:", e);
	}
}

async function main() {
	loadDevVars();
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const controlPool = new Pool({ connectionString: databaseUrl });
	const controlDb = drizzle({
		client: controlPool,
		schema: controlPanelSchema,
	});

	const org = await controlDb.query.organizations.findFirst({
		where: (o, { eq }) => eq(o.id, TARGET_ORG_ID),
	});
	if (!org) throw new Error(`Organization not found: ${TARGET_ORG_ID}`);
	console.log(`Org: ${org.name} (${org.id})`);

	const tenantPool = new Pool({
		connectionString: decrypt(org.connectionString),
	});
	const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

	// Resolve a branch node (any branch; fall back to the deepest node).
	let branchNode = await tenantDb.query.hierarchyNodes.findFirst({
		where: (n, { eq }) => eq(n.type, "branch"),
	});
	if (!branchNode) {
		const all = await tenantDb.query.hierarchyNodes.findMany();
		branchNode = all.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))[0];
	}
	if (!branchNode) throw new Error("No hierarchy nodes in tenant DB");
	console.log(
		`Branch node: ${branchNode.id} (${branchNode.name}, depth ${branchNode.depth})`,
	);

	// 1) Control-panel user (verified)
	let staffUserId: string;
	const existingUser = await controlDb.query.user.findFirst({
		where: (u, { eq }) => eq(u.email, STAFF_EMAIL.toLowerCase()),
	});
	if (existingUser) {
		staffUserId = existingUser.id;
		console.log(`CP user exists: ${staffUserId}`);
	} else {
		staffUserId = crypto.randomUUID();
		await controlDb.insert(users).values({
			id: staffUserId,
			email: STAFF_EMAIL.toLowerCase(),
			name: "Deterministic Staff",
			firstName: "Deterministic",
			lastName: "Staff",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		console.log(`Created CP user: ${staffUserId}`);
	}

	// 2) Credential account (password)
	const existingAccount = await controlDb.query.account.findFirst({
		where: (a, { eq, and }) =>
			and(eq(a.userId, staffUserId), eq(a.providerId, "credential")),
	});
	if (!existingAccount) {
		await controlDb.insert(account).values({
			id: crypto.randomUUID(),
			accountId: staffUserId,
			providerId: "credential",
			userId: staffUserId,
			password: await hashPassword(STAFF_PASSWORD),
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		console.log("Created credential account");
	} else {
		console.log("Credential account exists");
	}

	// 3) Organization member cache (control panel)
	const existingOrgMember = await controlDb.query.organizationMembers.findFirst(
		{
			where: (om, { eq, and }) =>
				and(eq(om.userId, staffUserId), eq(om.organizationId, TARGET_ORG_ID)),
		},
	);
	if (!existingOrgMember) {
		await controlDb.insert(organizationMembers).values({
			userId: staffUserId,
			organizationId: TARGET_ORG_ID,
			role: "staff",
			status: "active",
		});
		console.log("Created org member cache row");
	} else {
		console.log("Org member cache row exists");
	}

	// 4) Tenant member (scoped to branch)
	const existingMember = await tenantDb.query.members.findFirst({
		where: (m, { eq }) => eq(m.userId, staffUserId),
	});
	if (!existingMember) {
		const [created] = await tenantDb
			.insert(members)
			.values({
				userId: staffUserId,
				role: "staff",
				hierarchyScopeId: branchNode.id,
				status: "active",
			})
			.returning();
		console.log(`Created tenant member: ${created?.id}`);
	} else {
		console.log(`Tenant member exists: ${existingMember.id}`);
	}

	await controlPool.end();
	await tenantPool.end();
	console.log(`\n✅ Staff ready: ${STAFF_EMAIL} / ${STAFF_PASSWORD}`);
}

main().catch((e) => {
	console.error("seed-e2e-staff failed:", e);
	process.exit(1);
});
