/**
 * One-shot read-only: dump hierarchy_nodes tree for a single tenant by name.
 * Usage: bun run dump-hierarchy.ts "Test Fitness Franchise"
 */
import { Pool } from "@neondatabase/serverless";
import { decrypt } from "../lib/encryption";

interface Row {
	id: string;
	name: string;
	type: string;
	parent_id: string | null;
	depth: number;
}

async function main() {
	const tenantName = process.argv[2];
	if (!tenantName) {
		console.error('Usage: bun run dump-hierarchy.ts "<tenant name>"');
		process.exit(1);
	}

	const controlPanelUrl = process.env.DATABASE_URL;
	if (!controlPanelUrl) throw new Error("DATABASE_URL not set");

	const cpPool = new Pool({ connectionString: controlPanelUrl });
	const orgRes = await cpPool.query(
		"SELECT name, connection_string FROM organizations WHERE name = $1",
		[tenantName],
	);
	await cpPool.end();
	if (orgRes.rows.length === 0) {
		console.error(`Tenant not found: ${tenantName}`);
		process.exit(1);
	}
	const encryptedConn = orgRes.rows[0].connection_string as string;
	let conn: string;
	try {
		conn = decrypt(encryptedConn);
	} catch {
		conn = encryptedConn;
	}

	const tenantPool = new Pool({ connectionString: conn });
	const res = await tenantPool.query(
		"SELECT id, name, type, parent_id, depth FROM hierarchy_nodes ORDER BY depth ASC, name ASC",
	);
	await tenantPool.end();

	const rows = res.rows as Row[];
	const byParent = new Map<string | null, Row[]>();
	for (const r of rows) {
		const k = r.parent_id;
		if (!byParent.has(k)) byParent.set(k, []);
		byParent.get(k)!.push(r);
	}

	function render(parentId: string | null, indent: number) {
		const kids = byParent.get(parentId) ?? [];
		for (const k of kids) {
			const pad = "  ".repeat(indent);
			console.log(
				`${pad}[${k.type}/d${k.depth}] ${k.name}  (id=${k.id.slice(0, 8)})`,
			);
			render(k.id, indent + 1);
		}
	}

	console.log(`\nTenant: ${tenantName}\n`);
	console.log(`Total rows: ${rows.length}\n`);
	render(null, 0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
