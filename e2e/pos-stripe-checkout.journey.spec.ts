/**
 * Journey: POS online/Stripe sale → order lands in PENDING (awaiting webhook)
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Stripe specifics (verified in code):
 *   - recordSale rejects stripe unless an orgCountryStripeAccounts row with
 *     charges_enabled=true exists (SP-01, pos.ts:105-123). This spec SKIPS if that
 *     account isn't seeded — run scripts/seed-stripe-account first to enable it.
 *   - recordSale does NOT call Stripe during the sale; it writes a placeholder
 *     intent id (pos_<uuid>, pos.service.ts:659) and leaves the order/payment/
 *     invoice in `pending` with amountPaid=0. The real charge is confirmed later
 *     by the payment_intent.succeeded webhook (webhooks.routes.ts:591-645), which
 *     flips order→completed, payment→succeeded, package→active.
 *
 * This test covers the in-store INITIATION half: an online sale is created in the
 * correct pending state with paymentMethod=stripe. (Webhook confirmation needs a
 * Stripe-signed payload and is out of scope for the UI-less path.)
 *
 * Run: bunx playwright test e2e/pos-stripe-checkout.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstActiveClient,
	pickFirstBranchId,
	ensureDefaultTaxRate,
} from "./helpers/seed-data";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";

const ITEM_PRICE_CENTS = 6000; // RM 60 custom line item

test("POS online (Stripe) sale creates a pending order with paymentMethod=stripe", {
	tag: ["@p1"],
}, async ({ page }) => {
	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");

	const client = await pickFirstActiveClient(page);
	test.skip(!client, "No active client — skip");

	const branchId = await pickFirstBranchId(page);
	await ensureDefaultTaxRate(page);

	// ── Record an online/Stripe sale via the API ───────────────────────────────
	type SaleResult = {
		salesOrderId: string;
		invoiceId?: string;
		paymentId?: string;
	};
	let result: SaleResult | null = null;
	try {
		result = await orpcCall<object, SaleResult>(page, "pos", "recordSale", {
			organizationId: TEST_ORG_ID,
			customerType: "member",
			customerId: client!.userId,
			customerName: client!.name,
			branchId,
			items: [
				{
					type: "custom",
					description: "E2E Stripe Item",
					quantity: 1,
					unitPriceCents: ITEM_PRICE_CENTS,
				},
			],
			paymentMethod: "online", // → transformed to "stripe"
		});
	} catch (err) {
		// SP-01: no connected account with charges_enabled → skip (seed it first).
		if (
			err instanceof OrpcClientError &&
			/stripe is not configured/i.test(err.message)
		) {
			test.skip(
				true,
				"No Stripe connected account (charges_enabled) — seed it to run this test",
			);
		}
		throw err;
	}

	expect(result?.salesOrderId).toBeTruthy();
	const salesOrderId = result!.salesOrderId;

	// ── Assert the order is in the PENDING (awaiting-payment) stripe state ──────
	type OrderRow = { id: string; status: string };
	const order = await orpcCall<object, OrderRow>(
		page,
		"salesOrders",
		"getById",
		{
			organizationId: TEST_ORG_ID,
			id: salesOrderId,
		},
	);
	expect(order.status).toBe("pending");

	// The invoice for this order should record paymentMode "stripe" and be unpaid.
	type InvoiceRow = {
		salesOrderId?: string | null;
		paymentMode?: string | null;
		status?: string | null;
	};
	const invoices = await orpcCall<object, InvoiceRow[]>(
		page,
		"invoices",
		"list",
		{
			organizationId: TEST_ORG_ID,
		},
	);
	const invoice = invoices.find((iv) => iv.salesOrderId === salesOrderId);
	if (invoice) {
		expect(invoice.paymentMode).toBe("stripe");
		expect(invoice.status).not.toBe("paid"); // awaits the webhook
	}

	// ── Cleanup: cancel the pending sale ───────────────────────────────────────
	try {
		await orpcCall(page, "salesOrders", "cancel", {
			organizationId: TEST_ORG_ID,
			id: salesOrderId,
		});
	} catch (err) {
		if (!(err instanceof OrpcClientError)) throw err;
	}
});
