import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Webhook-dependent Stripe flows: an ACTUAL refund (PI confirmed → paid → refunded)
// and chargeSavedCard (SetupIntent confirmed → saved card → off-session charge).
// These require the Stripe CLI listener forwarding connect events to the dev server
// (`stripe listen --forward-connect-to localhost:3020/webhooks/stripe/connect`) so
// payment_intent.succeeded / setup_intent.succeeded / charge.refunded flip DB state.
// Gated behind E2E_STRIPE_WEBHOOKS=1 — the normal suite skips them gracefully.
// All test-mode (pm_card_visa); disposable appointments are cancelled in teardown.
const WEBHOOKS_ON = process.env.E2E_STRIPE_WEBHOOKS === "1";

// The test-mode secret key, read from the server's dev vars (never hardcoded).
function stripeKey(): string | null {
	try {
		const vars = readFileSync("apps/server/.dev.vars", "utf8");
		return (
			vars.match(/STRIPE_SECRET_KEY="?(sk_test_[A-Za-z0-9]+)/)?.[1] ?? null
		);
	} catch {
		return null;
	}
}

// Confirm a PaymentIntent / SetupIntent on a connected account with a test card.
async function confirmIntent(
	kind: "payment_intents" | "setup_intents",
	id: string,
	connectedAccount: string,
	sk: string,
): Promise<number> {
	const form = new URLSearchParams({
		payment_method: "pm_card_visa",
		return_url: "https://example.com/return",
	});
	const r = await fetch(`https://api.stripe.com/v1/${kind}/${id}/confirm`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${sk}`,
			"Stripe-Account": connectedAccount,
			"content-type": "application/x-www-form-urlencoded",
		},
		body: form,
	});
	return r.status;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollPaymentStatus(
	request: APIRequestContext,
	organizationId: string,
	appointmentId: string,
	want: string,
	tries = 20,
): Promise<boolean> {
	for (let i = 0; i < tries; i++) {
		const s = await rpc(request, "payments/getPaymentStatus", {
			organizationId,
			appointmentId,
		});
		if (s?.paymentStatus === want) return true;
		await sleep(1500);
	}
	return false;
}

async function payableAppt(
	request: APIRequestContext,
	organizationId: string,
	cleanup: Cleanup,
	amount = 10000,
): Promise<{ apptId: string; pi: any } | null> {
	const nodesRes = await rpc(request, "hierarchy/listNodes", {
		organizationId,
	});
	const branches = (
		Array.isArray(nodesRes) ? nodesRes : (nodesRes?.nodes ?? [])
	).filter((n: any) => n.type === "branch");
	for (const b of branches) {
		const ap = await rpc(request, "appointments/create", {
			organizationId,
			type: "private",
			startTime: new Date(Date.UTC(2026, 5, 1, 3, 0)).toISOString(),
			duration: 60,
			branchId: b.id,
			sessionTotal: amount,
			pricePerClient: amount,
			status: "confirmed",
		});
		const apptId = ap?.id ?? ap?.appointment?.id;
		if (!apptId) continue;
		cleanup.add(`appt ${apptId}`, async () => {
			await rpcRaw(request, "appointments/update", {
				organizationId,
				id: apptId,
				status: "cancelled",
			});
		});
		const res = await rpcRaw(request, "payments/createPaymentIntent", {
			organizationId,
			appointmentId: apptId,
		});
		const body = (await res.json())?.json ?? {};
		if (res.status() === 200 && body?.paymentIntentId) {
			return { apptId, pi: body };
		}
	}
	return null;
}

test.describe("payment — webhook-driven Stripe flows", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("an appointment payment can be confirmed (→paid) and refunded (→refunded)", async ({
		page,
	}) => {
		test.skip(!WEBHOOKS_ON, "needs `stripe listen` + E2E_STRIPE_WEBHOOKS=1");
		const sk = stripeKey();
		test.skip(!sk, "no sk_test_ key in apps/server/.dev.vars");
		const organizationId = getOrgId();

		const made = await payableAppt(page.request, organizationId, cleanup);
		test.skip(!made, "no Connect-enabled branch");
		const { apptId, pi } = made!;

		// Confirm the PI with a test card → payment_intent.succeeded webhook → paid.
		const cs = await confirmIntent(
			"payment_intents",
			pi.paymentIntentId,
			pi.stripeAccountId,
			sk!,
		);
		expect(cs, "confirm PI").toBe(200);
		expect(
			await pollPaymentStatus(page.request, organizationId, apptId, "paid"),
			"appointment should flip to paid via webhook",
		).toBe(true);

		// Refund → charge.refunded webhook → refunded.
		const refund = await rpc(page.request, "payments/refund", {
			organizationId,
			appointmentId: apptId,
		});
		expect(refund?.status).toBe("succeeded");
		expect(
			await pollPaymentStatus(page.request, organizationId, apptId, "refunded"),
			"appointment should flip to refunded via webhook",
		).toBe(true);
	});

	test("chargeSavedCard charges a card saved via SetupIntent (off_session)", async ({
		page,
	}) => {
		test.skip(!WEBHOOKS_ON, "needs `stripe listen` + E2E_STRIPE_WEBHOOKS=1");
		const sk = stripeKey();
		test.skip(!sk, "no sk_test_ key in apps/server/.dev.vars");
		const organizationId = getOrgId();

		// A customer profile to attach the card to.
		const dir = await rpc(page.request, "customerDirectory/list", {
			organizationId,
			limit: 1,
		});
		const customer = (Array.isArray(dir) ? dir : (dir?.rows ?? []))[0];
		test.skip(!customer?.userId, "no customer in directory");
		const profile = await rpc(
			page.request,
			"customerProfiles/upsertForCustomer",
			{
				organizationId,
				targetUserId: customer.userId,
			},
		);
		const customerProfileId = profile?.id ?? profile?.profile?.id;
		expect(customerProfileId).toBeTruthy();

		// SetupIntent → confirm with a test card → setup_intent.succeeded webhook
		// stores the card as the customer's default payment method.
		const si = await rpc(page.request, "payments/createSetupIntent", {
			organizationId,
			customerProfileId,
		});
		const siId = si?.setupIntentId ?? si?.id;
		expect(siId, `setupIntent: ${JSON.stringify(si)}`).toBeTruthy();
		const cs = await confirmIntent(
			"setup_intents",
			siId,
			si.stripeAccountId,
			sk!,
		);
		expect(cs, "confirm SetupIntent").toBe(200);

		let savedCount = 0;
		for (let i = 0; i < 20; i++) {
			const c = await rpc(page.request, "payments/listSavedCards", {
				organizationId,
				customerProfileId,
			});
			savedCount = (Array.isArray(c) ? c : (c?.cards ?? c?.items ?? [])).length;
			if (savedCount > 0) break;
			await sleep(1500);
		}
		expect(savedCount, "a card should be saved via webhook").toBeGreaterThan(0);

		// Off-session charge against the saved card.
		const charge = await rpc(page.request, "payments/chargeSavedCard", {
			organizationId,
			customerProfileId,
			amount: 5000,
			currency: "MYR",
			description: "E2E-DEEP off-session charge",
		});
		expect(charge?.status).toBe("succeeded");
		expect(charge?.amount).toBe(5000);
	});
});
