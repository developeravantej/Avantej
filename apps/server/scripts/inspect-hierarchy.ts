/**
 * Raw inspect of hierarchy_nodes columns + branches for Test Fitness Franchise tenant.
 * Bypasses Drizzle to dodge column-mismatch errors during diagnosis.
 *
 * Usage: cd apps/server && bun run scripts/inspect-hierarchy.ts
 */
import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const m = trimmed.match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
				process.env[m[1]] = m[2];
			}
		}
	} catch (e) {
		console.warn("Could not load .dev.vars:", e);
	}
}

async function main() {
	loadDevVars();
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL required");

	const cp = drizzle({
		client: new Pool({ connectionString: databaseUrl }),
		schema: controlPanelSchema,
	});

	const org = await cp.query.organizations.findFirst({
		where: (o, { eq }) => eq(o.slug, "test-fitness-franchise"),
	});
	if (!org) throw new Error("test-fitness-franchise org not found");
	console.log(`org: ${org.name} (${org.id})`);

	const tenantPool = new Pool({ connectionString: decrypt(org.connectionString) });
	const tenantDb = drizzle({ client: tenantPool });

	const cols = await tenantDb.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'hierarchy_nodes' ORDER BY ordinal_position
  `);
	console.log("\nhierarchy_nodes columns:");
	for (const r of cols.rows) console.log(`  - ${r.column_name}`);

	const branches = await tenantDb.execute(sql`
    SELECT id, name, type, depth, parent_id
    FROM hierarchy_nodes
    WHERE type = 'branch'
    ORDER BY name
  `);
	console.log(`\nbranches (type='branch'): ${branches.rows.length}`);
	for (const r of branches.rows) {
		console.log(`  - ${r.id} | name=${r.name} | depth=${r.depth} | parent_id=${r.parent_id}`);
	}

	const types = await tenantDb.execute(sql`
    SELECT type, COUNT(*)::int AS count FROM hierarchy_nodes GROUP BY type ORDER BY type
  `);
	console.log("\ntype counts:");
	for (const r of types.rows) console.log(`  - ${r.type}: ${r.count}`);

	const members = await tenantDb.execute(sql`
    SELECT id, user_id, role, hierarchy_scope_id FROM members
  `);
	console.log(`\nmembers: ${members.rows.length}`);
	for (const r of members.rows) {
		console.log(`  - ${r.id} | role=${r.role} | scope=${r.hierarchy_scope_id}`);
	}

	// Smoke test: run the same SQL listAll uses
	console.log("\n--- listAll SQL smoke ---");
	const listAllRows = await tenantDb.execute(sql`
		SELECT id, name FROM hierarchy_nodes WHERE type = 'branch' ORDER BY name ASC
	`);
	console.log(`listAll branches: ${listAllRows.rows.length}`);
	for (const r of listAllRows.rows) {
		console.log(`  - ${r.id} | ${r.name}`);
	}

	await tenantPool.end();
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
