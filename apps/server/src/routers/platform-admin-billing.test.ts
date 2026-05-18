/**
 * Plan F.3.5 — Global Billing router unit tests (Agent G).
 *
 * Covers getOverview happy path with seeded refund-audit rows + a sub with a
 * stripeCustomerId. Stripe is mocked via the factory's `stripeOverride` DI
 * hook — no network call. Mirrors the test patterns in
 * platform-admin-tenants-billing.test.ts and platform-admin-coupons.test.ts.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { eq, and, inArray } from "drizzle-orm";
import { createPlatformAdminBillingRouter } from "./platform-admin-billing";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";

const TEST_ORG_ID = "00000000-0000-0000-0000-3333000099ee";
const TEST_SUB_ID = "00000000-0000-0000-0000-3333000099ff";
const TEST_USER_ID = "test-admin-user-billing-global";
const TEST_CUSTOMER = "cus_billing_global_test_999";

const REFUND_ACTIONS = ["tenant_invoice_refund"] as const;

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
			get: (k: string) =>
				k === "controlPanelDb" ? controlPanelDb : undefined,
		},
	};
}

const mockInvoicesList = mock(
	async (params: {
		customer: string;
		limit?: number;
		created?: { gte?: number };
	}) => ({
		data: [
			{
				id: `in_global_${params.customer}_a`,
				number: "INV-A",
				status: "paid" as const,
				amount_paid: 4500,
				currency: "usd",
				created: Math.floor(Date.now() / 1000) - 60,
			},
			{
				id: `in_global_${params.customer}_b`,
				number: "INV-B",
				status: "paid" as const,
				amount_paid: 3000,
				currency: "usd",
				created: Math.floor(Date.now() / 1000) - 3600,
			},
		],
		has_more: false,
	}),
);

const mockCouponsList = mock(async (_p: { limit?: number }) => ({
	data: [
		{
			id: "promo_global_test",
			name: "Global test 15%",
			percent_off: 15,
			amount_off: null,
			currency: null,
			duration: "once" as const,
			times_redeemed: 0,
			valid: true,
			created: Math.floor(Date.now() / 1000),
		},
	],
	has_more: false,
}));

const fakeStripe = {
	invoices: { list: mockInvoicesList },
	coupons: { list: mockCouponsList },
};

const router = createPlatformAdminBillingRouter(fakeStripe as never);

beforeEach(async () => {
	mockInvoicesList.mockClear();
	mockCouponsList.mockClear();

	// Clean only THIS user's refund audit rows + this fixture's org/sub.
	await controlPanelDb
		.delete(adminSessionActions)
		.where(
			and(
				eq(adminSessionActions.adminUserId, TEST_USER_ID),
				inArray(
					adminSessionActions.actionType,
					REFUND_ACTIONS as unknown as string[],
				),
			),
		);
	// Order matters: organizations.subscription_id → subscriptions.id (ON DELETE
	// SET NULL). Drop the org first to detach any references, then the sub.
	// Use the inArray pattern so multiple test runs sharing the same DB don't
	// trip on stale rows.
	await controlPanelDb
		.delete(organizations)
		.where(inArray(organizations.id, [TEST_ORG_ID]));
	await controlPanelDb
		.delete(subscriptions)
		.where(inArray(subscriptions.id, [TEST_SUB_ID]));

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
		name: "Plan F.3.5 Global Billing Test Org",
		slug: `plan-f-3-5-global-billing-${Date.now()}`,
		neonProjectId: `stub-global-billing-${TEST_ORG_ID}`,
		connectionString: "stub",
		paymentStatus: "active",
		subscriptionId: TEST_SUB_ID,
	} satisfies typeof organizations.$inferInsert);

	// Seed two refund-audit rows, newest first.
	const now = Date.now();
	await controlPanelDb.insert(adminSessionActions).values([
		{
			adminUserId: TEST_USER_ID,
			actionType: "tenant_invoice_refund",
			targetOrganizationId: TEST_ORG_ID,
			metadata: {
				refundId: "re_global_old",
				invoiceId: "in_old",
				refundAmount: 2500,
				reason: "duplicate",
			},
			createdAt: new Date(now - 2 * 60 * 60 * 1000),
		},
		{
			adminUserId: TEST_USER_ID,
			actionType: "tenant_invoice_refund",
			targetOrganizationId: TEST_ORG_ID,
			metadata: {
				refundId: "re_global_new",
				invoiceId: "in_new",
				refundAmount: 4000,
				reason: "requested_by_customer",
			},
			createdAt: new Date(now - 5 * 60 * 1000),
		},
	] as typeof adminSessionActions.$inferInsert[]);
});

describe("platformAdminBilling.getOverview", () => {
	it("returns KPIs + recentInvoices + recentRefunds + activeCoupons", async () => {
		const handler = getHandler<{
			kpis: {
				activeSubsCount: number;
				mrr: { cents: number; estimateAvailable: boolean };
				refundsLast30dCount: number;
				refundsLast30dAmountCents: number;
				couponsCount: number;
			};
			recentInvoices: Array<{
				orgId: string;
				orgName: string;
				invoiceId: string;
				amountPaid: number;
				createdAt: Date;
			}>;
			recentRefunds: Array<{
				refundId: string;
				orgId: string;
				orgName: string;
				amountCents: number;
				reason: string;
				refundedAt: Date;
				actorEmail: string | null;
			}>;
			activeCoupons: Array<{ id: string; percentOff: number | null }>;
			stripeAvailable: boolean;
		}>(router.getOverview);

		const result = await handler({
			context: fakeContext(),
			input: {},
		});

		// KPI math: at least one active sub (ours) → MRR includes professional tier.
		expect(result.kpis.activeSubsCount).toBeGreaterThanOrEqual(1);
		expect(result.kpis.mrr.estimateAvailable).toBe(true);
		expect(result.kpis.mrr.cents).toBeGreaterThan(0);

		// We seeded 2 refunds totaling 2500+4000 cents (filtered to our user above).
		// The 30d window query is global, not user-filtered — so it may include
		// other tests' audit rows. Assert OUR rows are present (>= 2 + >= 6500).
		expect(result.kpis.refundsLast30dCount).toBeGreaterThanOrEqual(2);
		expect(result.kpis.refundsLast30dAmountCents).toBeGreaterThanOrEqual(6500);

		// Recent refunds: our two seeded rows should be present, newest-first.
		const ourRefunds = result.recentRefunds.filter((r) =>
			r.refundId.startsWith("re_global_"),
		);
		expect(ourRefunds.length).toBe(2);
		expect(ourRefunds[0]!.refundId).toBe("re_global_new");
		expect(ourRefunds[1]!.refundId).toBe("re_global_old");
		expect(ourRefunds[0]!.amountCents).toBe(4000);
		expect(ourRefunds[0]!.orgName).toBe("Plan F.3.5 Global Billing Test Org");
		expect(ourRefunds[0]!.reason).toBe("requested_by_customer");

		// Recent invoices: fake Stripe was called for our customer.
		expect(mockInvoicesList).toHaveBeenCalled();
		const ourInvoices = result.recentInvoices.filter(
			(i) => i.orgId === TEST_ORG_ID,
		);
		expect(ourInvoices.length).toBeGreaterThanOrEqual(1);
		// Newest-first sort.
		for (let i = 1; i < result.recentInvoices.length; i++) {
			expect(
				result.recentInvoices[i - 1]!.createdAt.getTime() >=
					result.recentInvoices[i]!.createdAt.getTime(),
			).toBe(true);
		}

		// Coupons: fake returned 1.
		expect(result.activeCoupons.length).toBe(1);
		expect(result.activeCoupons[0]!.id).toBe("promo_global_test");
		expect(result.kpis.couponsCount).toBe(1);
		expect(result.stripeAvailable).toBe(true);
	});

	it("degrades gracefully when Stripe coupon list fails", async () => {
		mockCouponsList.mockImplementationOnce(async () => {
			throw new Error("stripe_unavailable");
		});
		const handler = getHandler<{
			activeCoupons: unknown[];
			stripeAvailable: boolean;
			kpis: { couponsCount: number };
		}>(router.getOverview);
		const result = await handler({ context: fakeContext(), input: {} });
		expect(result.activeCoupons.length).toBe(0);
		expect(result.kpis.couponsCount).toBe(0);
		expect(result.stripeAvailable).toBe(false);
	});
});

describe("platformAdminBilling.listInvoicesCrossTenant", () => {
	it("returns shape with default args", async () => {
		const handler = getHandler<{
			invoices: Array<{ invoiceId: string; orgId: string }>;
			stripeAvailable: boolean;
		}>(router.listInvoicesCrossTenant);
		const result = await handler({
			context: fakeContext(),
			input: { limit: 50, days: 30 },
		});
		expect(Array.isArray(result.invoices)).toBe(true);
		expect(typeof result.stripeAvailable).toBe("boolean");
		// At least our fixture invoice should appear.
		const ours = result.invoices.filter((i) => i.orgId === TEST_ORG_ID);
		expect(ours.length).toBeGreaterThanOrEqual(1);
	});
});
