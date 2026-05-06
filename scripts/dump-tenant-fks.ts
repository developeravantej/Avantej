// Dump tenant DB FKs by decrypting first org's connection string from control panel
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { decrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import * as dotenv from "dotenv";
import { writeFileSync } from "fs";
import { resolve } from "path";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = ws;

dotenv.config({ path: resolve(__dirname, "../apps/server/.env") });

const cpUrl = process.env.DATABASE_URL;
if (!cpUrl) throw new Error("DATABASE_URL not set");

const FK_QUERY = `
SELECT
  tc.table_name AS child_table,
  kcu.column_name AS child_col,
  ccu.table_name AS parent_table,
  ccu.column_name AS parent_col,
  rc.delete_rule AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY child_table, child_col;
`;

const TABLE_QUERY = `
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type='BASE TABLE'
ORDER BY table_name;
`;

async function main() {
	const cpPool = new Pool({ connectionString: cpUrl });
	const cpDb = drizzle({ client: cpPool, schema: { organizations } });

	const orgs = await cpDb.query.organizations.findMany({ limit: 5 });
	if (orgs.length === 0) throw new Error("No orgs in control panel");

	console.log(`Found ${orgs.length} orgs. Using first: ${orgs[0].name} (${orgs[0].id})`);

	const tenantUrl = decrypt(orgs[0].connectionString);
	const tenantPool = new Pool({ connectionString: tenantUrl });
	const tenantDb = drizzle({ client: tenantPool });

	const fksRes = await tenantDb.execute(FK_QUERY);
	const tablesRes = await tenantDb.execute(TABLE_QUERY);
	const fks = fksRes.rows as Array<{
		child_table: string;
		child_col: string;
		parent_table: string;
		parent_col: string;
		on_delete: string;
	}>;
	const tables = tablesRes.rows as Array<{ table_name: string }>;

	let out = `# Live Tenant DB FK Dump\n\nOrg: ${orgs[0].name} (${orgs[0].id})\nGenerated: ${new Date().toISOString()}\nTables: ${tables.length}\nFKs: ${fks.length}\n\n## Tables\n\n`;
	out += tables.map((t) => `- ${t.table_name}`).join("\n");
	out += `\n\n## Foreign Keys\n\n| Child | Col | → | Parent | Col | onDelete |\n|---|---|---|---|---|---|\n`;
	for (const f of fks) {
		out += `| ${f.child_table} | ${f.child_col} | → | ${f.parent_table} | ${f.parent_col} | ${f.on_delete} |\n`;
	}

	const outPath = resolve(__dirname, "../zhub/shared/schema-live-tenant-dump.md");
	writeFileSync(outPath, out);
	console.log(`Wrote ${tables.length} tables, ${fks.length} FKs → ${outPath}`);

	await cpPool.end();
	await tenantPool.end();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
