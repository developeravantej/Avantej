/**
 * DB Integrity Audit Script — Batch 2
 * Checks schema integrity for attendance/audit/services/customers/trainers/branch pages.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/audit-db-batch2.ts
 */

import { decrypt } from "@avantej-core/db";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import ws from "ws";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDevVars(): void {
	try {
		const { readFileSync } = require("fs");
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined) {
				if (!process.env[match[1]]) {
					process.env[match[1]] = match[2];
				}
			}
		}
	} catch {
		// .dev.vars not present — rely on process.env
	}
}

async function main() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const cpPool = new Pool({ connectionString: databaseUrl });
	const cpDb = drizzle({ client: cpPool, schema: controlPanelSchema });

	const [org] = await cpDb
		.select({ connectionString: organizations.connectionString })
		.from(organizations)
		.where(eq(organizations.id, "996febce-aaad-4ded-8f47-02d2b566c8ee"));

	await cpPool.end();

	if (!org) throw new Error("Test organization not found");

	const pool = new Pool({ connectionString: decrypt(org.connectionString) });
	const q = (sql: string) => pool.query(sql).then((r) => r.rows);

	const results: Record<string, unknown> = {};

	// Agent 3.2 — lead_source_id on members
	const leadCol = await q(
		`SELECT column_name FROM information_schema.columns WHERE table_name='members' AND column_name='lead_source_id'`
	);
	results.members_lead_source_id_col_exists = leadCol.length > 0;

	// Check if lead_sources table exists before counting
	const leadSourcesTableExists = await q(
		`SELECT table_name FROM information_schema.tables WHERE table_name='lead_sources' AND table_schema='public'`
	);
	if (leadSourcesTableExists.length > 0) {
		results.lead_sources_count = (await q(`SELECT COUNT(*) FROM lead_sources`))[0].count;
	} else {
		results.lead_sources_count = "TABLE_MISSING";
	}

	if (leadCol.length > 0) {
		results.members_with_lead_source = (
			await q(`SELECT COUNT(*) FROM members WHERE lead_source_id IS NOT NULL`)
		)[0].count;
	}

	// Agent 3.5 — walk_in_customers conversion cols
	const wcTableExists = await q(
		`SELECT table_name FROM information_schema.tables WHERE table_name='walk_in_customers' AND table_schema='public'`
	);
	if (wcTableExists.length > 0) {
		const wcCols = await q(
			`SELECT column_name FROM information_schema.columns WHERE table_name='walk_in_customers' AND column_name IN ('customer_profile_id','converted_at')`
		);
		results.walk_in_conversion_cols = wcCols.map((r: Record<string, unknown>) => r.column_name);
		results.walk_in_customers_count = (await q(`SELECT COUNT(*) FROM walk_in_customers`))[0].count;
	} else {
		results.walk_in_conversion_cols = "TABLE_MISSING";
		results.walk_in_customers_count = "TABLE_MISSING";
	}

	// Agent 3.6 — household_id on members
	const hhCol = await q(
		`SELECT column_name FROM information_schema.columns WHERE table_name='members' AND column_name='household_id'`
	);
	results.members_household_id_col_exists = hhCol.length > 0;

	const householdsTableExists = await q(
		`SELECT table_name FROM information_schema.tables WHERE table_name='households' AND table_schema='public'`
	);
	if (householdsTableExists.length > 0) {
		results.households_count = (await q(`SELECT COUNT(*) FROM households`))[0].count;
	} else {
		results.households_count = "TABLE_MISSING";
	}

	// check_ins packageInstanceId FK
	const checkInsTableExists = await q(
		`SELECT table_name FROM information_schema.tables WHERE table_name='check_ins' AND table_schema='public'`
	);
	if (checkInsTableExists.length > 0) {
		const checkInFk = await q(
			`SELECT COUNT(*) FROM pg_constraint WHERE conrelid='check_ins'::regclass AND contype='f' AND conname LIKE '%package%'`
		);
		results.check_ins_package_fk = checkInFk[0].count;
		results.check_ins_count = (await q(`SELECT COUNT(*) FROM check_ins`))[0].count;

		// Also check if the column exists at all
		const checkInPackageCol = await q(
			`SELECT column_name FROM information_schema.columns WHERE table_name='check_ins' AND column_name LIKE '%package%'`
		);
		results.check_ins_package_columns = checkInPackageCol.map((r: Record<string, unknown>) => r.column_name);
	} else {
		results.check_ins_package_fk = "TABLE_MISSING";
		results.check_ins_count = "TABLE_MISSING";
		results.check_ins_package_columns = "TABLE_MISSING";
	}

	// customer_profiles count
	const cpTableExists = await q(
		`SELECT table_name FROM information_schema.tables WHERE table_name='customer_profiles' AND table_schema='public'`
	);
	results.customer_profiles = cpTableExists.length > 0
		? (await q(`SELECT COUNT(*) FROM customer_profiles`))[0].count
		: "TABLE_MISSING";

	// trainer_tiers
	const ttTableExists = await q(
		`SELECT table_name FROM information_schema.tables WHERE table_name='trainer_tiers' AND table_schema='public'`
	);
	results.trainer_tiers = ttTableExists.length > 0
		? (await q(`SELECT COUNT(*) FROM trainer_tiers`))[0].count
		: "TABLE_MISSING";

	// trainer_availability
	const taTableExists = await q(
		`SELECT table_name FROM information_schema.tables WHERE table_name='trainer_availability' AND table_schema='public'`
	);
	results.trainer_availability = taTableExists.length > 0
		? (await q(`SELECT COUNT(*) FROM trainer_availability`))[0].count
		: "TABLE_MISSING";

	// hierarchy nodes by type
	const nodeTypes = await q(
		`SELECT type, COUNT(*) FROM hierarchy_nodes GROUP BY type`
	);
	results.hierarchy_by_type = nodeTypes;

	// member_profiles
	const mpTableExists = await q(
		`SELECT table_name FROM information_schema.tables WHERE table_name='member_profiles' AND table_schema='public'`
	);
	results.member_profiles = mpTableExists.length > 0
		? (await q(`SELECT COUNT(*) FROM member_profiles`))[0].count
		: "TABLE_MISSING";

	// Identity #4 — members.invitationId column check
	const invitationIdCol = await q(
		`SELECT column_name FROM information_schema.columns WHERE table_name='members' AND column_name IN ('invitation_id','invitationId')`
	);
	results.members_invitation_id_col = invitationIdCol.map((r: Record<string, unknown>) => r.column_name);

	// members total count
	results.members_count = (await q(`SELECT COUNT(*) FROM members`))[0].count;

	console.log(JSON.stringify(results, null, 2));
	await pool.end();
}

if (import.meta.main) {
	main()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
