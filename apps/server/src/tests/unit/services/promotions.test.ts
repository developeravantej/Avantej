import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makePromotion } from "../../helpers/fixtures";

import {
	listPromotions,
	validatePromoCode,
	applyPromotion,
	createPromotion,
	updatePromotion,
	deactivatePromotion,
} from "@avantej-core/services/promotions.service";

let mockDb: ReturnType<typeof createMockTenantDb>;
const CUSTOMER_ID = "customer-uuid-1";

function selectChainResolving(value: unknown) {
	const chain: Record<string, unknown> = {};
	for (const m of ["from", "where", "orderBy", "limit", "offset", "leftJoin", "innerJoin", "groupBy", "having"]) {
		chain[m] = mock(() => chain);
	}
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(value).then(resolve);
	return chain;
}

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── listPromotions ──────────────────────────────────────────────────────────
describe("listPromotions", () => {
	test("returns promotions from select chain", async () => {
		const promos = [makePromotion(), makePromotion()];
		mockDb.select.mockReturnValueOnce(selectChainResolving(promos));

		const result = await listPromotions(mockDb, {});

		expect(result).toEqual(promos);
	});

	test("returns empty array when no promotions exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await listPromotions(mockDb, {});

		expect(result).toEqual([]);
	});
});

// ─── validatePromoCode — 9-step validation ──────────────────────────────────
describe("validatePromoCode", () => {
	test("returns discount for a valid percentage promotion", async () => {
		const promo = makePromotion({
			code: "SAVE10",
			type: "percentage",
			value: 1000,
			isActive: true,
			validFrom: new Date("2026-01-01"),
			validUntil: null,
			usageLimit: null,
			perCustomerLimit: 1,
			usageCount: 0,
			minimumOrderAmount: 0,
			maximumDiscount: null,
		});

		// Step 1: find promotion by code
		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));
		// Step 6: per-customer usage check
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ usageCount: 0 }]));

		const result = await validatePromoCode(mockDb, "SAVE10", {
			customerId: CUSTOMER_ID,
			orderAmount: 10000,
		});

		expect(result.discountAmount).toBe(1000);
		expect(result.promotion.code).toBe("SAVE10");
	});

	test("case-insensitive code matching (lowercase input)", async () => {
		const promo = makePromotion({
			code: "UPPERCASE",
			isActive: true,
			validFrom: new Date("2026-01-01"),
			usageCount: 0,
			minimumOrderAmount: 0,
		});

		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ usageCount: 0 }]));

		const result = await validatePromoCode(mockDb, "uppercase", {
			customerId: CUSTOMER_ID,
			orderAmount: 5000,
		});

		expect(result.promotion).toBeDefined();
		expect(mockDb.select).toHaveBeenCalledTimes(2);
	});

	test("throws NOT_FOUND when code does not exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		await expect(
			validatePromoCode(mockDb, "INVALID", { customerId: CUSTOMER_ID, orderAmount: 5000 }),
		).rejects.toThrow("Promotion code not found");
	});

	test("throws when promotion is inactive", async () => {
		const promo = makePromotion({ isActive: false });
		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));

		await expect(
			validatePromoCode(mockDb, promo.code as string, { customerId: CUSTOMER_ID, orderAmount: 5000 }),
		).rejects.toThrow("Promotion is not active");
	});

	test("throws when promotion has not started yet (validFrom in future)", async () => {
		const promo = makePromotion({ isActive: true, validFrom: new Date("2099-01-01") });
		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));

		await expect(
			validatePromoCode(mockDb, promo.code as string, { customerId: CUSTOMER_ID, orderAmount: 5000 }),
		).rejects.toThrow("Promotion not yet valid");
	});

	test("throws when promotion has expired (validUntil in past)", async () => {
		const promo = makePromotion({
			isActive: true,
			validFrom: new Date("2020-01-01"),
			validUntil: new Date("2020-12-31"),
		});
		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));

		await expect(
			validatePromoCode(mockDb, promo.code as string, { customerId: CUSTOMER_ID, orderAmount: 5000 }),
		).rejects.toThrow("Promotion has expired");
	});

	test("throws when global usage limit exceeded", async () => {
		const promo = makePromotion({
			isActive: true,
			validFrom: new Date("2026-01-01"),
			usageLimit: 100,
			usageCount: 100,
		});
		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));

		await expect(
			validatePromoCode(mockDb, promo.code as string, { customerId: CUSTOMER_ID, orderAmount: 5000 }),
		).rejects.toThrow("Promotion usage limit reached");
	});

	test("throws when per-customer limit exceeded", async () => {
		const promo = makePromotion({
			isActive: true,
			validFrom: new Date("2026-01-01"),
			perCustomerLimit: 1,
			usageCount: 0,
			usageLimit: null,
			minimumOrderAmount: 0,
		});
		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ usageCount: 1 }]));

		await expect(
			validatePromoCode(mockDb, promo.code as string, { customerId: CUSTOMER_ID, orderAmount: 5000 }),
		).rejects.toThrow("You have already used this promotion");
	});

	test("throws when order amount below minimumOrderAmount", async () => {
		const promo = makePromotion({
			isActive: true,
			validFrom: new Date("2026-01-01"),
			usageCount: 0,
			usageLimit: null,
			minimumOrderAmount: 10000,
			perCustomerLimit: 10,
		});
		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ usageCount: 0 }]));

		await expect(
			validatePromoCode(mockDb, promo.code as string, { customerId: CUSTOMER_ID, orderAmount: 5000 }),
		).rejects.toThrow("Order amount too low for this promotion");
	});

	test("percentage discount is capped by maximumDiscount", async () => {
		const promo = makePromotion({
			type: "percentage",
			value: 5000,
			maximumDiscount: 2000,
			isActive: true,
			validFrom: new Date("2026-01-01"),
			usageCount: 0,
			usageLimit: null,
			minimumOrderAmount: 0,
			perCustomerLimit: 10,
		});
		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ usageCount: 0 }]));

		const result = await validatePromoCode(mockDb, promo.code as string, {
			customerId: CUSTOMER_ID,
			orderAmount: 10000,
		});

		expect(result.discountAmount).toBe(2000);
	});

	test("fixed amount discount equals value", async () => {
		const promo = makePromotion({
			type: "fixed_amount",
			value: 500,
			isActive: true,
			validFrom: new Date("2026-01-01"),
			usageCount: 0,
			usageLimit: null,
			minimumOrderAmount: 0,
			perCustomerLimit: 10,
			maximumDiscount: null,
		});
		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ usageCount: 0 }]));

		const result = await validatePromoCode(mockDb, promo.code as string, {
			customerId: CUSTOMER_ID,
			orderAmount: 10000,
		});

		expect(result.discountAmount).toBe(500);
	});

	test("fixed amount discount does not exceed order amount", async () => {
		const promo = makePromotion({
			type: "fixed_amount",
			value: 10000,
			isActive: true,
			validFrom: new Date("2026-01-01"),
			usageCount: 0,
			usageLimit: null,
			minimumOrderAmount: 0,
			perCustomerLimit: 10,
			maximumDiscount: null,
		});
		mockDb.select.mockReturnValueOnce(selectChainResolving([promo]));
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ usageCount: 0 }]));

		const result = await validatePromoCode(mockDb, promo.code as string, {
			customerId: CUSTOMER_ID,
			orderAmount: 5000,
		});

		expect(result.discountAmount).toBe(5000);
	});
});

