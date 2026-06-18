/**
 * E2E helper: inspect (and optionally repair) tenant schema drift for ONE org.
 *
 *   cd apps/server
 *   bun --env-file=.env run scripts/e2e-tenant-drift.ts --slug=test-fitness-franchise
 *   bun --env-file=.env run scripts/e2e-tenant-drift.ts --slug=test-fitness-franchise --fix
 *
 * Read-only by default. --fix re-applies migration 0005's ADD COLUMN statements
 * idempotently (ADD COLUMN IF NOT EXISTS) to repair the known non-idempotent drift
 * where the migration ledger claims 0005 applied but the columns are missing.
 */

import { decrypt } from "@avantej-core/db";
import { getControlPanelDb } from "../src/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { Pool } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);
const slugArg = args.find((a) => a.startsWith("--slug=")) ?? "--slug=test-fitness-franchise";
const slug = slugArg.split("=")[1] ?? "test-fitness-franchise";
const doFix = args.includes("--fix");

const TABLES = ["services", "appointments", "package_instances", "sales_orders", "installments"];

async function main() {
	const cp = getControlPanelDb();
	const org = await cp.query.organizations.findFirst({ where: eq(organizations.slug, slug) });
	if (!org) throw new Error(`org not found for slug=${slug}`);
	console.log(`Org: ${org.name} (${org.id})  schemaVersion=${org.schemaVersion}`);

	const connectionString = decrypt(org.connectionString as string);
	const pool = new Pool({ connectionString });

	try {
		for (const t of TABLES) {
			const { rows } = await pool.query(
				`SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY column_name`,
				[t],
			);
			console.log(`\n[${t}] ${rows.length} cols: ${rows.map((r: { column_name: string }) => r.column_name).join(", ")}`);
		}

		if (doFix) {
			console.log(`\n--- FIX: re-applying 0005 ADD COLUMN (idempotent) ---`);
			// Curated from packages/db/src/migrations/tenant/0005_schema_enhancement.sql,
			// rewritten to IF NOT EXISTS so it is safe on a partially-migrated tenant.
			const stmts = [
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "title" text`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "description" text`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "image_url" text`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'service' NOT NULL`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "price" integer`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "price_unit" text`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "taxable" boolean DEFAULT true NOT NULL`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "tax_percentage" integer`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "is_recommended" boolean DEFAULT false NOT NULL`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "location" text`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "features" text[]`,
				`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "scheduling_type" text DEFAULT 'appointment' NOT NULL`,
				`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "booking_number" text`,
				// Migration 0034 was meant to DROP this (superseded by commission_splits_source_check,
				// which allows manual splits to have 0 targets); some tenants kept the stale, now
				// contradictory constraint — re-apply the drop idempotently.
				`ALTER TABLE "commission_splits" DROP CONSTRAINT IF EXISTS "commission_splits_must_target_one"`,
			];
			for (const s of stmts) {
				try {
					await pool.query(s);
					console.log(`  ok: ${s.slice(0, 70)}...`);
				} catch (e) {
					console.log(`  ERR: ${s.slice(0, 60)} -> ${(e as Error).message}`);
				}
			}
			console.log(`--- FIX done ---`);
		}
	} finally {
		await pool.end();
	}
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
