/**
 * DB integrity audit for Batch 4 pages (Payment / Promotions / Packages / Inventory)
 * Run: cd apps/server && bun run scripts/audit-db-batch4.ts
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

	// --- Sales #4: promotion_usages.sales_order_id type ---
	const puType = await q(`
		SELECT data_type FROM information_schema.columns
		WHERE table_name = 'promotion_usages' AND column_name = 'sales_order_id'
	`);
	results.promotion_usages_so_id_type = puType[0]?.data_type || "NOT FOUND";
	results.promotion_usages_count = (
		await q(`SELECT COUNT(*)::int AS c FROM promotion_usages`)
	)[0]?.c;
	results.promotions_count = (
		await q(`SELECT COUNT(*)::int AS c FROM promotions`)
	)[0]?.c;

	// --- Engagement #3: announcement_scopes junction ---
	const announcementScopesTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name = 'announcement_scopes'
	`)
	)[0]?.c;
	results.announcement_scopes_table_exists = announcementScopesTableExists > 0;
	if (announcementScopesTableExists > 0) {
		results.announcement_scopes_count = (
			await q(`SELECT COUNT(*)::int AS c FROM announcement_scopes`)
		)[0]?.c;
	} else {
		results.announcement_scopes_count = "N/A — table does not exist";
	}
	results.announcements_count = (
		await q(`SELECT COUNT(*)::int AS c FROM announcements`)
	)[0]?.c;

	// --- Cross X5: package_instance_status_history ---
	results.package_instances_count = (
		await q(`SELECT COUNT(*)::int AS c FROM package_instances`)
	)[0]?.c;
	const pishTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name = 'package_instance_status_history'
	`)
	)[0]?.c;
	results.package_instance_status_history_table_exists = pishTableExists > 0;
	if (pishTableExists > 0) {
		results.package_instance_status_history_count = (
			await q(`SELECT COUNT(*)::int AS c FROM package_instance_status_history`)
		)[0]?.c;
	} else {
		results.package_instance_status_history_count =
			"N/A — table does not exist";
	}

	// --- Installments ---
	const installmentPlansTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name = 'installment_plans'
	`)
	)[0]?.c;
	results.installment_plans_table_exists = installmentPlansTableExists > 0;
	if (installmentPlansTableExists > 0) {
		results.installment_plans_count = (
			await q(`SELECT COUNT(*)::int AS c FROM installment_plans`)
		)[0]?.c;
	} else {
		results.installment_plans_count = "N/A — table does not exist";
	}

	const installmentsTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name = 'installments'
	`)
	)[0]?.c;
	results.installments_table_exists = installmentsTableExists > 0;
	if (installmentsTableExists > 0) {
		results.installments_count = (
			await q(`SELECT COUNT(*)::int AS c FROM installments`)
		)[0]?.c;
	} else {
		results.installments_count = "N/A — table does not exist";
	}

	const installmentEventsTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name = 'installment_events'
	`)
	)[0]?.c;
	results.installment_events_table_exists = installmentEventsTableExists > 0;
	if (installmentEventsTableExists > 0) {
		results.installment_events_count = (
			await q(`SELECT COUNT(*)::int AS c FROM installment_events`)
		)[0]?.c;
	} else {
		results.installment_events_count = "N/A — table does not exist";
	}

	// --- Sales #3: payment_items.promotion_id FK ---
	const promoFkCheck = await q(`
		SELECT COUNT(*)::int AS c FROM pg_constraint
		WHERE conrelid = 'payment_items'::regclass
		  AND contype = 'f'
		  AND conname LIKE '%promot%'
	`);
	results.payment_items_promotion_fk_exists = promoFkCheck[0]?.c;
	results.payment_items_promotion_id_set = (
		await q(
			`SELECT COUNT(*)::int AS c FROM payment_items WHERE promotion_id IS NOT NULL`,
		)
	)[0]?.c;

	// Check if promotion_id column exists on payment_items
	const promoColExists = await q(`
		SELECT data_type FROM information_schema.columns
		WHERE table_name = 'payment_items' AND column_name = 'promotion_id'
	`);
	results.payment_items_promotion_id_col_type =
		promoColExists[0]?.data_type || "NOT FOUND";

	// --- Agent 2.2: branch pricing tables ---
	results.service_prices_count = (
		await q(`SELECT COUNT(*)::int AS c FROM service_prices`)
	)[0]?.c;
	results.product_prices_count = (
		await q(`SELECT COUNT(*)::int AS c FROM product_prices`)
	)[0]?.c;

	// --- Inventory #3: goods_receipts ---
	const goodsReceiptsTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name = 'goods_receipts'
	`)
	)[0]?.c;
	results.goods_receipts_table_exists = goodsReceiptsTableExists > 0;
	if (goodsReceiptsTableExists > 0) {
		results.goods_receipts_count = (
			await q(`SELECT COUNT(*)::int AS c FROM goods_receipts`)
		)[0]?.c;
	} else {
		results.goods_receipts_count = "N/A — table does not exist";
	}

	const goodsReceiptItemsTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name = 'goods_receipt_items'
	`)
	)[0]?.c;
	results.goods_receipt_items_table_exists = goodsReceiptItemsTableExists > 0;
	if (goodsReceiptItemsTableExists > 0) {
		results.goods_receipt_items_count = (
			await q(`SELECT COUNT(*)::int AS c FROM goods_receipt_items`)
		)[0]?.c;
	} else {
		results.goods_receipt_items_count = "N/A — table does not exist";
	}

	results.purchase_orders_count = (
		await q(`SELECT COUNT(*)::int AS c FROM purchase_orders`)
	)[0]?.c;

	const supplierInvoicesTableExists = (
		await q(`
		SELECT COUNT(*)::int AS c FROM information_schema.tables
		WHERE table_name = 'supplier_invoices'
	`)
	)[0]?.c;
	results.supplier_invoices_table_exists = supplierInvoicesTableExists > 0;
	if (supplierInvoicesTableExists > 0) {
		results.supplier_invoices_count = (
			await q(`SELECT COUNT(*)::int AS c FROM supplier_invoices`)
		)[0]?.c;
	} else {
		results.supplier_invoices_count = "N/A — table does not exist";
	}

	// --- Inventory #5: transfer_order_items received_qty/damaged_qty ---
	const toRecv = await q(`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'transfer_order_items'
		  AND column_name IN ('received_qty', 'damaged_qty')
	`);
	results.transfer_order_items_recv_cols = toRecv.map(
		(r: any) => r.column_name,
	);

	// --- Inventory #6: stock_request_items approved_qty/fulfilled_qty ---
	const srFulfill = await q(`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'stock_request_items'
		  AND column_name IN ('approved_qty', 'fulfilled_qty')
	`);
	results.stock_request_items_fulfill_cols = srFulfill.map(
		(r: any) => r.column_name,
	);

	console.log(JSON.stringify(results, null, 2));
	await pool.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
