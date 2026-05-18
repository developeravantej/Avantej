/**
 * Plan F.3-A — Tenant Billing router unit tests.
 *
 * Covers the refundInvoice happy-path + audit-row side effect that the
 * e2e spec defers (would require real Stripe). Uses the factory's
 * `stripeOverride` DI hook with a fake Stripe client so no network call
 * is made.
 *
 * Pattern mirrors apps/server/src/routers/subscriptions.integration.test.ts
 * — extracts the raw handler from the oRPC procedure and calls it with a
 * synthetic context that includes honoContext-style cpDb accessor.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { eq, and } from "drizzle-orm";
import { createPlatformAdminTenantsBillingRouter } from "./platform-admin-tenants-billing";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";

const TEST_ORG_ID = "00000000-0000-0000-0000-3333000099aa";
const TEST_SUB_ID = "00000000-0000-0000-0000-3333000099bb";
const TEST_USER_ID = "test-admin-user-billing";
const TEST_CUSTOMER = "cus_billing_test_999";

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

const mockRefundsCreate = mock(
	async (_params: {
		payment_intent: string;
		amount?: number;
		reason?: string;
	}) => ({
		id: "re_test_999",
		status: "succeeded",
		amount: 1000,
	}),
);

const mockInvoicesRetrieve = mock(async (_id: string, _params?: unknown) => ({
	id: "in_test_999",
	number: "TEST-INV-999",
	status: "paid",
	amount_paid: 1000,
	amount_due: 0,
	currency: "usd",
	created: Math.floor(Date.now() / 1000),
	hosted_invoice_url: "https://invoice.stripe.test/in_test_999",
	invoice_pdf: "https://invoice.stripe.test/in_test_999.pdf",
	payment_intent: "pi_test_999",
	charge: {
		id: "ch_test_999",
		refunded: false,
		amount_refunded: 0,
	},
}));

// Plan F.3.5 (Agent T2) — Stripe Subscription mocks for tier change.
const mockSubscriptionsRetrieve = mock(async (_id: string) => ({
	id: `sub_${TEST_SUB_ID}`,
	items: { data: [{ id: "si_test_item_1", price: { id: "price_test" } }] },
}));
const mockSubscriptionsUpdate = mock(
	async (
		_id: string,
		_params: {
			items: Array<{ id: string; price: string }>;
			proration_behavior?: string;
		},
	) => ({
		id: `sub_${TEST_SUB_ID}`,
		items: {
			data: [
				{
					id: "si_test_item_1",
					price: { id: _params.items?.[0]?.price ?? "price_test" },
				},
			],
		},
	}),
);
const mockInvoicesCreatePreview = mock(async (_params: unknown) => ({
	id: "in_preview_999",
	amount_due: 5000,
	total: 5000,
	currency: "usd",
}));

const fakeStripe = {
	invoices: {
		list: mock(async () => ({ data: [], has_more: false })),
		retrieve: mockInvoicesRetrieve,
		createPreview: mockInvoicesCreatePreview,
	},
	refunds: { create: mockRefundsCreate },
	customers: {
		retrieve: mock(async () => ({ id: TEST_CUSTOMER, balance: 0, currency: "usd" })),
	},
	subscriptions: {
		retrieve: mockSubscriptionsRetrieve,
		update: mockSubscriptionsUpdate,
	},
};

const router = createPlatformAdminTenantsBillingRouter(fakeStripe as never);

beforeEach(async () => {
	mockRefundsCreate.mockClear();
	mockInvoicesRetrieve.mockClear();
	mockSubscriptionsRetrieve.mockClear();
	mockSubscriptionsUpdate.mockClear();
	mockInvoicesCreatePreview.mockClear();

	// Clean any prior fixture state.
	await controlPanelDb
		.delete(adminSessionActions)
		.where(
			and(
				eq(adminSessionActions.adminUserId, TEST_USER_ID),
				eq(adminSessionActions.actionType, "tenant_invoice_refund"),
			),
		);
	await controlPanelDb
		.delete(adminSessionActions)
		.where(
			and(
				eq(adminSessionActions.adminUserId, TEST_USER_ID),
				eq(adminSessionActions.actionType, "tenant_tier_change"),
			),
		);
	await controlPanelDb.delete(organizations).where(eq(organizations.id, TEST_ORG_ID));
	await controlPanelDb.delete(subscriptions).where(eq(subscriptions.id, TEST_SUB_ID));

	// Seed subscription + org linked to it.
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
		name: "Plan F.3-A Test Org",
		slug: `plan-f-3-a-test-${Date.now()}`,
		neonProjectId: "stub",
		connectionString: "stub",
		paymentStatus: "active",
		subscriptionId: TEST_SUB_ID,
	} satisfies typeof organizations.$inferInsert);
});

describe("platformAdminTenantsBilling.refundInvoice", () => {
	it("issues a Stripe refund and writes one tenant_invoice_refund audit row", async () => {
		const handler = getHandler<{
			ok: true;
			refundId: string;
			amountCents: number;
			status: string;
		}>(router.refundInvoice);

		const result = await handler({
			context: fakeContext(),
			input: {
				organizationId: TEST_ORG_ID,
				invoiceId: "in_test_999",
				amountCents: 1000,
				reason: "requested_by_customer",
				notes: "unit-test note",
			},
		});

		expect(result.ok).toBe(true);
		expect(result.refundId).toBe("re_test_999");
		expect(result.amountCents).toBe(1000);
		expect(result.status).toBe("succeeded");

		// Stripe was called with the right shape.
		expect(mockRefundsCreate).toHaveBeenCalledTimes(1);
		const refundArgs = (
			mockRefundsCreate as unknown as { mock: { calls: unknown[][] } }
		).mock.calls[0]![0] as {
			payment_intent: string;
			amount?: number;
			reason?: string;
		};
		expect(refundArgs.payment_intent).toBe("pi_test_999");
		expect(refundArgs.amount).toBe(1000);
		expect(refundArgs.reason).toBe("requested_by_customer");

		// One audit row with the right payload.
		const rows = await controlPanelDb
			.select()
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.targetOrganizationId, TEST_ORG_ID),
					eq(adminSessionActions.actionType, "tenant_invoice_refund"),
				),
			);
		expect(rows.length).toBe(1);
		const row = rows[0]!;
		expect(row.adminUserId).toBe(TEST_USER_ID);
		const meta = row.metadata as Record<string, unknown>;
		expect(meta.invoiceId).toBe("in_test_999");
		expect(meta.paymentIntentId).toBe("pi_test_999");
		expect(meta.refundId).toBe("re_test_999");
		expect(meta.reason).toBe("requested_by_customer");
		expect(meta.notes).toBe("unit-test note");
		expect(meta.amountCents).toBe(1000);
		expect(meta.status).toBe("succeeded");
	});

	it("writes no audit row when Stripe refund creation fails", async () => {
		mockRefundsCreate.mockImplementationOnce(async () => {
			throw new Error("card_not_refundable");
		});

		const handler = getHandler<{ ok: true }>(router.refundInvoice);

		let caught: unknown;
		try {
			await handler({
				context: fakeContext(),
				input: {
					organizationId: TEST_ORG_ID,
					invoiceId: "in_test_999",
					reason: "requested_by_customer",
				},
			});
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeDefined();
		expect(String(caught)).toContain("card_not_refundable");

		const rows = await controlPanelDb
			.select({ id: adminSessionActions.id })
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.targetOrganizationId, TEST_ORG_ID),
					eq(adminSessionActions.actionType, "tenant_invoice_refund"),
				),
			);
		expect(rows.length).toBe(0);
	});
});

describe("platformAdminTenantsBilling.listInvoices", () => {
	it("returns empty payload when tenant has no Stripe customer", async () => {
		// Detach subscription from org so resolveStripeCustomerId returns null.
		await controlPanelDb
			.update(organizations)
			.set({ subscriptionId: null })
			.where(eq(organizations.id, TEST_ORG_ID));

		const handler = getHandler<{
			invoices: unknown[];
			hasMore: boolean;
		}>(router.listInvoices);

		const result = await handler({
			context: fakeContext(),
			input: { organizationId: TEST_ORG_ID, limit: 20 },
		});
		expect(result.invoices).toEqual([]);
		expect(result.hasMore).toBe(false);
		// Stripe must not have been called for the no-customer path.
		expect(fakeStripe.invoices.list).not.toHaveBeenCalled();
	});
});

// ── Plan F.3.5 (Agent T2) — Tier change mid-period ────────────────────────
describe("platformAdminTenantsBilling.changeTier", () => {
	it("rejects same-tier change with BAD_REQUEST", async () => {
		const handler = getHandler(router.changeTier);

		// Fixture seed is `tier: "professional"`.
		let caught: unknown;
		try {
			await handler({
				context: fakeContext(),
				input: {
					organizationId: TEST_ORG_ID,
					toTier: "professional",
					prorationBehavior: "create_prorations",
				},
			});
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeDefined();
		expect(String(caught).toLowerCase()).toContain("already on this tier");

		// No Stripe call should have been made for same-tier case.
		expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
		expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
	});

	it("happy path: swaps tier on Stripe, updates local row, audits once", async () => {
		const handler = getHandler<{
			ok: true;
			fromTier: string;
			toTier: string;
			prorationInvoiceId: string | null;
			prorationAmountCents: number | null;
		}>(router.changeTier);

		const result = await handler({
			context: fakeContext(),
			input: {
				organizationId: TEST_ORG_ID,
				toTier: "basic",
				prorationBehavior: "create_prorations",
				notes: "tier-change unit-test",
			},
		});

		expect(result.ok).toBe(true);
		expect(result.fromTier).toBe("professional");
		expect(result.toTier).toBe("basic");
		expect(result.prorationInvoiceId).toBe("in_preview_999");
		expect(result.prorationAmountCents).toBe(5000);

		// Stripe was called with the correct shape.
		expect(mockSubscriptionsRetrieve).toHaveBeenCalledTimes(1);
		expect(mockSubscriptionsUpdate).toHaveBeenCalledTimes(1);
		const updateArgs = (
			mockSubscriptionsUpdate as unknown as { mock: { calls: unknown[][] } }
		).mock.calls[0]!;
		expect(updateArgs[0]).toBe(`sub_${TEST_SUB_ID}`);
		const params = updateArgs[1] as {
			items: Array<{ id: string; price: string }>;
			proration_behavior: string;
		};
		expect(params.items[0]!.id).toBe("si_test_item_1");
		expect(params.items[0]!.price).toBe("price_1TWpATB3sd6uw5s66NOdeZMR");
		expect(params.proration_behavior).toBe("create_prorations");

		// Local subscription row was updated.
		const [updatedSub] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, TEST_SUB_ID));
		expect(updatedSub!.tier).toBe("basic");
		expect(updatedSub!.stripePriceId).toBe("price_1TWpATB3sd6uw5s66NOdeZMR");

		// Exactly one audit row with the right metadata.
		const rows = await controlPanelDb
			.select()
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.targetOrganizationId, TEST_ORG_ID),
					eq(adminSessionActions.actionType, "tenant_tier_change"),
				),
			);
		expect(rows.length).toBe(1);
		const meta = rows[0]!.metadata as Record<string, unknown>;
		expect(meta.fromTier).toBe("professional");
		expect(meta.toTier).toBe("basic");
		expect(meta.stripeSubscriptionId).toBe(`sub_${TEST_SUB_ID}`);
		expect(meta.prorationBehavior).toBe("create_prorations");
		expect(meta.notes).toBe("tier-change unit-test");
		expect(meta.prorationInvoiceId).toBe("in_preview_999");
		expect(meta.prorationAmountCents).toBe(5000);
	});

	it("writes no audit row when Stripe subscription update fails", async () => {
		mockSubscriptionsUpdate.mockImplementationOnce(async () => {
			throw new Error("stripe_price_inactive");
		});

		const handler = getHandler(router.changeTier);

		let caught: unknown;
		try {
			await handler({
				context: fakeContext(),
				input: {
					organizationId: TEST_ORG_ID,
					toTier: "enterprise",
					prorationBehavior: "create_prorations",
				},
			});
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeDefined();
		expect(String(caught)).toContain("stripe_price_inactive");

		// Local subscription row must NOT have been mutated.
		const [unchanged] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, TEST_SUB_ID));
		expect(unchanged!.tier).toBe("professional");

		// No audit row.
		const rows = await controlPanelDb
			.select({ id: adminSessionActions.id })
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.targetOrganizationId, TEST_ORG_ID),
					eq(adminSessionActions.actionType, "tenant_tier_change"),
				),
			);
		expect(rows.length).toBe(0);
	});
});
