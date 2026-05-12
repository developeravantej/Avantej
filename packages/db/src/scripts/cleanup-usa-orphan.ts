/**
 * One-off cleanup: delete the orphan USA → West Coast chain from
 * Test Fitness Franchise tenant. West Coast state has no branch child;
 * USA country has only this empty state. Test seed leftover.
 */
import { Pool } from "@neondatabase/serverless";
import { decrypt } from "../lib/encryption";

const cp = new Pool({ connectionString: process.env.DATABASE_URL });
const orgRes = await cp.query(
	"SELECT connection_string FROM organizations WHERE name = 'Test Fitness Franchise'",
);
await cp.end();
let conn: string;
try {
	conn = decrypt(orgRes.rows[0].connection_string);
} catch {
	conn = orgRes.rows[0].connection_string;
}

const t = new Pool({ connectionString: conn });
const before = await t.query(
	"SELECT id, name, type, parent_id FROM hierarchy_nodes WHERE name IN ('USA', 'West Coast')",
);
console.log("Before delete:");
for (const r of before.rows) {
	console.log(
		`  ${r.type} ${r.name} ${r.id.slice(0, 8)} parent=${r.parent_id?.slice(0, 8) ?? "NULL"}`,
	);
}

await t.query("BEGIN");
const stateDel = await t.query(
	"DELETE FROM hierarchy_nodes WHERE name = 'West Coast' AND type = 'state'",
);
const countryDel = await t.query(
	"DELETE FROM hierarchy_nodes WHERE name = 'USA' AND type = 'country'",
);
await t.query("COMMIT");
console.log(
	`\nDeleted state rows: ${stateDel.rowCount}, country rows: ${countryDel.rowCount}`,
);

const after = await t.query("SELECT count(*)::int AS n FROM hierarchy_nodes");
console.log(`Total hierarchy_nodes rows now: ${after.rows[0].n}`);
await t.end();
