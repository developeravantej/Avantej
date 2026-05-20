/**
 * DB integrity audit for Batch 1 pages (Dashboard Home / Access Control / Appointments)
 * Run: cd apps/server && bun run scripts/audit-db-batch1.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "crypto";

neonConfig.webSocketConstructor = ws;

function loadEnv() {
	const path = join(import.meta.dir, "../../../.dev.vars");
	try {
		const lines = readFileSync(path, "utf-8").split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eq = trimmed.indexOf("=");
			if (eq === -1) continue;
			const k = trimmed.slice(0, eq).trim();
			const v = trimmed.slice(eq + 1).trim();
			if (!process.env[k]) process.env[k] = v;
		}
	} catch { /* ignore */ }
}

function decrypt(encryptedText: string): string {
	const key = process.env.ENCRYPTION_KEY!;
	const secretKey = Buffer.from(key, "hex");
	const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
	const iv = Buffer.from(ivHex!, "hex");
	const authTag = Buffer.from(authTagHex!, "hex");
	const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey, iv);
	decipher.setAuthTag(authTag);
	let d = decipher.update(encrypted!, "hex", "utf8");
	d += decipher.final("utf8");
	return d;
}

async function main() {
	loadEnv();

	// Get tenant DB connection string from control panel
	const controlPool = new Pool({ connectionString: process.env.DATABASE_URL! });
	const { rows: orgs } = await controlPool.query(
		`SELECT connection_string FROM organizations WHERE id = '996febce-aaad-4ded-8f47-02d2b566c8ee'`
	);
	await controlPool.end();

	if (!orgs[0]) {
		console.error("Org not found");
		process.exit(1);
	}

	const connStr = decrypt(orgs[0]!.connection_string);
	const pool = new Pool({ connectionString: connStr });

	const q = async (sql: string) => {
		const { rows } = await pool.query(sql);
		return rows;
	};

	const results: Record<string, any> = {};

	// ---- Identity #1: members.role_id backfill ----
	results.members_total = (await q(`SELECT COUNT(*)::int AS c FROM members`))[0]?.c;
	results.members_role_id_column_exists = (await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.columns
		WHERE table_name = 'members' AND column_name = 'role_id'
	`))[0]?.c;

	if (results.members_role_id_column_exists > 0) {
		results.members_role_id_set = (await q(`SELECT COUNT(*)::int AS c FROM members WHERE role_id IS NOT NULL`))[0]?.c;
		results.members_role_id_null = (await q(`SELECT COUNT(*)::int AS c FROM members WHERE role_id IS NULL`))[0]?.c;
	} else {
		results.members_role_id_set = "N/A — column does not exist";
		results.members_role_id_null = "N/A — column does not exist";
	}

	results.roles_count = (await q(`SELECT COUNT(*)::int AS c FROM roles`))[0]?.c;

	// ---- Appointments #3: appointment_status_history ----
	results.appointments_total = (await q(`SELECT COUNT(*)::int AS c FROM appointments`))[0]?.c;

	const historyTableExists = (await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name = 'appointment_status_history'
	`))[0]?.c;
	results.appointment_status_history_table_exists = historyTableExists > 0;

	if (historyTableExists > 0) {
		results.appointment_status_history_rows = (await q(`SELECT COUNT(*)::int AS c FROM appointment_status_history`))[0]?.c;
	} else {
		results.appointment_status_history_rows = "N/A — table does not exist";
	}

	// ---- Appointments #7: EXCLUDE constraint on appointments ----
	const excludeConstraints = await q(`
		SELECT conname, contype
		FROM pg_constraint
		WHERE contype = 'x' AND conrelid = 'appointments'::regclass
	`).catch(() => []);
	results.appt_exclude_constraints = excludeConstraints.map((r: any) => r.conname);

	// Also check btree_gist (needed for tstzrange EXCLUDE)
	const btreeGist = await q(`SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`);
	results.btree_gist_installed = btreeGist.length > 0;

	// ---- Additional context ----
	results.class_slots_total = (await q(`SELECT COUNT(*)::int AS c FROM class_slots`))[0]?.c;
	results.hierarchy_nodes_total = (await q(`SELECT COUNT(*)::int AS c FROM hierarchy_nodes`))[0]?.c;
	results.invitations_total = (await q(`SELECT COUNT(*)::int AS c FROM invitations`))[0]?.c;
	results.role_permissions_total = (await q(`SELECT COUNT(*)::int AS c FROM role_permissions`))[0]?.c;

	// Sample roles for context
	const rolesData = await q(`SELECT id, name, is_system FROM roles ORDER BY is_system DESC, name LIMIT 10`);
	results.roles_sample = rolesData.map((r: any) => ({ id: r.id, name: r.name, is_system: r.is_system }));

	console.log(JSON.stringify(results, null, 2));
	await pool.end();
}

main().catch(console.error);
