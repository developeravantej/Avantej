import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mock Stripe SDK before importing the router under test.
const mockCheckoutCreate = mock(async (_params: unknown) => ({
	id: "cs_test_123",
	url: "https://checkout.stripe.com/c/cs_test_123",
}));
const mockBillingPortalCreate = mock(async (_params: unknown) => ({
	url: "https://billing.stripe.com/p/session_xyz",
}));

mock.module("@/lib/stripe", () => ({
	getStripeClient: () => ({
		checkout: { sessions: { create: mockCheckoutCreate } },
		billingPortal: { sessions: { create: mockBillingPortalCreate } },
	}),
	verifyWebhookSignature: async () => {
		throw new Error("not used in this test file");
	},
}));

import { subscriptionsRouter } from "./subscriptions";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { eq } from "drizzle-orm";

const TEST_ORG_ID = "00000000-0000-0000-0000-0000000000aa";
const TEST_SUB_DB_ID = "00000000-0000-0000-0000-0000000000bb";

function setEnv(overrides: Record<string, string | undefined>) {
	(globalThis as unknown as { env?: Record<string, unknown> }).env = {
		...((globalThis as unknown as { env?: Record<string, unknown> }).env ?? {}),
		...overrides,
	};
}

/** Extract the raw handler fn from an oRPC procedure (stored under `["~orpc"].handler`). */
function getHandler<T>(proc: unknown): (args: unknown) => Promise<T> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return ((proc as any)["~orpc"] as Record<string, unknown>)["handler"] as (args: unknown) => Promise<T>;
}

beforeEach(async () => {
	mockCheckoutCreate.mockClear();
	mockBillingPortalCreate.mockClear();
	setEnv({
		STRIPE_PRICE_BASIC: "price_basic_test",
		STRIPE_PRICE_PROFESSIONAL: "price_pro_test",
		STRIPE_PRICE_ENTERPRISE: "price_ent_test",
		WEB_APP_URL: "http://localhost:3001",
	});

	// Clean db
	await controlPanelDb
		.delete(subscriptions)
		.where(eq(subscriptions.id, TEST_SUB_DB_ID));
	await controlPanelDb.delete(organizations).where(eq(organizations.id, TEST_ORG_ID));
});

async function seedOrg(opts: { trialEndsAt?: Date | null; subscriptionId?: string | null }) {
	await controlPanelDb.insert(organizations).values({
		id: TEST_ORG_ID,
		name: "Test Tenant",
		slug: `test-tenant-${Date.now()}`,
		neonProjectId: `stub-neon-${Date.now()}`,
		connectionString: "stub",
		paymentStatus: "active",
		trialEndsAt: opts.trialEndsAt ?? null,
		subscriptionId: opts.subscriptionId ?? null,
	} as never);
}

