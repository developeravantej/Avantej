/**
 * Fix Script: Update trainer hierarchy scope
 *
 * Moves Alex Wong, Maya Krishnan, and Daniel Tan from root hierarchy node
 * to the branch node (type=branch, depth=4) so they appear alongside the
 * deterministic trainer in branch-scoped queries.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/fix-trainer-hierarchy-scope.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { members } from "@avantej-core/db/schema/tenant/index";
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
const TRAINER_EMAILS = [
	"coach.alex@example.com",
	"maya.trainer@example.com",
	"daniel.fit@example.com",
];

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
	} catch (error) {
		console.warn("Could not load .dev.vars:", error);
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

async function fixTrainerHierarchyScope() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const { db: controlDb, pool: controlPool } = createControlPanelDb(databaseUrl);
	let tenantPool: Pool | null = null;

	try {
		const org = await controlDb.query.organizations.findFirst({
			where: (orgs, { eq }) => eq(orgs.id, TARGET_ORG_ID),
		});
		if (!org) throw new Error(`Organization not found: ${TARGET_ORG_ID}`);

		const tenantConnStr = decrypt(org.connectionString);
		const { db: tenantDb, pool } = createTenantDb(tenantConnStr);
		tenantPool = pool;

		const branchNode = await tenantDb.query.hierarchyNodes.findFirst({
			where: (nodes, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(nodes.type, "branch"), eqFn(nodes.depth, 4)),
		});
		if (!branchNode) throw new Error("No branch node found (type=branch, depth=4)");
		console.log(`Target branch: ${branchNode.id} (${branchNode.name})\n`);

		for (const email of TRAINER_EMAILS) {
			const user = await controlDb.query.users.findFirst({
				where: (u, { eq }) => eq(u.email, email.toLowerCase()),
			});
			if (!user) {
				console.log(`${email} — user not found, skip`);
				continue;
			}

			const member = await tenantDb.query.members.findFirst({
				where: (m, { eq }) => eq(m.userId, user.id),
			});
			if (!member) {
				console.log(`${email} — member not found, skip`);
				continue;
			}

			if (member.hierarchyScopeId === branchNode.id) {
				console.log(`${email} — already at branch, skip`);
				continue;
			}

			await tenantDb
				.update(members)
				.set({ hierarchyScopeId: branchNode.id })
				.where(eq(members.id, member.id));

			console.log(`${email} — moved to branch ${branchNode.name}`);
		}

		console.log("\nDone.");
	} finally {
		await controlPool.end();
		if (tenantPool) await tenantPool.end();
	}
}

fixTrainerHierarchyScope()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
