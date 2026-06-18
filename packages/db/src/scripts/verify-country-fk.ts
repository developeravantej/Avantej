/**
 * Verify country_node_id backfill across all tenants.
 * Reports any state/branch row with NULL country_node_id (= backfill miss).
 */
import { Pool } from "@neondatabase/serverless";
import { decrypt } from "../lib/encryption";

async function main() {
	const controlPanelUrl = process.env.DATABASE_URL;
	if (!controlPanelUrl) throw new Error("DATABASE_URL not set");

	const cpPool = new Pool({ connectionString: controlPanelUrl });
	const orgs = await cpPool.query(
		"SELECT id, name, connection_string FROM organizations ORDER BY name",
	);
	await cpPool.end();

	console.log(
		`\nVerifying country_node_id backfill across ${orgs.rows.length} tenants:\n`,
	);
	let totalMisses = 0;

	for (const org of orgs.rows) {
		let conn: string;
		try {
			conn = decrypt(org.connection_string);
		} catch {
			conn = org.connection_string;
		}
		const pool = new Pool({ connectionString: conn });
		try {
			const miss = await pool.query(
				`SELECT id, name, type FROM hierarchy_nodes
				 WHERE type IN ('state', 'branch') AND country_node_id IS NULL`,
			);
			if (miss.rows.length === 0) {
				console.log(`  ${org.name.padEnd(35)} ✅ clean`);
			} else {
				console.log(`  ${org.name.padEnd(35)} ⚠️ ${miss.rows.length} miss(es):`);
				for (const r of miss.rows) {
					console.log(`    [${r.type}] ${r.name} (${r.id.slice(0, 8)})`);
				}
				totalMisses += miss.rows.length;
			}
		} catch (err) {
			console.log(
				`  ${org.name.padEnd(35)} ERROR: ${err instanceof Error ? err.message : err}`,
			);
		} finally {
			await pool.end();
		}
	}

	console.log(
		`\n${totalMisses === 0 ? "✅" : "⚠️"} Total backfill misses: ${totalMisses}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
