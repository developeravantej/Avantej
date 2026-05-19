#!/usr/bin/env bun
/**
 * One-shot backfill: insert a synthetic initial payment_status_history row
 * for every payment that has no history yet.
 *
 * The inserted row uses:
 *   from_status = NULL  (no prior state)
 *   to_status   = payments.status  (current status at backfill time)
 *   changed_at  = payments.updated_at
 *   changed_by  = 'system'
 *
 * Safe to re-run — the WHERE NOT EXISTS clause is idempotent.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/backfill-payment-status-history.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined) {
				const key = match[1];
				const value = match[2];
				if (!process.env[key]) {
					process.env[key] = value;
				}
			}
		}
	} catch (error) {
		console.warn("Could not load .dev.vars file:", error);
	}
}

async function backfillPaymentStatusHistory() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL required");

	const controlPanelPool = new Pool({ connectionString: databaseUrl });
	const controlPanelDb = drizzle({
		client: controlPanelPool,
		schema: controlPanelSchema,
	});

	const org = await controlPanelDb.query.organizations.findFirst({
		where: eq(controlPanelSchema.organizations.id, TARGET_ORG_ID),
	});

	if (!org) {
		throw new Error(`Organization ${TARGET_ORG_ID} not found in control panel DB`);
	}

	console.log(`Processing: ${org.name} (${org.id})`);

	let tenantConnectionString: string;
	try {
		tenantConnectionString = decrypt(org.connectionString);
	} catch {
		throw new Error(`Failed to decrypt connection string for org ${org.id}`);
	}

	const tenantPool = new Pool({ connectionString: tenantConnectionString });
	const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

	try {
		const result = await tenantDb.execute(sql`
			INSERT INTO payment_status_history (
				id,
				payment_id,
				from_status,
				to_status,
				changed_at,
				changed_by
			)
			SELECT
				gen_random_uuid(),
				id,
				NULL,
				status,
				updated_at,
				'system'
			FROM payments
			WHERE NOT EXISTS (
				SELECT 1
				FROM payment_status_history
				WHERE payment_id = payments.id
			)
		`);

		const rowCount = (result as unknown as { rowCount: number }).rowCount ?? 0;
		console.log(`Inserted ${rowCount} payment_status_history row(s)`);
	} catch (error) {
		console.error("Error during backfill:", error instanceof Error ? error.message : error);
		throw error;
	} finally {
		await tenantPool.end();
	}

	await controlPanelPool.end();
	console.log("Backfill complete.");
}

if (import.meta.main) {
	backfillPaymentStatusHistory()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error("Script failed:", error);
			process.exit(1);
		});
}
