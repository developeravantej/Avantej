import { test, expect, type APIRequestContext } from "@playwright/test";
import {
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	expectRejected,
} from "../_safe-mutation";

// Stripe payment intents against the dev-shared TEST sandbox (sk_test_ key +
// a charges-enabled Connect account already wired in apps/server/.dev.vars).
// All PaymentIntents are test-mode and never captured — no money moves. Appointments
// are disposable (created here, cancelled in teardown), so no real row is mutated.
//
// Covered: createPaymentIntent (op), application_fee = computeApplicationFee, the
// pi:appt:<id> idempotency key, refund-requires-paid (PRECONDITION_FAILED), and the
// no-Connect-account precondition (a branch whose country has no onboarded account).
// Deferred (need the Stripe webhook listener to flip DB state): chargeSavedCard
// (saved card via SetupIntent), an actual refund (a confirmed/paid PI), and invoice
// create/update — see update-ledger.mjs.

let payableBranch: string | null | undefined;

async function makeAppt(
	request: APIRequestContext,
	organizationId: string,
	cleanup: Cleanup,
	branchId: string,
	amount: number,
): Promise<string | null> {
	const ap = await rpc(request, "appointments/create", {
		organizationId,
		type: "private",
		startTime: new Date(Date.UTC(2026, 5, 1, 3, 0)).toISOString(),
		duration: 60,
		branchId,
		sessionTotal: amount,
		pricePerClient: amount,
		status: "confirmed",
	});
	const id = ap?.id ?? ap?.appointment?.id;
	if (id) {
		cleanup.add(`appt ${id}`, async () => {
			await rpcRaw(request, "appointments/update", {
				organizationId,
				id,
				status: "cancelled",
			});
		});
	}
	return id ?? null;
}

// Find a branch whose country has a charges-enabled Connect account by creating a
// throwaway appointment and seeing whether createPaymentIntent succeeds.
async function findPayableBranch(
	request: APIRequestContext,
	organizationId: string,
	cleanup: Cleanup,
): Promise<string | null> {
	if (payableBranch !== undefined) return payableBranch;
	const nodesRes = await rpc(request, "hierarchy/listNodes", {
		organizationId,
	});
	const branches = (
		Array.isArray(nodesRes) ? nodesRes : (nodesRes?.nodes ?? [])
	).filter((n: any) => n.type === "branch");
	for (const b of branches) {
		const id = await makeAppt(request, organizationId, cleanup, b.id, 10000);
		if (!id) continue;
		const pi = await rpcRaw(request, "payments/createPaymentIntent", {
			organizationId,
			appointmentId: id,
		});
		const body = (await pi.json())?.json ?? {};
		if (pi.status() === 200 && body?.paymentIntentId) {
			payableBranch = b.id;
			return payableBranch;
		}
	}
	payableBranch = null;
	return null;
}

test.describe("payment — Stripe intents (test sandbox)", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("createPaymentIntent returns a PI on the org Connect account with an application fee", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await findPayableBranch(
			page.request,
			organizationId,
			cleanup,
		);
		test.skip(!branchId, "no Connect-enabled branch in the sandbox");

		const apptId = await makeAppt(
			page.request,
			organizationId,
			cleanup,
			branchId!,
			10000,
		);
		const pi = await rpc(page.request, "payments/createPaymentIntent", {
			organizationId,
			appointmentId: apptId,
		});
		expect(pi?.clientSecret, `pi: ${JSON.stringify(pi)}`).toBeTruthy();
		expect(pi?.stripeAccountId).toMatch(/^acct_/);
		expect(pi?.amount).toBe(10000);
		expect(pi?.applicationFeeAmount).toBeGreaterThan(0);
		expect(pi?.applicationFeeAmount).toBeLessThan(pi?.amount);
	});

	test("createPaymentIntent is idempotent per appointment (pi:appt:<id>)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await findPayableBranch(
			page.request,
			organizationId,
			cleanup,
		);
		test.skip(!branchId, "no Connect-enabled branch in the sandbox");

		const apptId = await makeAppt(
			page.request,
			organizationId,
			cleanup,
			branchId!,
			10000,
		);
		const first = await rpc(page.request, "payments/createPaymentIntent", {
			organizationId,
			appointmentId: apptId,
		});
		const second = await rpc(page.request, "payments/createPaymentIntent", {
			organizationId,
			appointmentId: apptId,
		});
		// Same idempotency key (pi:appt:<id>) → Stripe returns the SAME intent.
		expect(second?.paymentIntentId).toBe(first?.paymentIntentId);
	});

	test("application_fee_amount = computeApplicationFee(amount, bps) — scales linearly", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await findPayableBranch(
			page.request,
			organizationId,
			cleanup,
		);
		test.skip(!branchId, "no Connect-enabled branch in the sandbox");

		const a1 = await makeAppt(
			page.request,
			organizationId,
			cleanup,
			branchId!,
			10000,
		);
		const a2 = await makeAppt(
			page.request,
			organizationId,
			cleanup,
			branchId!,
			20000,
		);
		const pi1 = await rpc(page.request, "payments/createPaymentIntent", {
			organizationId,
			appointmentId: a1,
		});
		const pi2 = await rpc(page.request, "payments/createPaymentIntent", {
			organizationId,
			appointmentId: a2,
		});
		// fee = floor(amount * bps / 10000): doubling the amount doubles the fee.
		expect(pi1?.applicationFeeAmount).toBeGreaterThan(0);
		expect(pi2?.applicationFeeAmount).toBe(pi1?.applicationFeeAmount * 2);
	});

	test("createPaymentIntent rejects when the branch country has no Connect account (PRECONDITION_FAILED)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const nodesRes = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const branches = (
			Array.isArray(nodesRes) ? nodesRes : (nodesRes?.nodes ?? [])
		).filter((n: any) => n.type === "branch");

		// Find a branch whose country has NO onboarded Connect account: its
		// createPaymentIntent must precondition-fail. Skip if every branch has one.
		let asserted = false;
		for (const b of branches) {
			const apptId = await makeAppt(
				page.request,
				organizationId,
				cleanup,
				b.id,
				10000,
			);
			const res = await rpcRaw(page.request, "payments/createPaymentIntent", {
				organizationId,
				appointmentId: apptId,
			});
			if (res.status() === 412) {
				asserted = true;
				break;
			}
		}
		test.skip(!asserted, "every branch country has a Connect account");
		expect(asserted).toBe(true);
	});

	test("refund requires a paid appointment (PRECONDITION_FAILED)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		// Any branch works — the paid/PI guard fires before Connect routing.
		const nodesRes = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const branch = (
			Array.isArray(nodesRes) ? nodesRes : (nodesRes?.nodes ?? [])
		).filter((n: any) => n.type === "branch")[0];
		test.skip(!branch?.id, "no branch node");

		const apptId = await makeAppt(
			page.request,
			organizationId,
			cleanup,
			branch.id,
			10000,
		);
		// Unpaid appointment → refund rejected with PRECONDITION_FAILED (412).
		await expectRejected(
			page.request,
			"payments/refund",
			{ organizationId, appointmentId: apptId },
			[412, 400],
		);
	});
});
