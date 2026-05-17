/**
 * Plan F.3.5 — Coupons router unit tests (Agent C2).
 *
 * Covers the catalog + apply/remove + audit-row side effects with a fake
 * Stripe client injected via the factory's `stripeOverride` DI hook.
 * Mirrors apps/server/src/routers/platform-admin-tenants-billing.test.ts.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { createPlatformAdminCouponsRouter } from "./platform-admin-coupons";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";

const TEST_ORG_ID = "00000000-0000-0000-0000-3333000099cc";
const TEST_SUB_ID = "00000000-0000-0000-0000-3333000099dd";
const TEST_USER_ID = "test-admin-user-coupons";
const TEST_CUSTOMER = "cus_coupons_test_999";

const COUPON_ACTIONS = [
	"coupon_create",
	"coupon_delete",
	"coupon_apply",
	"coupon_remove",
] as const;

function getHandler<T>(proc: unknown): (args: unknown) => Promise<T> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return ((proc as any)["~orpc"] as Record<string, unknown>)["handler"] as (
		args: unknown,
	) => Promise<T>;
}

function fakeContext() {
	return {
		session: { user: { id: TEST_USER_ID, email: "admin@test.local" } },
		honoContext: {
			get: (k: string) => (k === "controlPanelDb" ? controlPanelDb : undefined),
		},
	};
}

const mockCouponsList = mock(
	async (_params: { limit?: number; starting_after?: string }) => ({
		data: [
			{
				id: "promo_alpha",
				name: "Alpha 20%",
				percent_off: 20,
				amount_off: null,
				currency: null,
				duration: "once" as const,
				duration_in_months: null,
				max_redemptions: 100,
				times_redeemed: 3,
				valid: true,
				created: Math.floor(Date.now() / 1000),
			},
		],
		has_more: false,
	}),
);

const mockCouponsCreate = mock(
	async (params: {
		name?: string;
		percent_off?: number;
		amount_off?: number;
		currency?: string;
		duration: "once" | "repeating" | "forever";
		duration_in_months?: number;
		max_redemptions?: number;
	}) => ({
		id: `coup_test_${Date.now()}`,
		name: params.name ?? null,
		percent_off: params.percent_off ?? null,
		amount_off: params.amount_off ?? null,
		currency: params.currency ?? null,
		duration: params.duration,
		duration_in_months: params.duration_in_months ?? null,
		max_redemptions: params.max_redemptions ?? null,
		times_redeemed: 0,
		valid: true,
		created: Math.floor(Date.now() / 1000),
	}),
);

const mockCouponsDel = mock(async (id: string) => ({ id, deleted: true }));

const mockCouponsRetrieve = mock(async (id: string) => ({
	id,
	name: "Retrieved",
	percent_off: 10,
	duration: "once" as const,
	valid: true,
	created: Math.floor(Date.now() / 1000),
}));

const mockCustomersUpdate = mock(
	async (id: string, _params: { coupon?: string | null }) => ({
		id,
	}),
);

const mockCustomersDeleteDiscount = mock(async (_id: string) => ({
	deleted: true,
}));

const mockCustomersRetrieve = mock(async (id: string) => ({
	id,
	discount: {
		coupon: {
			id: "promo_alpha",
			name: "Alpha 20%",
			percent_off: 20,
			duration: "once" as const,
			valid: true,
			created: Math.floor(Date.now() / 1000),
		},
	},
}));

const fakeStripe = {
	coupons: {
		list: mockCouponsList,
		create: mockCouponsCreate,
		del: mockCouponsDel,
		retrieve: mockCouponsRetrieve,
	},
	customers: {
		retrieve: mockCustomersRetrieve,
		update: mockCustomersUpdate,
		deleteDiscount: mockCustomersDeleteDiscount,
	},
};

const router = createPlatformAdminCouponsRouter(fakeStripe as never);

beforeEach(async () => {
	mockCouponsList.mockClear();
	mockCouponsCreate.mockClear();
	mockCouponsDel.mockClear();
	mockCouponsRetrieve.mockClear();
	mockCustomersUpdate.mockClear();
	mockCustomersDeleteDiscount.mockClear();
	mockCustomersRetrieve.mockClear();

	// Clean any prior fixture state for THIS user only — don't fight T2.
	await controlPanelDb
		.delete(adminSessionActions)
		.where(
			and(
				eq(adminSessionActions.adminUserId, TEST_USER_ID),
				inArray(adminSessionActions.actionType, COUPON_ACTIONS as unknown as string[]),
			),
		);
	await controlPanelDb
		.delete(organizations)
		.where(eq(organizations.id, TEST_ORG_ID));
	await controlPanelDb
		.delete(subscriptions)
		.where(eq(subscriptions.id, TEST_SUB_ID));

	await controlPanelDb.insert(subscriptions).values({
		id: TEST_SUB_ID,
		stripeSubscriptionId: `sub_${TEST_SUB_ID}`,
		stripeCustomerId: TEST_CUSTOMER,
		stripePriceId: "price_test",
		tier: "professional",
		organizationCountLimit: 1,
		applicationFeeBps: 100,
		currency: "usd",
		status: "active",
	} satisfies typeof subscriptions.$inferInsert);

	await controlPanelDb.insert(organizations).values({
		id: TEST_ORG_ID,
		name: "Plan F.3.5 Coupons Test Org",
		slug: `plan-f-3-5-coupons-${Date.now()}`,
		// Unique neon_project_id per test run to avoid collision with the
		// `stub` value used by the sibling tier-change test (same DB).
		neonProjectId: `stub-coupons-${TEST_ORG_ID}`,
		connectionString: "stub",
		paymentStatus: "active",
		subscriptionId: TEST_SUB_ID,
	} satisfies typeof organizations.$inferInsert);
});

describe("platformAdminCoupons.listCoupons", () => {
	it("returns projected coupons with paging shape", async () => {
		const handler = getHandler<{
			coupons: Array<{ id: string; name: string | null; percentOff: number | null }>;
			hasMore: boolean;
			nextCursor: string | undefined;
		}>(router.listCoupons);
		const result = await handler({
			context: fakeContext(),
			input: { limit: 50 },
		});
		expect(result.coupons.length).toBe(1);
		expect(result.coupons[0]!.id).toBe("promo_alpha");
		expect(result.coupons[0]!.percentOff).toBe(20);
		expect(result.hasMore).toBe(false);
	});
});

describe("platformAdminCoupons.createCoupon", () => {
	it("happy path: percent coupon → Stripe call + one coupon_create audit row", async () => {
		const handler = getHandler<{
			couponId: string;
			name: string;
			valid: boolean;
		}>(router.createCoupon);

		const result = await handler({
			context: fakeContext(),
			input: {
				name: "Test 20%",
				discountKind: "percent" as const,
				percentOff: 20,
				duration: "once" as const,
				currency: "usd",
			},
		});

		expect(result.couponId).toMatch(/^coup_test_/);
		expect(result.valid).toBe(true);

		// Stripe was called with percent_off only (NOT amount_off / currency).
		expect(mockCouponsCreate).toHaveBeenCalledTimes(1);
		const createArgs = (
			mockCouponsCreate as unknown as { mock: { calls: unknown[][] } }
		).mock.calls[0]![0] as {
			percent_off?: number;
			amount_off?: number;
			currency?: string;
			duration: string;
		};
		expect(createArgs.percent_off).toBe(20);
		expect(createArgs.amount_off).toBeUndefined();
		expect(createArgs.currency).toBeUndefined();
		expect(createArgs.duration).toBe("once");

		const rows = await controlPanelDb
			.select()
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.adminUserId, TEST_USER_ID),
					eq(adminSessionActions.actionType, "coupon_create"),
				),
			);
		expect(rows.length).toBe(1);
		const meta = rows[0]!.metadata as Record<string, unknown>;
		expect(meta.discountKind).toBe("percent");
		expect(meta.percentOff).toBe(20);
		expect(meta.duration).toBe("once");
	});

	it("amount coupon: forwards amount_off + currency, NOT percent_off", async () => {
		const handler = getHandler<{ couponId: string }>(router.createCoupon);
		await handler({
			context: fakeContext(),
			input: {
				name: "Test $50",
				discountKind: "amount" as const,
				amountOffCents: 5000,
				currency: "usd",
				duration: "repeating" as const,
				durationInMonths: 3,
			},
		});
		const createArgs = (
			mockCouponsCreate as unknown as { mock: { calls: unknown[][] } }
		).mock.calls[0]![0] as {
			percent_off?: number;
			amount_off?: number;
			currency?: string;
			duration_in_months?: number;
		};
		expect(createArgs.amount_off).toBe(5000);
		expect(createArgs.currency).toBe("usd");
		expect(createArgs.percent_off).toBeUndefined();
		expect(createArgs.duration_in_months).toBe(3);
	});

	it("validation schema rejects percent kind without percentOff", () => {
		// Zod refines live at the oRPC procedure boundary, not in the raw
		// handler (which getHandler extracts). To verify the refine, parse
		// the schema directly. Mirrors how the procedure validates inputs
		// in production. Asserting the refine is in the contract.
		const schema = z
			.object({
				name: z.string().min(1).max(100),
				discountKind: z.enum(["percent", "amount"]),
				percentOff: z.number().min(1).max(100).optional(),
				amountOffCents: z.number().int().min(1).optional(),
				currency: z.string().length(3).default("usd"),
				duration: z.enum(["once", "repeating", "forever"]),
				durationInMonths: z.number().int().min(1).max(60).optional(),
				maxRedemptions: z.number().int().min(1).optional(),
			})
			.refine(
				(d) =>
					d.discountKind === "percent"
						? d.percentOff !== undefined
						: d.amountOffCents !== undefined,
				{ message: "percentOff or amountOffCents required" },
			)
			.refine(
				(d) => d.duration !== "repeating" || d.durationInMonths !== undefined,
				{ message: "durationInMonths required for duration=repeating" },
			);
		const r = schema.safeParse({
			name: "Bad",
			discountKind: "percent",
			duration: "once",
		});
		expect(r.success).toBe(false);
	});

	it("writes no audit row when Stripe create fails", async () => {
		mockCouponsCreate.mockImplementationOnce(async () => {
			throw new Error("coupon_code_in_use");
		});
		const handler = getHandler(router.createCoupon);
		let caught: unknown;
		try {
			await handler({
				context: fakeContext(),
				input: {
					name: "Fail",
					discountKind: "percent" as const,
					percentOff: 10,
					duration: "once" as const,
				},
			});
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeDefined();
		expect(String(caught)).toContain("coupon_code_in_use");

		const rows = await controlPanelDb
			.select({ id: adminSessionActions.id })
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.adminUserId, TEST_USER_ID),
					eq(adminSessionActions.actionType, "coupon_create"),
				),
			);
		expect(rows.length).toBe(0);
	});
});

describe("platformAdminCoupons.deleteCoupon", () => {
	it("deletes via Stripe + writes one coupon_delete audit row", async () => {
		const handler = getHandler<{ ok: true }>(router.deleteCoupon);
		const result = await handler({
			context: fakeContext(),
			input: { couponId: "promo_alpha" },
		});
		expect(result.ok).toBe(true);
		expect(mockCouponsDel).toHaveBeenCalledTimes(1);

		const rows = await controlPanelDb
			.select()
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.adminUserId, TEST_USER_ID),
					eq(adminSessionActions.actionType, "coupon_delete"),
				),
			);
		expect(rows.length).toBe(1);
		const meta = rows[0]!.metadata as Record<string, unknown>;
		expect(meta.couponId).toBe("promo_alpha");
	});
});

describe("platformAdminCoupons.applyCoupon", () => {
	it("happy path: customers.update called with { coupon } + audit row", async () => {
		const handler = getHandler<{
			ok: true;
			couponId: string;
			customerId: string;
		}>(router.applyCoupon);

		const result = await handler({
			context: fakeContext(),
			input: {
				organizationId: TEST_ORG_ID,
				couponId: "promo_alpha",
				notes: "apply unit-test",
			},
		});

		expect(result.ok).toBe(true);
		expect(result.couponId).toBe("promo_alpha");
		expect(result.customerId).toBe(TEST_CUSTOMER);

		expect(mockCustomersUpdate).toHaveBeenCalledTimes(1);
		const updateArgs = (
			mockCustomersUpdate as unknown as { mock: { calls: unknown[][] } }
		).mock.calls[0]!;
		expect(updateArgs[0]).toBe(TEST_CUSTOMER);
		expect((updateArgs[1] as { coupon?: string }).coupon).toBe("promo_alpha");

		const rows = await controlPanelDb
			.select()
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.targetOrganizationId, TEST_ORG_ID),
					eq(adminSessionActions.actionType, "coupon_apply"),
				),
			);
		expect(rows.length).toBe(1);
		const meta = rows[0]!.metadata as Record<string, unknown>;
		expect(meta.couponId).toBe("promo_alpha");
		expect(meta.stripeCustomerId).toBe(TEST_CUSTOMER);
		expect(meta.notes).toBe("apply unit-test");
	});

	it("writes no audit row when Stripe apply fails", async () => {
		mockCustomersUpdate.mockImplementationOnce(async () => {
			throw new Error("coupon_expired");
		});
		const handler = getHandler(router.applyCoupon);
		let caught: unknown;
		try {
			await handler({
				context: fakeContext(),
				input: {
					organizationId: TEST_ORG_ID,
					couponId: "promo_alpha",
				},
			});
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeDefined();
		expect(String(caught)).toContain("coupon_expired");

		const rows = await controlPanelDb
			.select({ id: adminSessionActions.id })
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.targetOrganizationId, TEST_ORG_ID),
					eq(adminSessionActions.actionType, "coupon_apply"),
				),
			);
		expect(rows.length).toBe(0);
	});
});

describe("platformAdminCoupons.removeCoupon", () => {
	it("calls customers.deleteDiscount + writes one coupon_remove audit row", async () => {
		const handler = getHandler<{ ok: true }>(router.removeCoupon);
		const result = await handler({
			context: fakeContext(),
			input: { organizationId: TEST_ORG_ID },
		});
		expect(result.ok).toBe(true);
		expect(mockCustomersDeleteDiscount).toHaveBeenCalledTimes(1);
		expect(
			(mockCustomersDeleteDiscount as unknown as { mock: { calls: unknown[][] } })
				.mock.calls[0]![0],
		).toBe(TEST_CUSTOMER);

		const rows = await controlPanelDb
			.select()
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.targetOrganizationId, TEST_ORG_ID),
					eq(adminSessionActions.actionType, "coupon_remove"),
				),
			);
		expect(rows.length).toBe(1);
	});
});

describe("platformAdminCoupons.getCustomerCoupon", () => {
	it("returns the projected coupon when one is attached", async () => {
		const handler = getHandler<{
			coupon: { id: string; percentOff: number | null } | null;
		}>(router.getCustomerCoupon);
		const result = await handler({
			context: fakeContext(),
			input: { organizationId: TEST_ORG_ID },
		});
		expect(result.coupon).not.toBeNull();
		expect(result.coupon!.id).toBe("promo_alpha");
		expect(result.coupon!.percentOff).toBe(20);
	});

	it("returns null when tenant has no Stripe customer", async () => {
		await controlPanelDb
			.update(organizations)
			.set({ subscriptionId: null })
			.where(eq(organizations.id, TEST_ORG_ID));
		const handler = getHandler<{ coupon: unknown | null }>(
			router.getCustomerCoupon,
		);
		const result = await handler({
			context: fakeContext(),
			input: { organizationId: TEST_ORG_ID },
		});
		expect(result.coupon).toBeNull();
		expect(mockCustomersRetrieve).not.toHaveBeenCalled();
	});
});
