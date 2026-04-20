/**
 * Seed a sales order + invoice in the tenant DB for browser testing.
 *
 * Creates one confirmed sales order and one paid invoice linked to it.
 * Idempotent — skips if records with the same numbers already exist.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/seed-sales-invoice.ts
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { invoices, salesOrders } from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
// Tenant Test Fitness Franchise Branch (depth 4)
const BRANCH_ID = "0ca11a66-261e-47f2-8fc7-236149b888c9";
const CREATED_BY = "franchisee-seed"; // arbitrary text; no FK constraint
const SALES_ORDER_NUMBER = "SO-TEST-0001";
const INVOICE_NUMBER = "INV-TEST-0001";

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const m = line.trim().match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined && !process.env[m[1]])
				process.env[m[1]] = m[2];
		}
	} catch {
		console.warn("Could not load .dev.vars");
	}
}

async function main() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const cpPool = new Pool({ connectionString: databaseUrl });
	const cpDb = drizzle({ client: cpPool, schema: controlPanelSchema });
	let tPool: Pool | null = null;

	try {
		const org = await cpDb.query.organizations.findFirst({
			where: (o, { eq }) => eq(o.id, TARGET_ORG_ID),
		});
		if (!org) throw new Error("Organization not found");

		tPool = new Pool({ connectionString: decrypt(org.connectionString) });
		const tDb = drizzle({ client: tPool, schema: tenantSchema });

		// 1. Sales order
		const existingSO = await tDb.query.salesOrders.findFirst({
			where: (so, { eq }) => eq(so.salesOrderNumber, SALES_ORDER_NUMBER),
		});

		let salesOrderId: string;
		if (existingSO) {
			salesOrderId = existingSO.id;
			console.log(`Sales order already exists: ${salesOrderId}`);
		} else {
			const [so] = await tDb.insert(salesOrders).values({
				salesOrderNumber: SALES_ORDER_NUMBER,
				date: new Date(),
				customerName: "Test Customer",
				customerType: "walk_in",
				createdBy: CREATED_BY,
				branchId: BRANCH_ID,
				status: "confirmed",
				totalAmount: 10000, // 100.00 MYR in cents
			}).returning();
			salesOrderId = so!.id;
			console.log(`Sales order created: ${salesOrderId}`);
		}

		// 2. Invoice linked to sales order
		const existingInv = await tDb.query.invoices.findFirst({
			where: (inv, { eq }) => eq(inv.invoiceNumber, INVOICE_NUMBER),
		});

		if (existingInv) {
			console.log(`Invoice already exists: ${existingInv.id}`);
		} else {
			const [inv] = await tDb.insert(invoices).values({
				invoiceNumber: INVOICE_NUMBER,
				salesOrderId: salesOrderId,
				date: new Date(),
				customerName: "Test Customer",
				createdBy: CREATED_BY,
				paymentMode: "cash",
				totalAmount: 10000,
				amountPaid: 10000,
				status: "paid",
			}).returning();
			console.log(`Invoice created: ${inv!.id}`);
		}

		console.log("\nDone. Reload the app and navigate to:");
		console.log("  /dashboard/sales/view       → View button on SO-TEST-0001");
		console.log("  /dashboard/payment/view     → View button on INV-TEST-0001");
	} finally {
		await cpPool.end();
		if (tPool) await tPool.end();
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => { console.error(err); process.exit(1); });
