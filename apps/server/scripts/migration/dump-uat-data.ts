/**
 * Dump, per UAT section, the schema + a live data sample of the tables that back
 * it — so the UAT review page can show "schema + real values" beside each video.
 * Output → _e2e/uat-data.json.
 *
 *   cd apps/server && bun run scripts/migration/dump-uat-data.ts [--org <slug>]
 */
import { loadDevVars } from "./lib/env";
import { connectTenant } from "./lib/db";
import { sql } from "drizzle-orm";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../../../_e2e/uat-data.json");

// UAT section → backing tables (with the columns worth showing).
const MAP: {
	section: number;
	label: string;
	tables: { table: string; cols: string; order?: string }[];
}[] = [
	{
		section: 8,
		label: "Organizational structure",
		tables: [
			{
				table: "hierarchy_nodes",
				cols: "id, name, type, depth, parent_id",
				order: "depth, name",
			},
			{ table: "branch_details", cols: "node_id, address, pic_user_id" },
		],
	},
	{
		section: 9,
		label: "User access control",
		tables: [
			{
				table: "members",
				cols: "id, user_id, role, status, hierarchy_scope_id",
				order: "role",
			},
			{ table: "roles", cols: "id, name, priority, is_system" },
		],
	},
	{
		section: 11,
		label: "Services & packages",
		tables: [
			{
				table: "services",
				cols: "id, name, type, price, session_count, expiry_days, is_active",
				order: "name",
			},
			{ table: "service_categories", cols: "id, name" },
			{
				table: "package_instances",
				cols: "id, status, credits_total, credits_used, credits_remaining",
				order: "created_at desc",
			},
		],
	},
	{
		section: 3,
		label: "Client portal / customers",
		tables: [
			{
				table: "customer_profiles",
				cols: "id, user_id, phone, gender, is_unclaimed, primary_staff_member_id",
				order: "created_at desc",
			},
		],
	},
	{
		section: 5,
		label: "Session booking",
		tables: [
			{
				table: "appointments",
				cols: "id, type, status, start_time, duration, branch_id, package_instance_id, credits_used",
				order: "start_time desc",
			},
		],
	},
	{
		section: 7,
		label: "Payment & finance",
		tables: [{ table: "invoices", cols: "*", order: "created_at desc" }],
	},
	{
		section: 12,
		label: "Commission & incentive",
		tables: [
			{ table: "commission_splits", cols: "*", order: "created_at desc" },
		],
	},
];

const SAMPLE = 6;

async function tableExists(db: any, t: string): Promise<boolean> {
	const r = await db.execute(sql`SELECT to_regclass(${`public.${t}`}) AS reg`);
	return r.rows[0]?.reg != null;
}

async function main() {
	loadDevVars();
	const i = process.argv.indexOf("--org");
	const orgSlug = (i >= 0 && process.argv[i + 1]) || "test-fitness-franchise";
	const conn = await connectTenant(orgSlug);
	const db = conn.tenantDb;

	const out: Record<string, unknown> = { org: orgSlug, sections: {} };
	const sections: Record<string, unknown> = {};

	for (const sec of MAP) {
		const tables = [];
		for (const t of sec.tables) {
			if (!(await tableExists(db, t.table))) {
				tables.push({
					table: t.table,
					missing: true,
					schema: [],
					rows: [],
					total: 0,
				});
				continue;
			}
			const schemaRes = await db.execute(sql`
				SELECT column_name, data_type FROM information_schema.columns
				WHERE table_name = ${t.table} ORDER BY ordinal_position
			`);
			const orderSql = t.order ? sql.raw(`ORDER BY ${t.order}`) : sql``;
			const rowsRes = await db.execute(
				sql`SELECT ${sql.raw(t.cols)} FROM ${sql.raw(t.table)} ${orderSql} LIMIT ${SAMPLE}`,
			);
			const totalRes = await db.execute(
				sql`SELECT COUNT(*)::int AS n FROM ${sql.raw(t.table)}`,
			);
			tables.push({
				table: t.table,
				schema: schemaRes.rows.map((c: any) => ({
					column: c.column_name,
					type: c.data_type,
				})),
				rows: rowsRes.rows,
				total: totalRes.rows[0]?.n ?? 0,
			});
		}
		sections[String(sec.section)] = { label: sec.label, tables };
	}
	out.sections = sections;

	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(OUT, JSON.stringify(out, null, 2));
	console.log(`Wrote ${OUT}`);
	for (const [n, s] of Object.entries(sections)) {
		const ts = (s as any).tables
			.map((t: any) => `${t.table}(${t.missing ? "MISSING" : t.total})`)
			.join(", ");
		console.log(`  §${n}: ${ts}`);
	}
	await conn.close();
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
