/**
 * Dump, for each migrated module, the tenant-DB SCHEMA (column + type) and the
 * actual MIGRATED ROWS (resolved via mig_xwalk so we show only what this
 * migration created, not pre-existing dev data). Output → _e2e/migration-data.json
 * for the review page to render schema + data alongside each journey video.
 *
 *   cd apps/server && bun run scripts/migration/dump-migrated-data.ts [--org <slug>]
 */
import { loadDevVars } from "./lib/env";
import { connectTenant } from "./lib/db";
import { sql } from "drizzle-orm";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../../../_e2e/migration-data.json");

interface ModuleDump {
	module: string;
	table: string;
	sourceTable: string; // mig_xwalk source_table
	schema: { column: string; type: string }[];
	rows: Record<string, unknown>[];
	migratedCount: number;
}

async function schemaOf(tx: any, table: string) {
	const r = await tx.execute(sql`
		SELECT column_name, data_type FROM information_schema.columns
		WHERE table_name = ${table} ORDER BY ordinal_position
	`);
	return r.rows.map((c: any) => ({ column: c.column_name, type: c.data_type }));
}

async function main() {
	loadDevVars();
	const i = process.argv.indexOf("--org");
	const orgSlug = (i >= 0 && process.argv[i + 1]) || "test-fitness-franchise";
	const conn = await connectTenant(orgSlug);
	const db = conn.tenantDb;

	const modules: ModuleDump[] = [];

	// 1) branches (hierarchy_nodes via location crosswalk)
	modules.push({
		module: "Branches (hierarchy)",
		table: "hierarchy_nodes",
		sourceTable: "location",
		schema: await schemaOf(db, "hierarchy_nodes"),
		migratedCount: 0,
		rows: (
			await db.execute(sql`
			SELECT n.id, n.name, n.slug, n.type, n.depth, bd.address, bd.pic_user_id
			FROM hierarchy_nodes n
			JOIN mig_xwalk x ON x.target_id = n.id::text AND x.source_table = 'location'
			LEFT JOIN branch_details bd ON bd.node_id = n.id
			ORDER BY n.name
		`)
		).rows,
	});

	// 2) staff members (members via staff_member crosswalk) + user name
	modules.push({
		module: "Staff (members)",
		table: "members",
		sourceTable: "staff_member",
		schema: await schemaOf(db, "members"),
		migratedCount: 0,
		rows: (
			await db.execute(sql`
			SELECT m.id, m.user_id, m.role, m.status, m.hierarchy_scope_id, x.source_id AS legacy_id
			FROM members m
			JOIN mig_xwalk x ON x.target_id = m.id::text AND x.source_table = 'staff_member'
			ORDER BY x.source_id
		`)
		).rows,
	});

	// 3) services (via product crosswalk)
	modules.push({
		module: "Services (PT packages)",
		table: "services",
		sourceTable: "product",
		schema: await schemaOf(db, "services"),
		migratedCount: 0,
		rows: (
			await db.execute(sql`
			SELECT s.id, s.name, s.type, s.price, s.session_count, s.expiry_days, s.is_active, x.source_id AS legacy_id
			FROM services s
			JOIN mig_xwalk x ON x.target_id = s.id::text AND x.source_table = 'product'
			ORDER BY s.name
		`)
		).rows,
	});

	// 4) customer_profiles (via client crosswalk → user_id)
	modules.push({
		module: "Customers (profiles)",
		table: "customer_profiles",
		sourceTable: "client",
		schema: await schemaOf(db, "customer_profiles"),
		migratedCount: 0,
		rows: (
			await db.execute(sql`
			SELECT cp.id, cp.user_id, cp.phone, cp.gender, cp.is_unclaimed, cp.primary_staff_member_id, x.source_id AS legacy_id
			FROM customer_profiles cp
			JOIN mig_xwalk x ON x.target_id = cp.user_id AND x.source_table = 'client'
			ORDER BY x.source_id
		`)
		).rows,
	});

	// 5) appointments (via appointment crosswalk)
	modules.push({
		module: "Appointments",
		table: "appointments",
		sourceTable: "appointment",
		schema: await schemaOf(db, "appointments"),
		migratedCount: 0,
		rows: (
			await db.execute(sql`
			SELECT a.id, a.type, a.status, a.start_time, a.duration, a.branch_id, a.trainer_id, a.user_id, x.source_id AS legacy_id
			FROM appointments a
			JOIN mig_xwalk x ON x.target_id = a.id::text AND x.source_table = 'appointment'
			ORDER BY a.start_time
		`)
		).rows,
	});

	// Enrich staff + customer rows with name/email from the control-panel user
	// table (cross-DB) so the data tables are recognizable, not bare uuids.
	const userIds = new Set<string>();
	for (const m of modules) {
		if (m.sourceTable === "staff_member" || m.sourceTable === "client") {
			for (const r of m.rows)
				if (typeof r.user_id === "string") userIds.add(r.user_id);
		}
	}
	if (userIds.size > 0) {
		const u = await conn.controlDb.execute(sql`
			SELECT id, name, email FROM "user" WHERE id = ANY(${sql.raw(`ARRAY[${[...userIds].map((id) => `'${id}'`).join(",")}]`)})
		`);
		const nameById = new Map(
			u.rows.map((r: any) => [r.id, { name: r.name, email: r.email }]),
		);
		for (const m of modules) {
			if (m.sourceTable !== "staff_member" && m.sourceTable !== "client")
				continue;
			m.rows = m.rows.map((r) => {
				const info =
					typeof r.user_id === "string" ? nameById.get(r.user_id) : null;
				return {
					legacy_id: r.legacy_id,
					name: info?.name ?? null,
					email: info?.email ?? null,
					...r,
				};
			});
		}
	}

	for (const m of modules) m.migratedCount = m.rows.length;

	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(
		OUT,
		JSON.stringify(
			{ org: orgSlug, generatedFor: "migration-review", modules },
			null,
			2,
		),
	);
	console.log(`Wrote ${OUT}`);
	for (const m of modules)
		console.log(
			`  ${m.module}: ${m.migratedCount} migrated rows, ${m.schema.length} schema cols`,
		);
	await conn.close();
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
