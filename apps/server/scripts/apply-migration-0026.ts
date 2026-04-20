/**
 * Apply migration 0026_pipeline_audit to the dev tenant.
 * Run: cd apps/server && bun run scripts/apply-migration-0026.ts
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "crypto";
import { runTenantMigrations } from "@avantej-core/db/migrate-tenant";

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
	} catch {
		console.warn("[apply-migration] .dev.vars not found, using process.env");
	}
}

function decrypt(encryptedText: string): string {
	const key = process.env.ENCRYPTION_KEY!;
	const secretKey = Buffer.from(key, "hex");
	const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
	const iv = Buffer.from(ivHex!, "hex");
	const authTag = Buffer.from(authTagHex!, "hex");
	const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey, iv);
	decipher.setAuthTag(authTag);
	let decrypted = decipher.update(encrypted!, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
}

async function main() {
	loadEnv();

	const controlDbUrl = process.env.DATABASE_URL!;
	const controlPool = new Pool({ connectionString: controlDbUrl });

	const { rows: orgs } = await controlPool.query(
		`SELECT id, name, connection_string FROM organizations WHERE payment_status = 'active' ORDER BY created_at`
	);
	console.log(`Found ${orgs.length} active tenant(s)\n`);

	for (const org of orgs) {
		const connStr = decrypt(org.connection_string);
		console.log(`Migrating: ${org.name} (${org.id})`);
		try {
			const version = await runTenantMigrations(connStr);
			console.log(`  ✓ Done — latest version: ${version}\n`);
		} catch (e) {
			console.error(`  ✗ Failed:`, e);
			process.exit(1);
		}
	}

	await controlPool.end();
	console.log("All tenants migrated successfully.");
}

main().catch((e) => {
	console.error("Migration failed:", e);
	process.exit(1);
});
