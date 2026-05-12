// Dump live DB FK list via information_schema, compare vs schema-erd.md
// Run: bun scripts/dump-fks.ts
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../apps/server/.env") });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const sql = neon(url);

const FK_QUERY = `
SELECT
  tc.table_name AS child_table,
  kcu.column_name AS child_col,
  ccu.table_name AS parent_table,
  ccu.column_name AS parent_col,
  rc.delete_rule AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
 AND tc.table_schema = ccu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
 AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY child_table, child_col;
`;

const TABLE_QUERY = `
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type='BASE TABLE'
ORDER BY table_name;
`;

async function main() {
	const fks = (await sql.query(FK_QUERY)) as Array<{
		child_table: string;
		child_col: string;
		parent_table: string;
		parent_col: string;
		on_delete: string;
	}>;
	const tables = (await sql.query(TABLE_QUERY)) as Array<{ table_name: string }>;

	let out = `# Live DB FK Dump\n\nGenerated: ${new Date().toISOString()}\nDB: control-panel (combined w/ tenant in dev)\nTables: ${tables.length}\nFKs: ${fks.length}\n\n## Tables\n\n`;
	out += tables.map((t) => `- ${t.table_name}`).join("\n");
	out += `\n\n## Foreign Keys\n\n| Child | Col | → | Parent | Col | onDelete |\n|---|---|---|---|---|---|\n`;
	for (const f of fks) {
		out += `| ${f.child_table} | ${f.child_col} | → | ${f.parent_table} | ${f.parent_col} | ${f.on_delete} |\n`;
	}

	const outPath = resolve(__dirname, "../zhub/shared/schema-live-dump.md");
	writeFileSync(outPath, out);
	console.log(`Wrote ${tables.length} tables, ${fks.length} FKs → ${outPath}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
