/**
 * Test each migration 0026 statement individually.
 * Run: cd apps/server && bun run scripts/test-migration-sql.ts
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

const STATEMENTS = [
	{ name: "btree_gist extension", sql: "CREATE EXTENSION IF NOT EXISTS btree_gist" },
	{
		name: "trainer exclusion constraint",
		sql: `ALTER TABLE appointments ADD CONSTRAINT appointments_trainer_no_overlap
  EXCLUDE USING GIST (
    trainer_id WITH =,
    tsrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no-show') AND trainer_id IS NOT NULL)`
	},
	{
		name: "check_ins unique index",
		sql: `CREATE UNIQUE INDEX IF NOT EXISTS check_ins_client_day_uniq
  ON check_ins (client_id, (checked_in_at::date))
  WHERE appointment_client_id IS NULL`
	},
	{ name: "sales_order sequence", sql: "CREATE SEQUENCE IF NOT EXISTS tenant_sales_order_seq START 1 INCREMENT 1" },
	{ name: "payment sequence", sql: "CREATE SEQUENCE IF NOT EXISTS tenant_payment_seq START 1 INCREMENT 1" },
	{ name: "invoice sequence", sql: "CREATE SEQUENCE IF NOT EXISTS tenant_invoice_seq START 1 INCREMENT 1" },
];

async function main() {
	loadEnv();
	const controlPool = new Pool({ connectionString: process.env.DATABASE_URL! });
	const { rows: orgs } = await controlPool.query(
		`SELECT connection_string FROM organizations WHERE payment_status = 'active' LIMIT 1`
	);
	await controlPool.end();

	const connStr = decrypt(orgs[0]!.connection_string);
	const pool = new Pool({ connectionString: connStr });

	for (const { name, sql } of STATEMENTS) {
		try {
			await pool.query(sql);
			console.log(`✓ ${name}`);
		} catch (e: any) {
			console.log(`✗ ${name}: ${e.message} (code: ${e.code})`);
		}
	}
	await pool.end();
}

main().catch(console.error);
