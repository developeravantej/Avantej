import { describe, it, expect, beforeEach } from "bun:test";
import {
	upsertSubscriptionFromStripe,
	markPastDue,
	markActive,
	computeTierFromPriceId,
} from "./saas-subscription.service";
import { controlPanelDb } from "@/lib/db";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { eq } from "drizzle-orm";

const TEST_SUB_ID = "sub_test_lifecycle_001";

function setEnv(overrides: Record<string, string | undefined>) {
	(globalThis as unknown as { env?: Record<string, unknown> }).env = {
		...((globalThis as unknown as { env?: Record<string, unknown> }).env ?? {}),
		...overrides,
	};
}

beforeEach(async () => {
	await controlPanelDb
		.delete(subscriptions)
		.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
	setEnv({
		STRIPE_PRICE_BASIC: "price_basic_test",
		STRIPE_PRICE_PROFESSIONAL: "price_pro_test",
		STRIPE_PRICE_ENTERPRISE: "price_ent_test",
	});
});

describe("computeTierFromPriceId", () => {
	it("maps configured price IDs to tier names", () => {
		expect(computeTierFromPriceId("price_basic_test")).toBe("basic");
		expect(computeTierFromPriceId("price_pro_test")).toBe("professional");
		expect(computeTierFromPriceId("price_ent_test")).toBe("enterprise");
	});

	it("falls back to basic for an unknown price id", () => {
		expect(computeTierFromPriceId("price_does_not_exist")).toBe("basic");
	});
});

function buildFakeSub(priceId: string, overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: TEST_SUB_ID,
		customer: "cus_test_001",
		status: "active",
		items: { data: [{ price: { id: priceId, currency: "usd" } }] },
		current_period_start: 1715000000,
		current_period_end: 1717678400,
		cancel_at_period_end: false,
		canceled_at: null,
		trial_end: null,
		metadata: {},
		...overrides,
	} as any;
}

describe("upsertSubscriptionFromStripe", () => {
	it("inserts a new row when the subscription does not exist", async () => {
		await upsertSubscriptionFromStripe(buildFakeSub("price_pro_test"));
		const [row] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
		expect(row.tier).toBe("professional");
		expect(row.applicationFeeBps).toBe(200);
		expect(row.status).toBe("active");
		expect(row.stripeCustomerId).toBe("cus_test_001");
		expect(row.stripePriceId).toBe("price_pro_test");
		expect(row.currency).toBe("usd");
	});

	it("is idempotent (second upsert reuses the row)", async () => {
		await upsertSubscriptionFromStripe(buildFakeSub("price_basic_test"));
		await upsertSubscriptionFromStripe(buildFakeSub("price_basic_test"));
		const rows = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
		expect(rows.length).toBe(1);
		expect(rows[0].applicationFeeBps).toBe(300);
	});

	it("updates fields on second upsert when tier changes", async () => {
		await upsertSubscriptionFromStripe(buildFakeSub("price_basic_test"));
		await upsertSubscriptionFromStripe(buildFakeSub("price_ent_test"));
		const [row] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
		expect(row.tier).toBe("enterprise");
		expect(row.applicationFeeBps).toBe(150);
	});

	it("persists trial_end when present", async () => {
		const trialEnd = 1717000000; // unix seconds
		await upsertSubscriptionFromStripe(
			buildFakeSub("price_pro_test", { trial_end: trialEnd }),
		);
		const [row] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
		expect(row.trialEndsAt).not.toBeNull();
		expect(row.trialEndsAt!.getTime()).toBe(trialEnd * 1000);
	});

	it("persists canceled_at and cancel_at_period_end=true", async () => {
		await upsertSubscriptionFromStripe(
			buildFakeSub("price_pro_test", {
				status: "active",
				cancel_at_period_end: true,
				canceled_at: 1716500000,
			}),
		);
		const [row] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
		expect(row.cancelAtPeriodEnd).toBe(true);
		expect(row.canceledAt).not.toBeNull();
	});
});

describe("markPastDue / markActive", () => {
	it("markPastDue sets pastDueAt and gracePeriodEndsAt 7 days later", async () => {
		await upsertSubscriptionFromStripe(buildFakeSub("price_basic_test"));
		await markPastDue(TEST_SUB_ID);
		const [row] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
		expect(row.status).toBe("past_due");
		expect(row.pastDueAt).not.toBeNull();
		expect(row.gracePeriodEndsAt).not.toBeNull();
		const diff = row.gracePeriodEndsAt!.getTime() - row.pastDueAt!.getTime();
		expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
	});

	it("markActive clears pastDueAt and gracePeriodEndsAt", async () => {
		await upsertSubscriptionFromStripe(buildFakeSub("price_basic_test"));
		await markPastDue(TEST_SUB_ID);
		await markActive(TEST_SUB_ID);
		const [row] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
		expect(row.status).toBe("active");
		expect(row.pastDueAt).toBeNull();
		expect(row.gracePeriodEndsAt).toBeNull();
	});

	it("markPastDue throws when subscription does not exist", async () => {
		await expect(markPastDue("sub_does_not_exist")).rejects.toThrow(/no row/i);
	});

	it("markActive throws when subscription does not exist", async () => {
		await expect(markActive("sub_does_not_exist")).rejects.toThrow(/no row/i);
	});
});
