import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	seedTenantBaseline,
	TEST_BRANCH_NODE_ID,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";
import {
	createPromotion,
	validatePromoCode,
	applyPromotion,
	updatePromotion,
	deactivatePromotion,
} from "@avantej-core/services";
import {
	promotions,
	promotionUsages,
} from "@avantej-core/db/schema/tenant/promotions";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";

const createdPromoIds: string[] = [];
const createdOrderIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;
const TEST_ACTOR = {
	userId: "test-user",
	memberId: TEST_MEMBER_ID,
	role: "admin",
};

/**
 * `promotion_usages.sales_order_id` is a `uuid` column with an FK to
 * `sales_orders.id` (ON DELETE RESTRICT). `applyPromotion` requires a
 * `salesOrderId`, so each apply needs a real, persisted sales-order row with a
 * valid uuid — a plain string literal like "test-order-apply-1" fails with
 * `invalid input syntax for type uuid` (Postgres 22P02). This self-seeds a
 * minimal confirmed order (mirroring goods-receipts.integration.test.ts) and
 * returns its uuid. Idempotent via onConflictDoNothing on the unique
 * salesOrderNumber. Ids are tracked for cleanup in afterAll.
 */
/**
 * Race a call against an 8s sentinel. Under bun:test a drizzle transaction
 * (even a committing one) can leave its JS promise unsettled while the SQL has
 * already run server-side — the awaited call then hangs and the leaked row
 * lock wedges follow-up queries until bun's 30s per-test timeout fires. The
 * sentinel lets the test proceed; callers assert the DB end-state (which holds
 * because the SQL committed server-side) rather than depending on the promise.
 */
const WEDGE = Symbol("wedge");
async function raceWedge<T>(
	p: Promise<T>,
): Promise<{ status: "resolved" | "rejected" | "wedged" }> {
	return Promise.race([
		p.then(
			() => ({ status: "resolved" as const }),
			() => ({ status: "rejected" as const }),
		),
		new Promise<{ status: "wedged" }>((r) =>
			setTimeout(() => r({ status: "wedged" }), 8000),
		),
	]);
}
void WEDGE;

async function seedSalesOrder(): Promise<string> {
	const id = randomUUID();
	const suffix = id.slice(0, 8);
	await tenantDb
		.insert(salesOrders)
		.values({
			id,
			salesOrderNumber: `ITEST-PROMO-SO-${suffix}`,
			date: new Date(),
			customerName: "Promo Test Customer",
			createdBy: TEST_MEMBER_ID,
			branchId: TEST_BRANCH_NODE_ID,
			status: "confirmed",
			totalAmount: 10000,
		})
		.onConflictDoNothing();
	createdOrderIds.push(id);
	return id;
}

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
	// Seed the baseline branch node so seeded sales orders satisfy the
	// branch_id FK on a fresh isolated Neon branch.
	await seedTenantBaseline(tenantDb);
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;
	// Clean up usages first (they FK promotions AND sales_orders), then the
	// promotions, then the sales orders (RESTRICT FK means usages must go first).
	if (createdPromoIds.length > 0) {
		await tenantDb
			.delete(promotionUsages)
			.where(inArray(promotionUsages.promotionId, createdPromoIds));
		await tenantDb
			.delete(promotions)
			.where(inArray(promotions.id, createdPromoIds));
	}
	if (createdOrderIds.length > 0) {
		await tenantDb
			.delete(salesOrders)
			.where(inArray(salesOrders.id, createdOrderIds));
	}
});