describe("subscriptions.createCheckoutSession", () => {
	it("creates a Stripe Checkout Session for the chosen tier", async () => {
		await seedOrg({});

		const fakeContext = {
			session: { user: { id: "user_test", email: "tenant@example.com" } },
			organizationId: TEST_ORG_ID,
		};
		const handler = getHandler<{ checkoutUrl: string; sessionId: string }>(
			subscriptionsRouter.createCheckoutSession,
		);

		const result = await handler({
			context: fakeContext,
			input: { tier: "professional" },
		});

		expect(result.checkoutUrl).toContain("checkout.stripe.com");
		expect(result.sessionId).toBe("cs_test_123");
		expect(mockCheckoutCreate).toHaveBeenCalledTimes(1);

		const args = (mockCheckoutCreate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as Record<string, unknown>;
		expect(args.mode).toBe("subscription");
		expect((args.line_items as Array<{ price: string; quantity: number }>)[0]!.price).toBe("price_pro_test");
		expect(args.client_reference_id).toBe(TEST_ORG_ID);
		expect(args.customer_email).toBe("tenant@example.com");
		expect((args.subscription_data as { metadata: Record<string, string> }).metadata.organizationId).toBe(TEST_ORG_ID);
	});

	it("throws BAD_REQUEST when organizationId is missing from context", async () => {
		const fakeContext = {
			session: { user: { id: "user_test", email: "tenant@example.com" } },
		};
		const handler = getHandler<unknown>(subscriptionsRouter.createCheckoutSession);
		await expect(
			handler({ context: fakeContext, input: { tier: "basic" } }),
		).rejects.toThrow(/organization/i);
	});

	it("throws when STRIPE_PRICE_<TIER> env var is unset", async () => {
		await seedOrg({});
		setEnv({ STRIPE_PRICE_PROFESSIONAL: undefined });
		const fakeContext = {
			session: { user: { id: "user_test", email: "tenant@example.com" } },
			organizationId: TEST_ORG_ID,
		};
		const handler = getHandler<unknown>(subscriptionsRouter.createCheckoutSession);
		await expect(
			handler({ context: fakeContext, input: { tier: "professional" } }),
		).rejects.toThrow(/STRIPE_PRICE_PROFESSIONAL/);
	});
});

describe("subscriptions.getStatus", () => {
	it("returns 'trialing' when org has future trialEndsAt and no sub", async () => {
		await seedOrg({
			trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			subscriptionId: null,
		});

		const fakeContext = {
			session: { user: { id: "user_test" } },
			organizationId: TEST_ORG_ID,
		};
		const handler = getHandler<{ status: string; tier: string | null }>(
			subscriptionsRouter.getStatus,
		);

		const result = await handler({ context: fakeContext, input: {} });
		expect(result.status).toBe("trialing");
		expect(result.tier).toBeNull();
	});

	it("returns 'none' when no sub and no trial (or trial expired)", async () => {
		await seedOrg({
			trialEndsAt: new Date(Date.now() - 1000),
			subscriptionId: null,
		});

		const fakeContext = {
			session: { user: { id: "user_test" } },
			organizationId: TEST_ORG_ID,
		};
		const handler = getHandler<{ status: string }>(subscriptionsRouter.getStatus);
		const result = await handler({ context: fakeContext, input: {} });
		expect(result.status).toBe("none");
	});

	it("returns subscription state when an active sub exists", async () => {
		// Insert a sub first.
		await controlPanelDb.insert(subscriptions).values({
			id: TEST_SUB_DB_ID,
			stripeSubscriptionId: "sub_test_router_001",
			stripeCustomerId: "cus_test",
			stripePriceId: "price_basic_test",
			tier: "basic",
			organizationCountLimit: 1,
			applicationFeeBps: 300,
			currency: "usd",
			status: "active",
			cancelAtPeriodEnd: false,
		} as never);
		await seedOrg({ subscriptionId: TEST_SUB_DB_ID });

		const fakeContext = {
			session: { user: { id: "user_test" } },
			organizationId: TEST_ORG_ID,
		};
		const handler = getHandler<{ status: string; tier: string | null }>(
			subscriptionsRouter.getStatus,
		);
		const result = await handler({ context: fakeContext, input: {} });
		expect(result.status).toBe("active");
		expect(result.tier).toBe("basic");

		// Cleanup the sub row we inserted.
		await controlPanelDb.delete(subscriptions).where(eq(subscriptions.id, TEST_SUB_DB_ID));
	});
});

describe("subscriptions.billingPortal", () => {
	it("returns a Customer Portal URL when an active sub exists", async () => {
		await controlPanelDb.insert(subscriptions).values({
			id: TEST_SUB_DB_ID,
			stripeSubscriptionId: "sub_test_router_002",
			stripeCustomerId: "cus_portal_test",
			stripePriceId: "price_basic_test",
			tier: "basic",
			organizationCountLimit: 1,
			applicationFeeBps: 300,
			currency: "usd",
			status: "active",
			cancelAtPeriodEnd: false,
		} as never);
		await seedOrg({ subscriptionId: TEST_SUB_DB_ID });

		const fakeContext = {
			session: { user: { id: "user_test" } },
			organizationId: TEST_ORG_ID,
		};
		const handler = getHandler<{ portalUrl: string }>(subscriptionsRouter.billingPortal);
		const result = await handler({ context: fakeContext, input: {} });
		expect(result.portalUrl).toContain("billing.stripe.com");
		expect(mockBillingPortalCreate).toHaveBeenCalledTimes(1);

		const args = (mockBillingPortalCreate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as Record<string, unknown>;
		expect(args.customer).toBe("cus_portal_test");
		expect(args.return_url).toContain("/dashboard/billing");

		await controlPanelDb.delete(subscriptions).where(eq(subscriptions.id, TEST_SUB_DB_ID));
	});

	it("throws when org has no subscription", async () => {
		await seedOrg({ subscriptionId: null });

		const fakeContext = {
			session: { user: { id: "user_test" } },
			organizationId: TEST_ORG_ID,
		};
		const handler = getHandler<unknown>(subscriptionsRouter.billingPortal);
		await expect(handler({ context: fakeContext, input: {} })).rejects.toThrow(/no active subscription/i);
	});
});
