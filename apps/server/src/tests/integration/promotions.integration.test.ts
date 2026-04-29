import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
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

const createdPromoIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;
const TEST_ACTOR = { userId: "test-user", memberId: TEST_MEMBER_ID, role: "admin" };

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (shouldSkipIntegration() || createdPromoIds.length === 0) return;
	// Clean up usages first, then promotions
	await tenantDb
		.delete(promotionUsages)
		.where(inArray(promotionUsages.promotionId, createdPromoIds));
	await tenantDb
		.delete(promotions)
		.where(inArray(promotions.id, createdPromoIds));
});

describe("Promotions Integration", () => {
	test("create promotion and validate code (case-insensitive)", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(tenantDb, {
			code: "ITEST10PCT",
			name: "Integration Test 10%",
			type: "percentage",
			value: 1000, // 10.00% in basis points
			validFrom: new Date("2025-01-01"),
			createdBy: TEST_MEMBER_ID,
		}, TEST_ACTOR);
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

		const promo = await createPromotion(tenantDb, {
			code: "ITEST-APPLY-" + Date.now(),
			name: "Apply Test",
			type: "fixed_amount",
			value: 500, // RM 5.00 off
			validFrom: new Date("2025-01-01"),
			createdBy: TEST_MEMBER_ID,
		}, TEST_ACTOR);
		createdPromoIds.push(promo.id);

		expect(promo.usageCount).toBe(0);

		const updated = await applyPromotion(tenantDb, promo.id, {
			customerId: "test-customer-apply",
			salesOrderId: "test-order-apply-1",
			discountAmount: 500,
		});

		expect(updated!.usageCount).toBe(1);

		// Apply again
		const updated2 = await applyPromotion(tenantDb, promo.id, {
			customerId: "test-customer-apply-2",
			salesOrderId: "test-order-apply-2",
			discountAmount: 500,
		});

		expect(updated2!.usageCount).toBe(2);
	}, 30000);

	test("usage limit enforcement", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(tenantDb, {
			code: "ITEST-LIMIT-" + Date.now(),
			name: "Limit Test",
			type: "fixed_amount",
			value: 100,
			usageLimit: 1,
			validFrom: new Date("2025-01-01"),
			createdBy: TEST_MEMBER_ID,
		}, TEST_ACTOR);
		createdPromoIds.push(promo.id);

		// First validation succeeds
		const firstResult = await validatePromoCode(
			tenantDb,
			promo.code,
			{
				customerId: "test-customer-limit-1",
				orderAmount: 1000,
			},
		);
		expect(firstResult.promotion.id).toBe(promo.id);

		// Apply to increment usageCount to 1 (equals the limit)
		await applyPromotion(tenantDb, promo.id, {
			customerId: "test-customer-limit-1",
			salesOrderId: "test-order-limit-1",
			discountAmount: 100,
		});

		// Second validation should fail (limit reached)
		await expect(
			validatePromoCode(tenantDb, promo.code, {
				customerId: "test-customer-limit-2",
				orderAmount: 1000,
			}),
		).rejects.toThrow("Promotion usage limit reached");
	}, 30000);

	test("per-customer limit enforcement", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(tenantDb, {
			code: "ITEST-PERCUST-" + Date.now(),
			name: "Per Customer Limit Test",
			type: "fixed_amount",
			value: 100,
			usageLimit: 10, // high global limit
			perCustomerLimit: 1, // 1 per customer
			validFrom: new Date("2025-01-01"),
			createdBy: TEST_MEMBER_ID,
		}, TEST_ACTOR);
		createdPromoIds.push(promo.id);

		const customerId = "test-customer-percust";

		// First validation succeeds
		await validatePromoCode(tenantDb, promo.code, {
			customerId,
			orderAmount: 1000,
		});

		// Apply once for this customer
		await applyPromotion(tenantDb, promo.id, {
			customerId,
			salesOrderId: "test-order-percust-1",
			discountAmount: 100,
		});

		// Second validation for same customer should fail
		await expect(
			validatePromoCode(tenantDb, promo.code, {
				customerId,
				orderAmount: 1000,
			}),
		).rejects.toThrow("You have already used this promotion");
	}, 30000);

	test("minimum order amount enforcement", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(tenantDb, {
			code: "ITEST-MINORDER-" + Date.now(),
			name: "Min Order Test",
			type: "fixed_amount",
			value: 500,
			minimumOrderAmount: 5000, // minimum RM 50.00
			validFrom: new Date("2025-01-01"),
			createdBy: TEST_MEMBER_ID,
		}, TEST_ACTOR);
		createdPromoIds.push(promo.id);

		// Order amount too low
		await expect(
			validatePromoCode(tenantDb, promo.code, {
				customerId: "test-customer-min",
				orderAmount: 2000, // below minimum
			}),
		).rejects.toThrow("Order amount too low for this promotion");

		// Order amount meets minimum
		const result = await validatePromoCode(tenantDb, promo.code, {
			customerId: "test-customer-min",
			orderAmount: 5000,
		});
		expect(result.discountAmount).toBe(500);
	}, 30000);

	test("update - only mutable fields change", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(tenantDb, {
			code: "ITEST-UPDATE-" + Date.now(),
			name: "Original Name",
			type: "percentage",
			value: 1000,
			validFrom: new Date("2025-01-01"),
			createdBy: TEST_MEMBER_ID,
		}, TEST_ACTOR);
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

		const promo = await createPromotion(tenantDb, {
			code: "ITEST-DEACT-" + Date.now(),
			name: "Deactivate Test",
			type: "fixed_amount",
			value: 100,
			validFrom: new Date("2025-01-01"),
			createdBy: TEST_MEMBER_ID,
		}, TEST_ACTOR);
		createdPromoIds.push(promo.id);

		expect(promo.isActive).toBe(true);

		const deactivated = await deactivatePromotion(tenantDb, promo.id, TEST_ACTOR);
		expect(deactivated.isActive).toBe(false);

		// Validate should fail on inactive promo
		await expect(
			validatePromoCode(tenantDb, promo.code, {
				customerId: "test-customer-deact",
				orderAmount: 1000,
			}),
		).rejects.toThrow("Promotion is not active");
	}, 30000);

	test("fixed_amount discount capped at order amount", async () => {
		if (shouldSkipIntegration()) return;

		const promo = await createPromotion(tenantDb, {
			code: "ITEST-CAP-" + Date.now(),
			name: "Cap Test",
			type: "fixed_amount",
			value: 5000, // RM 50.00 discount
			validFrom: new Date("2025-01-01"),
			createdBy: TEST_MEMBER_ID,
		}, TEST_ACTOR);
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