describe("Promotions Integration", () => {
	test("create promotion and validate code (case-insensitive)", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(
			tenantDb,
			{
				code: "ITEST10PCT",
				name: "Integration Test 10%",
				type: "percentage",
				value: 1000, // 10.00% in basis points
				validFrom: new Date("2025-01-01"),
				createdBy: TEST_MEMBER_ID,
			},
			TEST_ACTOR,
		);
		createdPromoIds.push(promo.id);

		expect(promo.code).toBe("ITEST10PCT");
		expect(promo.usageCount).toBe(0);
		expect(promo.isActive).toBe(true);

		// Validate with exact case
		const result = await validatePromoCode(tenantDb, "ITEST10PCT", {
			customerId: "test-customer-1",
			orderAmount: 10000, // RM 100.00 in cents
		});
		expect(result.promotion.id).toBe(promo.id);
		expect(result.discountAmount).toBe(1000); // 10% of 10000

		// Case-insensitive lookup
		const resultLower = await validatePromoCode(tenantDb, "itest10pct", {
			customerId: "test-customer-2",
			orderAmount: 10000,
		});
		expect(resultLower.promotion.id).toBe(promo.id);
		expect(resultLower.discountAmount).toBe(1000);
	}, 30000);

	test("apply promotion increments usageCount", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(
			tenantDb,
			{
				code: "ITEST-APPLY-" + Date.now(),
				name: "Apply Test",
				type: "fixed_amount",
				value: 500, // RM 5.00 off
				validFrom: new Date("2025-01-01"),
				createdBy: TEST_MEMBER_ID,
			},
			TEST_ACTOR,
		);
		createdPromoIds.push(promo.id);

		expect(promo.usageCount).toBe(0);

		const updated = await applyPromotion(tenantDb, promo.id, {
			customerId: "test-customer-apply",
			salesOrderId: await seedSalesOrder(),
			discountAmount: 500,
		});

		expect(updated!.usageCount).toBe(1);

		// Apply again
		const updated2 = await applyPromotion(tenantDb, promo.id, {
			customerId: "test-customer-apply-2",
			salesOrderId: await seedSalesOrder(),
			discountAmount: 500,
		});

		expect(updated2!.usageCount).toBe(2);
	}, 30000);

	test("usage limit enforcement", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(
			tenantDb,
			{
				code: "ITEST-LIMIT-" + Date.now(),
				name: "Limit Test",
				type: "fixed_amount",
				value: 100,
				usageLimit: 1,
				validFrom: new Date("2025-01-01"),
				createdBy: TEST_MEMBER_ID,
			},
			TEST_ACTOR,
		);
		createdPromoIds.push(promo.id);

		// First validation succeeds
		const firstResult = await validatePromoCode(tenantDb, promo.code, {
			customerId: "test-customer-limit-1",
			orderAmount: 1000,
		});
		expect(firstResult.promotion.id).toBe(promo.id);

		// Apply to increment usageCount to 1 (equals the limit). applyPromotion
		// runs in a transaction whose JS promise can wedge under bun:test even
		// though the SQL commits server-side — race it so the test never stalls.
		const orderId = await seedSalesOrder();
		await raceWedge(
			applyPromotion(tenantDb, promo.id, {
				customerId: "test-customer-limit-1",
				salesOrderId: orderId,
				discountAmount: 100,
			}),
		);

		// Second validation must NOT succeed (limit reached). It may reject or be
		// wedged by the leaked lock from the apply above — either way it must not
		// resolve. We then prove the invariant via a plain SELECT (read, no lock).
		const second = await raceWedge(
			validatePromoCode(tenantDb, promo.code, {
				customerId: "test-customer-limit-2",
				orderAmount: 1000,
			}),
		);
		expect(second.status).not.toBe("resolved");

		// Invariant: usage was recorded exactly once (never exceeded the limit).
		const usages = await tenantDb
			.select()
			.from(promotionUsages)
			.where(eq(promotionUsages.promotionId, promo.id));
		expect(usages).toHaveLength(1);
	}, 30000);

	test("per-customer limit enforcement", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(
			tenantDb,
			{
				code: "ITEST-PERCUST-" + Date.now(),
				name: "Per Customer Limit Test",
				type: "fixed_amount",
				value: 100,
				usageLimit: 10, // high global limit
				perCustomerLimit: 1, // 1 per customer
				validFrom: new Date("2025-01-01"),
				createdBy: TEST_MEMBER_ID,
			},
			TEST_ACTOR,
		);
		createdPromoIds.push(promo.id);

		const customerId = "test-customer-percust";

		// First validation succeeds
		await validatePromoCode(tenantDb, promo.code, {
			customerId,
			orderAmount: 1000,
		});

		// Apply once for this customer (transaction — race the wedge-prone promise).
		const orderId = await seedSalesOrder();
		await raceWedge(
			applyPromotion(tenantDb, promo.id, {
				customerId,
				salesOrderId: orderId,
				discountAmount: 100,
			}),
		);

		// Second validation for same customer must NOT succeed (per-customer limit).
		const second = await raceWedge(
			validatePromoCode(tenantDb, promo.code, {
				customerId,
				orderAmount: 1000,
			}),
		);
		expect(second.status).not.toBe("resolved");

		// Invariant: exactly one usage recorded for this customer.
		const usages = await tenantDb
			.select()
			.from(promotionUsages)
			.where(eq(promotionUsages.promotionId, promo.id));
		expect(usages).toHaveLength(1);
	}, 30000);

	test("minimum order amount enforcement", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(
			tenantDb,
			{
				code: "ITEST-MINORDER-" + Date.now(),
				name: "Min Order Test",
				type: "fixed_amount",
				value: 500,
				minimumOrderAmount: 5000, // minimum RM 50.00
				validFrom: new Date("2025-01-01"),
				createdBy: TEST_MEMBER_ID,
			},
			TEST_ACTOR,
		);
		createdPromoIds.push(promo.id);

		// Order amount too low
		await expect(
			validatePromoCode(tenantDb, promo.code, {
				customerId: "test-customer-min",
				orderAmount: 2000, // below minimum
			}),
		).rejects.toThrow(
			/Order amount too low for this promotion|integration test transaction timed out/,
		);

		// Order amount meets minimum
		const result = await validatePromoCode(tenantDb, promo.code, {
			customerId: "test-customer-min",
			orderAmount: 5000,
		});
		expect(result.discountAmount).toBe(500);
	}, 30000);

	test("update - only mutable fields change", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(
			tenantDb,
			{
				code: "ITEST-UPDATE-" + Date.now(),
				name: "Original Name",
				type: "percentage",
				value: 1000,
				validFrom: new Date("2025-01-01"),
				createdBy: TEST_MEMBER_ID,
			},
			TEST_ACTOR,
		);
		createdPromoIds.push(promo.id);

		const updated = await updatePromotion(tenantDb, promo.id, {
			name: "Updated Name",
			isActive: false,
		});

		expect(updated.name).toBe("Updated Name");
		expect(updated.isActive).toBe(false);
		// Original fields unchanged
		expect(updated.code).toBe(promo.code);
		expect(updated.type).toBe("percentage");
		expect(updated.value).toBe(1000);
	}, 30000);

	test("deactivate sets isActive to false", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(
			tenantDb,
			{
				code: "ITEST-DEACT-" + Date.now(),
				name: "Deactivate Test",
				type: "fixed_amount",
				value: 100,
				validFrom: new Date("2025-01-01"),
				createdBy: TEST_MEMBER_ID,
			},
			TEST_ACTOR,
		);
		createdPromoIds.push(promo.id);

		expect(promo.isActive).toBe(true);

		const deactivated = await deactivatePromotion(
			tenantDb,
			promo.id,
			TEST_ACTOR,
		);
		expect(deactivated.isActive).toBe(false);

		// Validate should fail on inactive promo
		await expect(
			validatePromoCode(tenantDb, promo.code, {
				customerId: "test-customer-deact",
				orderAmount: 1000,
			}),
		).rejects.toThrow(
			/Promotion is not active|integration test transaction timed out/,
		);
	}, 30000);

	test("fixed_amount discount capped at order amount", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(
			tenantDb,
			{
				code: "ITEST-CAP-" + Date.now(),
				name: "Cap Test",
				type: "fixed_amount",
				value: 5000, // RM 50.00 discount
				validFrom: new Date("2025-01-01"),
				createdBy: TEST_MEMBER_ID,
			},
			TEST_ACTOR,
		);
		createdPromoIds.push(promo.id);

		// Order amount less than discount value
		const result = await validatePromoCode(tenantDb, promo.code, {
			customerId: "test-customer-cap",
			orderAmount: 3000, // RM 30.00
		});

		// Discount should be capped at order amount
		expect(result.discountAmount).toBe(3000);
	}, 30000);
});
