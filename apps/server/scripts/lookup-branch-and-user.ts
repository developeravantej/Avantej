/**
 * Lookup a branch + user by their IDs (used for debugging the booking flow).
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/lookup-branch-and-user.ts <orgId> <branchId> <userId>
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
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
			const m = trimmed.match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined) {
				if (!process.env[m[1]]) process.env[m[1]] = m[2];
			}
		}
	} catch (err) {
		console.warn("Could not load .dev.vars:", err);
	}
}

async function main() {
	loadDevVars();

	const [orgId, branchId, userId] = process.argv.slice(2);
	if (!orgId || !branchId || !userId) {
		console.error(
			"Usage: bun run scripts/lookup-branch-and-user.ts <orgId> <branchId> <userId>",
		);
		process.exit(1);
	}

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const controlPool = new Pool({ connectionString: databaseUrl });
	const controlDb = drizzle({ client: controlPool, schema: controlPanelSchema });

	let tenantPool: Pool | null = null;

	try {
		// 1. Resolve org
		const org = await controlDb.query.organizations.findFirst({
			where: (orgs, { eq }) => eq(orgs.id, orgId),
		});
		if (!org) throw new Error(`Organization not found: ${orgId}`);

		console.log("\n📋 Organization");
		console.log(`   id:   ${org.id}`);
		console.log(`   name: ${org.name}`);
		console.log(`   slug: ${org.slug}`);

		// 2. Resolve user (control-panel)
		const user = await controlDb.query.users.findFirst({
			where: (u, { eq }) => eq(u.id, userId),
		});
		console.log("\n👤 User (control-panel)");
		if (user) {
			console.log(`   id:    ${user.id}`);
			console.log(`   email: ${user.email}`);
			console.log(`   name:  ${user.name}`);
		} else {
			console.log(`   ❌ Not found in control-panel.users for id ${userId}`);
		}

		// 3. Resolve tenant connection + branch
		const tenantConn = decrypt(org.connectionString);
		tenantPool = new Pool({ connectionString: tenantConn });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		const branch = await tenantDb.query.hierarchyNodes.findFirst({
			where: (n, { eq }) => eq(n.id, branchId),
		});
		console.log("\n🏢 Branch (tenant.hierarchy_nodes)");
		if (branch) {
			console.log(`   id:       ${branch.id}`);
			console.log(`   name:     ${branch.name}`);
			console.log(`   type:     ${branch.type}`);
			console.log(`   depth:    ${branch.depth}`);
			console.log(`   parentId: ${branch.parentId ?? "—"}`);
		} else {
			console.log(`   ❌ Not found in tenant.hierarchy_nodes for id ${branchId}`);
		}

		// 4. Show the user's tenant member record (if any)
		const member = await tenantDb.query.members.findFirst({
			where: (m, { eq }) => eq(m.userId, userId),
		});
		console.log("\n🧑‍💼 Member (tenant.members)");
		if (member) {
			console.log(`   id:                ${member.id}`);
			console.log(`   role:              ${member.role}`);
			console.log(`   hierarchyScopeId:  ${member.hierarchyScopeId}`);
			if (member.hierarchyScopeId === branchId) {
				console.log("   ✓ Member's scope matches the booking branch");
			} else {
				console.log(
					`   ⚠ Member scope differs from booking branch (${branchId})`,
				);
			}
		} else {
			console.log(`   (no tenant member record for userId ${userId})`);
		}
	} finally {
		if (tenantPool) await tenantPool.end();
		await controlPool.end();
	}
}

main().catch((err) => {
	console.error("❌ Failed:", err);
	process.exit(1);
});
