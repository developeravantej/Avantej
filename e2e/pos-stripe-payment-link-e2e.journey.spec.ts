/**
 * Journey: POS online sale → real Stripe Payment Link → test-card payment →
 *          real PaymentIntent (with salesOrderId metadata) → webhook completes order
 *
 * Actor: tenant_admin (franchisee@gmail.com) + Stripe test mode
 * Priority: P1
 *
 * This is the full POS-Stripe loop, end to end against REAL Stripe (test mode):
 *   1. pos.recordSale (paymentMethod=online) — order parks in `pending`
 *   2. payments.createSalesOrderPaymentLink — real Payment Link on the org's
 *      connected account, salesOrderId/paymentId metadata propagated to the PI
 *   3. Pay the link with the 4242 test card on Stripe's hosted page
 *   4. Poll the Stripe API (connected account) until the PaymentIntent with our
 *      salesOrderId metadata exists and has succeeded
 *   5. Deliver a signed payment_intent.succeeded for that REAL PI to the local
 *      connect webhook (local dev has no Stripe→localhost forwarding)
 *   6. Assert the order flipped to `completed`
 *
 * Skips cleanly when Stripe isn't configured (no connected account row, no
 * STRIPE_SECRET_KEY / STRIPE_CONNECT_WEBHOOK_SECRET in apps/server/.dev.vars).
 *
 * Run: bunx playwright test e2e/pos-stripe-payment-link-e2e.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	TEST_ORG_ID,
	pickFirstActiveClient,
	pickFirstBranchId,
	ensureDefaultTaxRate,
} from "./helpers/seed-data";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";

const SERVER_URL = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:3020";
const WEBHOOK_PATH = "/webhooks/stripe/connect";
const ITEM_PRICE_CENTS = 6100; // RM 61 — uncommon amount to disambiguate the PI

function readDevVar(key: string): string | null {
	try {
		const file = readFileSync(
			path.join(process.cwd(), "apps/server/.dev.vars"),
			"utf8",
		);
		const line = file.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
		return line ? line.slice(key.length + 1).trim() : null;
	} catch {
		return null;
	}
}

function stripeSignature(
	rawBody: string,
	secret: string,
	timestamp: number,
): string {
	const sig = createHmac("sha256", secret)
		.update(`${timestamp}.${rawBody}`)
		.digest("hex");
	return `t=${timestamp},v1=${sig}`;
}

test("POS online sale → payment link paid with test card → webhook completes the order", {
	tag: ["@p1"],
}, async ({ page, request }) => {
	// Paying Stripe's hosted page + API polling needs more than the default 30s.
	test.setTimeout(240_000);

	const stripeKey = readDevVar("STRIPE_SECRET_KEY");
	const webhookSecret = readDevVar("STRIPE_CONNECT_WEBHOOK_SECRET");
	test.skip(!stripeKey, "STRIPE_SECRET_KEY not set — skip");
	test.skip(!webhookSecret, "STRIPE_CONNECT_WEBHOOK_SECRET not set — skip");

	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");

	const client = await pickFirstActiveClient(page);
	test.skip(!client, "No active client — skip");
	const branchId = await pickFirstBranchId(page);
	await ensureDefaultTaxRate(page);

	// ── 1. Record the online sale ───────────────────────────────────────────────
	type SaleResult = { salesOrderId: string; paymentId?: string };
	let sale: SaleResult;
	try {
		sale = await orpcCall<object, SaleResult>(page, "pos", "recordSale", {
			organizationId: TEST_ORG_ID,
			customerType: "member",
			customerId: client!.userId,
			customerName: client!.name,
			branchId,
			items: [
				{
					type: "custom",
					description: "E2E Payment Link Item",
					quantity: 1,
					unitPriceCents: ITEM_PRICE_CENTS,
				},
			],
			paymentMethod: "online",
		});
	} catch (err) {
		if (
			err instanceof OrpcClientError &&
			/stripe is not configured/i.test(err.message)
		) {
			test.skip(true, "No Stripe connected account — seed it to run this test");
		}
		throw err;
	}
	const salesOrderId = sale!.salesOrderId;
	expect(salesOrderId).toBeTruthy();

	// ── 2. Create the real Payment Link ─────────────────────────────────────────
	type LinkResult = { paymentLinkUrl: string; paymentId: string };
	const link = await orpcCall<object, LinkResult>(
		page,
		"payments",
		"createSalesOrderPaymentLink",
		{ organizationId: TEST_ORG_ID, salesOrderId },
	);
	expect(link.paymentLinkUrl).toMatch(/^https:\/\/buy\.stripe\.com\//);

	// Resolve the connected account from the payment row snapshot via Stripe:
	// the link id is enough — but we verify PIs below per-account, so read the
	// account from the control-panel row used by the link procedure.
	// (The PI lands on the connected account, not the platform account.)

	// ── 3. Pay the link with the 4242 test card ─────────────────────────────────
	await page.goto(link.paymentLinkUrl);
	await page.waitForLoadState("domcontentloaded");

	const email = page.locator('input[name="email"]');
	await email.waitFor({ timeout: 30_000 });
	await email.fill("e2e-payer@test.my");

	await page.locator('input[name="cardNumber"]').fill("4242 4242 4242 4242");
	await page.locator('input[name="cardExpiry"]').fill("12 / 34");
	await page.locator('input[name="cardCvc"]').fill("123");
	await page.locator('input[name="billingName"]').fill("E2E Payer");

	// Country/postal code appear depending on the account's billing config.
	const country = page.locator('select[name="billingCountry"]');
	if (await country.isVisible().catch(() => false)) {
		await country.selectOption("MY").catch(() => {});
	}
	const postal = page.locator('input[name="billingPostalCode"]');
	if (await postal.isVisible().catch(() => false)) {
		await postal.fill("88000").catch(() => {});
	}

	const payButton = page
		.locator('button[data-testid="hosted-payment-submit-button"]')
		.or(page.locator("button.SubmitButton"))
		.first();
	await payButton.click();

	// Success = redirect to the after_completion URL (…?paid=1) or Stripe's
	// success state. Give Stripe time to process the card.
	await page.waitForURL(/paid=1/, { timeout: 60_000 }).catch(async () => {
		// Some configs show an inline success instead of redirecting fast —
		// fall through; the API poll below is the real assertion.
	});

	// ── 4. Poll Stripe for the REAL PaymentIntent with our metadata ─────────────
	// The PI lives on the connected account; ask the platform key with the
	// Stripe-Account header. Account id comes from the payment-link URL's
	// underlying row — listed PIs are newest-first, ours is at/near the top.
	// We discover the account by listing connected accounts and probing each
	// (test platform has very few).
	type StripePI = {
		id: string;
		amount: number;
		status: string;
		latest_charge?: string | null;
		metadata?: Record<string, string>;
	};
	const acctResp = await request.get(
		"https://api.stripe.com/v1/accounts?limit=10",
		{ headers: { Authorization: `Bearer ${stripeKey}` } },
	);
	expect(acctResp.ok(), await acctResp.text()).toBeTruthy();
	const acctIds: string[] = ((await acctResp.json()).data ?? []).map(
		(a: { id: string }) => a.id,
	);
	expect(
		acctIds.length,
		"platform must have a connected account",
	).toBeGreaterThan(0);

	let realPi: StripePI | null = null;
	let piAccount: string | null = null;
	const deadline = Date.now() + 90_000;
	while (!realPi && Date.now() < deadline) {
		for (const acct of acctIds) {
			const piResp = await request.get(
				"https://api.stripe.com/v1/payment_intents?limit=20",
				{
					headers: {
						Authorization: `Bearer ${stripeKey}`,
						"Stripe-Account": acct,
					},
				},
			);
			if (!piResp.ok()) continue;
			const pis: StripePI[] = (await piResp.json()).data ?? [];
			const match = pis.find(
				(pi) => pi.metadata?.salesOrderId === salesOrderId,
			);
			if (match) {
				realPi = match;
				piAccount = acct;
				break;
			}
		}
		if (!realPi) await new Promise((r) => setTimeout(r, 5_000));
	}

	expect(
		realPi,
		`a REAL PaymentIntent with metadata.salesOrderId=${salesOrderId} must exist on the connected account`,
	).not.toBeNull();
	expect(realPi!.status).toBe("succeeded");
	expect(realPi!.metadata?.paymentId).toBe(link.paymentId);
	expect(realPi!.metadata?.organizationId).toBe(TEST_ORG_ID);

	// ── 5. Deliver the signed payment_intent.succeeded to the local webhook ─────
	// (Local dev has no Stripe→localhost forwarding; we deliver the event for
	// the REAL PI ourselves, signed with the connect webhook secret.)
	const event = {
		id: `evt_e2e_${Date.now()}`,
		object: "event",
		api_version: "2024-06-20",
		created: Math.floor(Date.now() / 1000),
		type: "payment_intent.succeeded",
		account: piAccount,
		data: {
			object: {
				id: realPi!.id,
				object: "payment_intent",
				amount: realPi!.amount,
				amount_received: realPi!.amount,
				currency: "myr",
				status: "succeeded",
				latest_charge: realPi!.latest_charge ?? null,
				metadata: realPi!.metadata ?? {},
			},
		},
	};
	const rawBody = JSON.stringify(event);
	const ts = Math.floor(Date.now() / 1000);
	const hookResp = await request.post(`${SERVER_URL}${WEBHOOK_PATH}`, {
		headers: {
			"content-type": "application/json",
			"stripe-signature": stripeSignature(rawBody, webhookSecret!, ts),
		},
		data: rawBody,
	});
	expect(hookResp.ok(), await hookResp.text()).toBeTruthy();

	// ── 6. Order flipped to completed ────────────────────────────────────────────
	// After paying, the page sits on Stripe's origin (or the after_completion
	// redirect target) — return to the app origin so orpcCall's relative /rpc
	// fetches carry the session cookie again.
	await page.goto("/dashboard");
	await page.waitForLoadState("domcontentloaded");

	type OrderRow = { id: string; status: string };
	const order = await orpcCall<object, OrderRow>(
		page,
		"salesOrders",
		"getById",
		{ organizationId: TEST_ORG_ID, id: salesOrderId },
	);
	expect(order.status, "webhook must flip the order to completed").toBe(
		"completed",
	);

	// Invoice should now be paid.
	type InvoiceRow = {
		salesOrderId?: string | null;
		status?: string | null;
	};
	const invoices = await orpcCall<object, InvoiceRow[]>(
		page,
		"invoices",
		"list",
		{ organizationId: TEST_ORG_ID },
	);
	const invoice = invoices.find((iv) => iv.salesOrderId === salesOrderId);
	if (invoice) expect(invoice.status).toBe("paid");
});
