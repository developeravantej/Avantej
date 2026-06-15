/**
 * DB integrity audit for Batch 5 pages (UoM / Settings / Platform Admin / Operations)
 * Run: cd apps/server && bun run scripts/audit-db-batch5.ts
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
	} catch {
		/* ignore */
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
	let d = decipher.update(encrypted!, "hex", "utf8");
	d += decipher.final("utf8");
	return d;
}

async function main() {
	loadEnv();

	// Get tenant DB connection string from control panel
	const controlPool = new Pool({ connectionString: process.env.DATABASE_URL! });
	const { rows: orgs } = await controlPool.query(
		`SELECT connection_string FROM organizations WHERE id = '996febce-aaad-4ded-8f47-02d2b566c8ee'`,
	);

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

	// --- Check 1: tax_rates count ---
	results.tax_rates_count = (
		await q(`SELECT COUNT(*)::int AS c FROM tax_rates`)
	)[0]?.c;

	// --- Check 2: tax_rates default set ---
	results.tax_rates_default_count = (
		await q(`SELECT COUNT(*)::int AS c FROM tax_rates WHERE is_default = true`)
	)[0]?.c;

	// --- Check 3: sales_order_items.tax_rate_id captured ---
	const soiTaxCol = await q(`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'sales_order_items' AND column_name = 'tax_rate_id'
	`);
	results.sales_order_items_tax_rate_id_col_exists = soiTaxCol.length > 0;
	if (soiTaxCol.length > 0) {
		results.sales_order_items_tax_rate_id_set = (
			await q(
				`SELECT COUNT(*)::int AS c FROM sales_order_items WHERE tax_rate_id IS NOT NULL`,
			)
		)[0]?.c;
	} else {
		results.sales_order_items_tax_rate_id_set = "N/A — column does not exist";
	}

	// --- Check 4: payment_items.tax_rate_id captured ---
	const piTaxCol = await q(`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'payment_items' AND column_name = 'tax_rate_id'
	`);
	results.payment_items_tax_rate_id_col_exists = piTaxCol.length > 0;
	if (piTaxCol.length > 0) {
		results.payment_items_tax_rate_id_set = (
			await q(
				`SELECT COUNT(*)::int AS c FROM payment_items WHERE tax_rate_id IS NOT NULL`,
			)
		)[0]?.c;
	} else {
		results.payment_items_tax_rate_id_set = "N/A — column does not exist";
	}

	// --- Check 5: commission_splits count ---
	results.commission_splits_count = (
		await q(`SELECT COUNT(*)::int AS c FROM commission_splits`)
	)[0]?.c;

	// --- Check 6: commission_splits cap_applied, floor_applied columns ---
	const capFloorCols = await q(`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'commission_splits' AND column_name IN ('cap_applied','floor_applied')
	`);
	results.commission_splits_cap_floor_cols = capFloorCols.map(
		(r: any) => r.column_name,
	);

	// --- Check 7: category_commission_configs cap_amount, floor_amount ---
	const capFloorConfigCols = await q(`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'category_commission_configs' AND column_name IN ('cap_amount','floor_amount')
	`);
	results.category_commission_configs_cap_floor_cols = capFloorConfigCols.map(
		(r: any) => r.column_name,
	);

	// --- Check 8: uom_conversions count ---
	const uomTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name = 'uom_conversions'
	`)
	)[0]?.c;
	results.uom_conversions_table_exists = uomTableExists > 0;
	if (uomTableExists > 0) {
		results.uom_conversions_count = (
			await q(`SELECT COUNT(*)::int AS c FROM uom_conversions`)
		)[0]?.c;
	} else {
		results.uom_conversions_count = "N/A — table does not exist";
	}

	// --- Check 9: installment_plans count ---
	const ipTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name = 'installment_plans'
	`)
	)[0]?.c;
	results.installment_plans_table_exists = ipTableExists > 0;
	if (ipTableExists > 0) {
		results.installment_plans_count = (
			await q(`SELECT COUNT(*)::int AS c FROM installment_plans`)
		)[0]?.c;
	} else {
		results.installment_plans_count = "N/A — table does not exist";
	}

	// --- Check 10: control panel platform_admins count ---
	const { rows: adminRows } = await controlPool.query(
		`SELECT COUNT(*)::int AS c FROM platform_admins`,
	);
	results.platform_admins_count = adminRows[0]?.c;

	// --- Check 11: operations_approvals table existence ---
	const opsApprTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name = 'operations_approvals'
	`)
	)[0]?.c;
	results.operations_approvals_table_exists = opsApprTableExists > 0;
	if (opsApprTableExists > 0) {
		results.operations_approvals_count = (
			await q(`SELECT COUNT(*)::int AS c FROM operations_approvals`)
		)[0]?.c;
	} else {
		// Check package_approvals as alternative name
		const pkgApprTableExists = (
			await q(`
			SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name = 'package_approvals'
		`)
		)[0]?.c;
		results.package_approvals_table_exists = pkgApprTableExists > 0;
		if (pkgApprTableExists > 0) {
			results.package_approvals_count = (
				await q(`SELECT COUNT(*)::int AS c FROM package_approvals`)
			)[0]?.c;
		} else {
			results.package_approvals_count = "N/A — table does not exist";
		}
	}

	// --- Check 12: promotion_usages.sales_order_id type ---
	const puType = await q(`
		SELECT data_type FROM information_schema.columns
		WHERE table_name = 'promotion_usages' AND column_name = 'sales_order_id'
	`);
	results.promotion_usages_sales_order_id_type =
		puType[0]?.data_type || "NOT FOUND";

	// --- Check 13: category_commission_config_versions count ---
	const ccvTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name = 'category_commission_config_versions'
	`)
	)[0]?.c;
	results.category_commission_config_versions_table_exists = ccvTableExists > 0;
	if (ccvTableExists > 0) {
		results.category_commission_config_versions_count = (
			await q(
				`SELECT COUNT(*)::int AS c FROM category_commission_config_versions`,
			)
		)[0]?.c;
	} else {
		results.category_commission_config_versions_count =
			"N/A — table does not exist";
	}

	// Bonus: check installment_plans.package_instance_id FK (Sales #6)
	const ipPkgFk = await q(`
		SELECT COUNT(*)::int AS c FROM pg_constraint
		WHERE conrelid = 'installment_plans'::regclass
		  AND contype = 'f'
		  AND conname LIKE '%package%'
	`);
	results.installment_plans_package_fk_exists = (ipPkgFk[0]?.c ?? 0) > 0;

	// Bonus: check google_calendar_connections columns for token rotation
	const gcalCols = await q(`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'google_calendar_connections'
		  AND column_name IN ('encryption_key_id','token_rotated_at')
	`);
	results.google_calendar_connections_token_rotation_cols = gcalCols.map(
		(r: any) => r.column_name,
	);

	console.log(JSON.stringify(results, null, 2));

	await pool.end();
	await controlPool.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
