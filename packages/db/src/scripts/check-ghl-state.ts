/**
 * Read-only audit of GHL state across all tenants.
 * Reports: ghl_sync_model + location id + branch_links count + per-tenant
 * ghl_contact_links + ghl_user_links counts.
 *
 * Used to scope the per-branch → org-shared migration plan per tenant.
 */
import { Pool } from "@neondatabase/serverless";
import { decrypt } from "../lib/encryption";

const cp = new Pool({ connectionString: process.env.DATABASE_URL });
const orgs = await cp.query(
	`SELECT id, name, connection_string, ghl_sync_model, ghl_location_id,
	        ghl_provisioned_at
	 FROM organizations ORDER BY name`,
);

console.log("\n=== Control panel: GHL config per org ===\n");
console.log(
	`${"Org".padEnd(35)} model       location    provisioned`,
);
console.log("-".repeat(80));
for (const o of orgs.rows) {
	const model = (o.ghl_sync_model ?? "null").padEnd(11);
	const loc = (o.ghl_location_id ?? "—").padEnd(11);
	const prov = o.ghl_provisioned_at ?? "—";
	console.log(`${o.name.padEnd(35)} ${model} ${loc} ${prov}`);
}

console.log(
	"\n=== Per-tenant link counts (ghl_branch_links / ghl_contact_links / ghl_user_links) ===\n",
);
console.log(
	`${"Org".padEnd(35)} branch_links  contact_links  user_links`,
);
console.log("-".repeat(80));
for (const o of orgs.rows) {
	let conn: string;
	try {
		conn = decrypt(o.connection_string);
	} catch {
		conn = o.connection_string;
	}
	const cpLinks = await cp.query(
		"SELECT count(*)::int AS n, COALESCE(count(*) FILTER (WHERE is_active), 0)::int AS active FROM ghl_branch_links WHERE organization_id = $1",
		[o.id],
	);
	const tp = new Pool({ connectionString: conn });
	try {
		const c = await tp.query(
			"SELECT count(*)::int AS n FROM ghl_contact_links",
		);
		const u = await tp.query(
			"SELECT count(*)::int AS n FROM ghl_user_links",
		);
		console.log(
			`${o.name.padEnd(35)} ${`${cpLinks.rows[0].n} (${cpLinks.rows[0].active} act)`.padEnd(13)} ${String(c.rows[0].n).padEnd(14)} ${u.rows[0].n}`,
		);
	} catch (e) {
		console.log(
			`${o.name.padEnd(35)} ERROR: ${e instanceof Error ? e.message : e}`,
		);
	} finally {
		await tp.end();
	}
}
await cp.end();
