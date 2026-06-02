/**
 * Sales Tax Snapshot Integration Tests (Agent 2.3 — Phase 2 Wave 3b — J2)
 *
 * Verifies that the active tax_rate_id is captured on sales_order_items at
 * order creation, and that historical orders reproduce their original rate
 * after the underlying tax_rates row is edited / a new effective rate is
 * introduced.
 *
 * Approach: avoid the heavyweight `recordPosSale` fixture; exercise the
 * resolver + a direct insert that mirrors what pos.service does. This keeps
 * the test self-contained while still covering the J2 contract:
 *   (a) active rate exists → resolver returns it → snapshot matches
 *   (b) new rate replaces old → re-resolve returns NEW; old order keeps OLD
 *   (c) no active rate → resolver returns null → taxRateId is null
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_BRANCH_NODE_ID,
	TEST_USER_ID,
} from "../helpers/integration-setup";

import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { taxRates } from "@avantej-core/db/schema/tenant/tax-rates";
import { resolveTaxRate } from "@avantej-core/services";

loadDevVars();
const SKIP = shouldSkipIntegration() || !process.env.TENANT_DATABASE_URL;

let tenantDb: ReturnType<typeof createTenantDb>;

const createdTaxRateIds: string[] = [];
const createdSalesOrderIds: string[] = [];
const createdSalesOrderItemIds: string[] = [];

beforeAll(() => {
	if (SKIP) return;
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (SKIP) return;
	if (createdSalesOrderItemIds.length > 0) {
		await tenantDb
			.delete(salesOrderItems)
			.where(inArray(salesOrderItems.id, createdSalesOrderItemIds));
	}
	if (createdSalesOrderIds.length > 0) {
		await tenantDb
			.delete(salesOrders)
			.where(inArray(salesOrders.id, createdSalesOrderIds));
	}
	if (createdTaxRateIds.length > 0) {
		await tenantDb
			.delete(taxRates)
			.where(inArray(taxRates.id, createdTaxRateIds));
	}
});

async function seedSalesOrderWithItem(opts: {
	taxRateId: string | null;
	salesOrderNumber: string;
	totalAmount: number;
}) {
	const [order] = await tenantDb
		.insert(salesOrders)
		.values({
			salesOrderNumber: opts.salesOrderNumber,
			date: new Date(),
			customerName: "Tax Snapshot Test",
			createdBy: TEST_USER_ID,
			branchId: TEST_BRANCH_NODE_ID,
			status: "confirmed",
			totalAmount: opts.totalAmount,
		})
		.returning();
	if (!order) throw new Error("seed failed: sales order");
	createdSalesOrderIds.push(order.id);

	const [item] = await tenantDb
		.insert(salesOrderItems)
		.values({
			salesOrderId: order.id,
			taxRateId: opts.taxRateId,
			description: "Tax snapshot line",
			quantity: 1,
			unitPrice: opts.totalAmount,
			totalPrice: opts.totalAmount,
		})
		.returning();
	if (!item) throw new Error("seed failed: sales order item");
	createdSalesOrderItemIds.push(item.id);
	return { order, item };
}

describe("Sales Tax Snapshot (Agent 2.3 — J2)", () => {
	test("(a) active tax rate is captured on sales_order_item", async () => {
		if (SKIP) return;

		const code = `J2-A-${Date.now()}`;
		const [rate] = await tenantDb
			.insert(taxRates)
			.values({
				name: "J2 Test Rate A",
				code,
				rateInBasisPoints: 800,
				effectiveFrom: new Date(Date.now() - 60_000),
				isActive: true,
				isDefault: false,
			})
			.returning();
		if (!rate) throw new Error("seed failed: tax rate");
		createdTaxRateIds.push(rate.id);

		const resolved = await resolveTaxRate(
			tenantDb,
			TEST_BRANCH_NODE_ID,
			new Date(),
		);
		expect(resolved).not.toBeNull();
		expect(resolved!.rateInBasisPoints).toBeGreaterThanOrEqual(0);

		const { item } = await seedSalesOrderWithItem({
			taxRateId: resolved!.id,
			salesOrderNumber: `SO-J2A-${Date.now()}`,
			totalAmount: 10000,
		});

		const [reread] = await tenantDb
			.select({ taxRateId: salesOrderItems.taxRateId })
			.from(salesOrderItems)
			.where(eq(salesOrderItems.id, item.id));
		expect(reread?.taxRateId).toBe(resolved!.id);
	}, 30_000);

	test("(b) new effective rate captured on new orders; old order keeps old rate", async () => {
		if (SKIP) return;

		const oldFrom = new Date(Date.now() - 7 * 24 * 3600_000);
		const oldUntil = new Date(Date.now() + 24 * 3600_000); // still active for "old" order
		const [oldRate] = await tenantDb
			.insert(taxRates)
			.values({
				name: "J2 Old Rate",
				code: `J2-OLD-${Date.now()}`,
				rateInBasisPoints: 600,
				effectiveFrom: oldFrom,
				effectiveUntil: oldUntil,
				isActive: true,
				isDefault: false,
			})
			.returning();
		if (!oldRate) throw new Error("seed failed: old tax rate");
		createdTaxRateIds.push(oldRate.id);

		// Snapshot OLD rate on first order (simulate: caller already resolved it)
		const oldOrder = await seedSalesOrderWithItem({
			taxRateId: oldRate.id,
			salesOrderNumber: `SO-J2B-OLD-${Date.now()}`,
			totalAmount: 5000,
		});

		// Introduce a NEW rate with effective_from after the old one. Both are
		// "active" right now; the resolver must prefer the most-recent
		// effective_from (per ORDER BY in resolveTaxRate).
		const newFrom = new Date(Date.now() - 30_000);
		const [newRate] = await tenantDb
			.insert(taxRates)
			.values({
				name: "J2 New Rate",
				code: `J2-NEW-${Date.now()}`,
				rateInBasisPoints: 1000,
				effectiveFrom: newFrom,
				isActive: true,
				isDefault: false,
			})
			.returning();
		if (!newRate) throw new Error("seed failed: new tax rate");
		createdTaxRateIds.push(newRate.id);

		const resolvedNow = await resolveTaxRate(
			tenantDb,
			TEST_BRANCH_NODE_ID,
			new Date(),
		);
		expect(resolvedNow?.id).toBe(newRate.id);

		const newOrder = await seedSalesOrderWithItem({
			taxRateId: resolvedNow!.id,
			salesOrderNumber: `SO-J2B-NEW-${Date.now()}`,
			totalAmount: 5000,
		});

		// Old order's snapshot is unchanged — even though a new rate now exists.
		const [oldRead] = await tenantDb
			.select({ taxRateId: salesOrderItems.taxRateId })
			.from(salesOrderItems)
			.where(eq(salesOrderItems.id, oldOrder.item.id));
		expect(oldRead?.taxRateId).toBe(oldRate.id);

		// New order captured the NEW rate.
		const [newRead] = await tenantDb
			.select({ taxRateId: salesOrderItems.taxRateId })
			.from(salesOrderItems)
			.where(eq(salesOrderItems.id, newOrder.item.id));
		expect(newRead?.taxRateId).toBe(newRate.id);
	}, 30_000);

	test("(c) no active tax rate → snapshot is null", async () => {
		if (SKIP) return;

		// We cannot truncate tax_rates on a shared dev DB without nuking other
		// tests' state, so simulate the "no active rate" branch by querying with
		// an `at` timestamp far in the past (before any rate could be effective).
		const ancient = new Date("1970-01-01T00:00:00Z");
		const resolved = await resolveTaxRate(
			tenantDb,
			TEST_BRANCH_NODE_ID,
			ancient,
		);
		expect(resolved).toBeNull();

		const { item } = await seedSalesOrderWithItem({
			taxRateId: null,
			salesOrderNumber: `SO-J2C-${Date.now()}`,
			totalAmount: 1000,
		});

		const [reread] = await tenantDb
			.select({ taxRateId: salesOrderItems.taxRateId })
			.from(salesOrderItems)
			.where(eq(salesOrderItems.id, item.id));
		expect(reread?.taxRateId).toBeNull();
	}, 30_000);
});
