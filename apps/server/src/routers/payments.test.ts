/**
 * Payments Router — unit tests for getPaymentStatus and refund guards.
 */

import { describe, expect, it, mock } from "bun:test";
import { createPaymentsRouter } from "./payments";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
			{ tenantDb: makeTenantDb([appt]) },
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
				{ tenantDb: makeTenantDb([]) },
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
			{ tenantDb: makeTenantDb([paidAppt]) },
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
				},
			),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});
});
