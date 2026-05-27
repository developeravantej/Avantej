/**
 * Payments Router — unit tests for getPaymentStatus and refund guards.
 */

import { describe, expect, it, mock } from "bun:test";
import { createPaymentsRouter } from "./payments";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const MOCK_MEMBER = { id: "member-1", role: "admin", hierarchyScopeId: "scope-1", userId: "user-1" };

function makeTenantDb(rows: unknown[]) {
	const chain = {
		from: mock(() => chain),
		where: mock(() => chain),
		limit: mock(() => Promise.resolve(rows)),
	};
	return {
		select: mock(() => chain),
	} as unknown as never;
}

function callProcedure(
	procedure: unknown,
	input: unknown,
	context: Record<string, unknown>,
) {
	// biome-ignore lint/suspicious/noExplicitAny: test helper
	return (procedure as any)["~orpc"].handler({ input, context });
}

describe("paymentsRouter.getPaymentStatus", () => {
	it("returns appointment payment fields when found", async () => {
		const appt = {
			id: APPT_ID,
			paymentStatus: "paid",
			stripePaymentIntentId: "pi_123",
			stripePaymentLinkId: null,
			paymentLinkUrl: null,
			currency: "MYR",
			sessionTotal: 5000,
			applicationFeeAmount: 100,
			paidAt: new Date(),
			paymentFailureReason: null,
			paymentMethodType: "card",
		};
		const router = createPaymentsRouter();
		const result = await callProcedure(
			router.getPaymentStatus,
			{ organizationId: ORG_ID, appointmentId: APPT_ID },
			{ tenantDb: makeTenantDb([appt]), member: MOCK_MEMBER },
		);
		expect(result.paymentStatus).toBe("paid");
		expect(result.stripePaymentIntentId).toBe("pi_123");
	});

	it("throws NOT_FOUND when appointment missing", async () => {
		const router = createPaymentsRouter();
		await expect(
			callProcedure(
				router.getPaymentStatus,
				{ organizationId: ORG_ID, appointmentId: APPT_ID },
				{ tenantDb: makeTenantDb([]), member: MOCK_MEMBER },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("paymentsRouter.refund", () => {
	const paidAppt = {
		id: APPT_ID,
		paymentStatus: "paid",
		stripePaymentIntentId: "pi_123",
		stripeConnectAccountIdSnapshot: "acct_123",
	};

	it("rejects refund when payment_status is not paid", async () => {
		const router = createPaymentsRouter({
			refunds: {
				create: mock(() =>
					Promise.resolve({
						id: "re_1",
						status: "succeeded",
						amount: 5000,
						currency: "myr",
					}),
				),
			},
		} as never);
		await expect(
			callProcedure(
				router.refund,
				{ organizationId: ORG_ID, appointmentId: APPT_ID },
				{
					tenantDb: makeTenantDb([
						{ ...paidAppt, paymentStatus: "pending" },
					]),
					member: MOCK_MEMBER,
				},
			),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	it("creates Stripe refund with idempotency key on happy path", async () => {
		const refundCreate = mock(() =>
			Promise.resolve({
				id: "re_123",
				status: "succeeded",
				amount: 5000,
				currency: "myr",
			}),
		);
		const router = createPaymentsRouter({
			refunds: { create: refundCreate },
		} as never);

		const result = await callProcedure(
			router.refund,
			{
				organizationId: ORG_ID,
				appointmentId: APPT_ID,
				reason: "requested_by_customer",
			},
			{ tenantDb: makeTenantDb([paidAppt]), member: MOCK_MEMBER },
		);

		expect(result.refundId).toBe("re_123");
		expect(refundCreate).toHaveBeenCalledTimes(1);
		const firstCall = refundCreate.mock.calls[0] as unknown[] | undefined;
		expect(firstCall).toBeDefined();
		const options = firstCall![1] as {
			stripeAccount?: string;
			idempotencyKey?: string;
		};
		expect(options.stripeAccount).toBe("acct_123");
		expect(options.idempotencyKey).toBe(`refund:appt:${APPT_ID}`);
	});

	it("rejects when stripe connect account snapshot is missing", async () => {
		const router = createPaymentsRouter({
			refunds: {
				create: mock(() =>
					Promise.resolve({
						id: "re_1",
						status: "succeeded",
						amount: 5000,
						currency: "myr",
					}),
				),
			},
		} as never);
		await expect(
			callProcedure(
				router.refund,
				{ organizationId: ORG_ID, appointmentId: APPT_ID },
				{
					tenantDb: makeTenantDb([
						{ ...paidAppt, stripeConnectAccountIdSnapshot: null },
					]),
					member: MOCK_MEMBER,
				},
			),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});
});

// ─── Guard smoke tests for the 7 procedures with no dedicated test ────────────
//
// These tests don't exercise Stripe or Drizzle behaviour — they pin down the
// post-refactor security guards: `assertOrgContextMatch` (cross-tenant
// spoofing) and `assertTenantContext` (missing tenantDb / missing member).
// Each procedure must fail FAST before any side effect, so we can assert
// without setting up the full pipeline.

const OTHER_ORG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CUSTOMER_PROFILE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SALES_ORDER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SERVICE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

type GuardCase = {
	name: string;
	pick: (router: ReturnType<typeof createPaymentsRouter>) => unknown;
	input: Record<string, unknown>;
};

const GUARDED_PROCEDURES: GuardCase[] = [
	{
		name: "createPaymentIntent",
		pick: (r) => r.createPaymentIntent,
		input: { organizationId: ORG_ID, appointmentId: APPT_ID },
	},
	{
		name: "sendPaymentLink",
		pick: (r) => r.sendPaymentLink,
		input: { organizationId: ORG_ID, appointmentId: APPT_ID },
	},
	{
		name: "createSetupIntent",
		pick: (r) => r.createSetupIntent,
		input: { organizationId: ORG_ID, customerProfileId: CUSTOMER_PROFILE_ID },
	},
	{
		name: "listSavedCards",
		pick: (r) => r.listSavedCards,
		input: { organizationId: ORG_ID, customerProfileId: CUSTOMER_PROFILE_ID },
	},
	{
		name: "chargeSavedCard",
		pick: (r) => r.chargeSavedCard,
		input: {
			organizationId: ORG_ID,
			customerProfileId: CUSTOMER_PROFILE_ID,
			amount: 5000,
			currency: "MYR",
		},
	},
	{
		name: "createSalesOrderPaymentLink",
		pick: (r) => r.createSalesOrderPaymentLink,
		input: { organizationId: ORG_ID, salesOrderId: SALES_ORDER_ID },
	},
	{
		name: "purchasePackage",
		pick: (r) => r.purchasePackage,
		input: {
			organizationId: ORG_ID,
			serviceId: SERVICE_ID,
			clientId: "user_abc",
			creditsTotal: 10,
			totalPrice: 50000,
			currency: "MYR",
		},
	},
];

describe("paymentsRouter guard smoke tests", () => {
	describe.each(GUARDED_PROCEDURES)("$name", ({ pick, input }) => {
		it("throws FORBIDDEN when input.organizationId disagrees with context.organizationId", async () => {
			const router = createPaymentsRouter();
			const procedure = pick(router);
			await expect(
				callProcedure(procedure, input, {
					organizationId: OTHER_ORG_ID,
					tenantDb: makeTenantDb([]),
					member: MOCK_MEMBER,
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});

		it("throws FORBIDDEN when context has tenantDb but no member", async () => {
			const router = createPaymentsRouter();
			const procedure = pick(router);
			await expect(
				callProcedure(procedure, input, {
					tenantDb: makeTenantDb([]),
					// member intentionally absent — assertTenantContext should fire
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});
	});
});