// ─── applyPromotion — transaction ────────────────────────────────────────────
describe("applyPromotion", () => {
	test("increments usageCount and creates promotionUsage within transaction", async () => {
		const updated = makePromotion({ usageCount: 1 });

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			const insertValues = { returning: mock(() => Promise.resolve([])) };
			tx.insert.mockReturnValueOnce({ values: mock(() => insertValues) });
			const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([updated])) })) };
			tx.update.mockReturnValueOnce({ set: mock(() => setChain) });
			return cb(tx);
		});

		const result = await applyPromotion(mockDb, "promo-id", {
			customerId: CUSTOMER_ID,
			salesOrderId: "order-1",
			discountAmount: 1000,
		});

		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		expect(result.usageCount).toBe(1);
	});
});

// ─── updatePromotion ─────────────────────────────────────────────────────────
describe("updatePromotion", () => {
	test("allows updating mutable fields", async () => {
		const updated = makePromotion({ name: "Updated Name", description: "New desc" });
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([updated])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await updatePromotion(mockDb, updated.id, { name: "Updated Name", description: "New desc" });

		expect(result.name).toBe("Updated Name");
	});

	test("throws when promotion not found", async () => {
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		await expect(updatePromotion(mockDb, "nonexistent", { name: "x" })).rejects.toThrow("Promotion not found");
	});
});

// ─── deactivatePromotion ─────────────────────────────────────────────────────
describe("deactivatePromotion", () => {
	test("sets isActive to false", async () => {
		const deactivated = makePromotion({ isActive: false });
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([deactivated])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await deactivatePromotion(mockDb, deactivated.id);

		expect(result.isActive).toBe(false);
	});
});
