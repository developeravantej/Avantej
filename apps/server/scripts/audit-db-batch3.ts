/**
 * DB integrity audit for Batch 3 pages (Branch / Sales / Refunds / Commissions / Payouts)
 * Run: cd apps/server && bun run scripts/audit-db-batch3.ts
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

	// Agent 2.3 — tax_rate_id on sales_order_items (Sales #1,#2)
	results.sales_orders_count = (
		await q(`SELECT COUNT(*) FROM sales_orders`)
	)[0]?.count;
	results.soi_total = (
		await q(`SELECT COUNT(*) FROM sales_order_items`)
	)[0]?.count;

	const soiTaxColExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.columns
		WHERE table_name='sales_order_items' AND column_name='tax_rate_id'
	`)
	)[0]?.c;
	results.soi_tax_rate_id_col_exists = soiTaxColExists > 0;
	if (soiTaxColExists > 0) {
		results.soi_tax_rate_id_set = (
			await q(
				`SELECT COUNT(*) FROM sales_order_items WHERE tax_rate_id IS NOT NULL`,
			)
		)[0]?.count;
	} else {
		results.soi_tax_rate_id_set = "COL_MISSING";
	}

	results.payment_items_total = (
		await q(`SELECT COUNT(*) FROM payment_items`)
	)[0]?.count;

	const piTaxColExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.columns
		WHERE table_name='payment_items' AND column_name='tax_rate_id'
	`)
	)[0]?.c;
	results.payment_items_tax_rate_col_exists = piTaxColExists > 0;
	if (piTaxColExists > 0) {
		results.payment_items_tax_rate_set = (
			await q(
				`SELECT COUNT(*) FROM payment_items WHERE tax_rate_id IS NOT NULL`,
			)
		)[0]?.count;
	} else {
		results.payment_items_tax_rate_set = "COL_MISSING";
	}

	// Agent 2.7 — status history (Sales #9 / Cross-domain X5)
	const soHistoryExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name='sales_order_status_history'
	`)
	)[0]?.c;
	results.sales_order_status_history_table_exists = soHistoryExists > 0;
	if (soHistoryExists > 0) {
		results.sales_order_status_history = (
			await q(`SELECT COUNT(*) FROM sales_order_status_history`)
		)[0]?.count;
	} else {
		results.sales_order_status_history = "TABLE_MISSING";
	}

	const pmHistoryExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name='payment_status_history'
	`)
	)[0]?.c;
	results.payment_status_history_table_exists = pmHistoryExists > 0;
	if (pmHistoryExists > 0) {
		results.payment_status_history = (
			await q(`SELECT COUNT(*) FROM payment_status_history`)
		)[0]?.count;
	} else {
		results.payment_status_history = "TABLE_MISSING";
	}

	// Agent 2.8 — refund_items (Sales #10)
	results.refunds_count = (await q(`SELECT COUNT(*) FROM refunds`))[0]?.count;

	const refundItemsExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name='refund_items'
	`)
	)[0]?.c;
	results.refund_items_table_exists = refundItemsExists > 0;
	if (refundItemsExists > 0) {
		results.refund_items_count = (
			await q(`SELECT COUNT(*) FROM refund_items`)
		)[0]?.count;
	} else {
		results.refund_items_count = "TABLE_MISSING";
	}

	// Agent 2.9 — commission_split_reversals (Cross-domain X4)
	results.commission_splits_count = (
		await q(`SELECT COUNT(*) FROM commission_splits`)
	)[0]?.count;

	const csrExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name='commission_split_reversals'
	`)
	)[0]?.c;
	results.commission_split_reversals_table_exists = csrExists > 0;
	if (csrExists > 0) {
		results.commission_split_reversals = (
			await q(`SELECT COUNT(*) FROM commission_split_reversals`)
		)[0]?.count;
	} else {
		results.commission_split_reversals = "TABLE_MISSING";
	}

	// Agent 3.4 — commission cap/floor cols (Commission #3)
	const capCols = await q(`
		SELECT column_name FROM information_schema.columns
		WHERE table_name='commission_splits'
		AND column_name IN ('cap_applied','floor_applied','excluded','is_complimentary')
	`);
	results.commission_cap_cols_on_splits = capCols.map(
		(r: any) => r.column_name,
	);

	const cfgCols = await q(`
		SELECT column_name FROM information_schema.columns
		WHERE table_name='category_commission_configs'
		AND column_name IN ('cap_amount','floor_amount','excluded_order_types','max_per_cycle')
	`);
	results.cap_cols_on_config = cfgCols.map((r: any) => r.column_name);

	// Agent 2.5 — payout_batches + commission config versions (Commission #2,#3)
	const pbExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name='payout_batches'
	`)
	)[0]?.c;
	results.payout_batches_table_exists = pbExists > 0;
	if (pbExists > 0) {
		results.payout_batches = (
			await q(`SELECT COUNT(*) FROM payout_batches`)
		)[0]?.count;
	} else {
		results.payout_batches = "TABLE_MISSING";
	}

	results.payouts_count = (await q(`SELECT COUNT(*) FROM payouts`))[0]?.count;

	const batchIdColExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.columns
		WHERE table_name='payouts' AND column_name='batch_id'
	`)
	)[0]?.c;
	results.payouts_batch_id_col_exists = batchIdColExists > 0;
	if (batchIdColExists > 0) {
		results.payouts_with_batch_id = (
			await q(`SELECT COUNT(*) FROM payouts WHERE batch_id IS NOT NULL`)
		)[0]?.count;
	} else {
		results.payouts_with_batch_id = "COL_MISSING";
	}

	const ccvExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name='category_commission_config_versions'
	`)
	)[0]?.c;
	results.config_versions_table_exists = ccvExists > 0;
	if (ccvExists > 0) {
		results.config_versions = (
			await q(`SELECT COUNT(*) FROM category_commission_config_versions`)
		)[0]?.count;
	} else {
		results.config_versions = "TABLE_MISSING";
	}

	// Agent 3.3 — complimentary cols on sales_orders
	const compCols = await q(`
		SELECT column_name FROM information_schema.columns
		WHERE table_name='sales_orders'
		AND column_name IN ('is_complimentary','complimentary_reason','complimentary_approved_by')
	`);
	results.comp_cols_on_sales_orders = compCols.map((r: any) => r.column_name);

	// promotion_usages.sales_order_id type (Sales #4)
	const puType = await q(`
		SELECT data_type FROM information_schema.columns
		WHERE table_name='promotion_usages' AND column_name='sales_order_id'
	`);
	results.promotion_usages_so_id_type = puType[0]?.data_type || "NOT_FOUND";

	console.log(JSON.stringify(results, null, 2));
	await pool.end();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
