/**
 * Check current state of the tenant DB constraints/indexes/sequences.
 * Run: cd apps/server && bun run scripts/check-db-state.ts
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
	const controlPool = new Pool({ connectionString: process.env.DATABASE_URL! });
	const { rows: orgs } = await controlPool.query(
		`SELECT connection_string FROM organizations WHERE payment_status = 'active' LIMIT 1`
	);
	await controlPool.end();

	const connStr = decrypt(orgs[0]!.connection_string);
	const pool = new Pool({ connectionString: connStr });

	// Check constraints on appointments
	const { rows: constraints } = await pool.query(`
		SELECT conname, contype FROM pg_constraint
		WHERE conrelid = 'appointments'::regclass
		  AND conname LIKE '%trainer%'
	`);
	console.log("Trainer constraints:", constraints);

	// Check sequences
	const { rows: seqs } = await pool.query(`
		SELECT sequence_name FROM information_schema.sequences
		WHERE sequence_name IN ('tenant_sales_order_seq', 'tenant_payment_seq', 'tenant_invoice_seq')
	`);
	console.log("Sequences:", seqs);

	// Check btree_gist extension
	const { rows: exts } = await pool.query(`
		SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
	`);
	console.log("btree_gist extension:", exts);

	// Check applied migrations
	const { rows: migrations } = await pool.query(`
		SELECT hash FROM drizzle_migrations ORDER BY id DESC LIMIT 5
	`);
	console.log("Last 5 migrations:", migrations.map(r => r.hash));

	await pool.end();
}

main().catch(console.error);
