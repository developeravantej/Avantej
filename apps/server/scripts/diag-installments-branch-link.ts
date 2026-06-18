/**
 * Read-only diagnostic: count installments whose branch cannot be resolved
 * (neither installments.sales_order_id nor package_instances.sales_order_id set).
 * These silently drop out of the Sales → Installments tab when a branch filter
 * is applied. Run: cd apps/server && bun run scripts/diag-installments-branch-link.ts
 */
import { decrypt } from "@avantej-core/db";
import { getControlPanelDb } from "../src/lib/db";
import { Pool } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(__dirname, "../.dev.vars"), "utf-8").split(
	"\n",
)) {
	const t = line.trim();
	if (!t || t.startsWith("#")) continue;
	const [k, ...v] = t.split("=");
	if (k && v.length)
		process.env[k.trim()] = v
			.join("=")
			.trim()
			.replace(/^["']|["']$/g, "");
}

const cp = getControlPanelDb();
const orgs = await cp.query.organizations.findMany();

for (const org of orgs) {
	let pool: Pool | null = null;
	try {
		pool = new Pool({ connectionString: decrypt(org.connectionString) });
		const { rows } = await pool.query(`
			SELECT
				COUNT(*)::int AS total_outstanding,
				COUNT(*) FILTER (
					WHERE i.sales_order_id IS NULL AND pi.sales_order_id IS NULL
				)::int AS unbranchable
			FROM installments i
			JOIN package_instances pi ON pi.id = i.package_instance_id
			WHERE i.status IN ('pending','overdue')
		`);
		const r = rows[0];
		// eslint-disable-next-line no-console
		console.log(
			`${org.slug}: ${r.total_outstanding} outstanding, ${r.unbranchable} unbranchable (no sales-order link)`,
		);
	} catch (e) {
		// eslint-disable-next-line no-console
		console.log(`${org.slug}: ERROR ${e instanceof Error ? e.message : e}`);
	} finally {
		await pool?.end();
	}
}
process.exit(0);
