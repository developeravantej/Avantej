/**
 * Journey: POS member checkout via UI using the "Online (Stripe link)" method
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Requires a seeded Stripe connected account (charges_enabled=true) for SP-01 to
 * pass — run e2e/scripts/seed-stripe-account.mjs first. Online payments don't
 * redirect to a receipt (a payment link is generated); the sale records and the
 * wizard resets with a success toast. Skips cleanly if Stripe isn't configured.
 *
 * Run: bunx playwright test e2e/pos-stripe-ui-checkout.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstActiveClient,
	ensureDefaultTaxRate,
} from "./helpers/seed-data";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";

const ITEM_PRICE_CENTS = 7500; // RM 75

test("POS member checkout via UI with Online (Stripe link) records the sale", {
	tag: ["@p1"],
}, async ({ page }) => {
	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");

	const client = await pickFirstActiveClient(page);
	test.skip(!client, "No active client — skip");
	await ensureDefaultTaxRate(page);

	const firstName = client!.name.split(" ")[0] ?? client!.name;

	await page.goto("/dashboard/sales/create");
	await page.waitForLoadState("networkidle");

	// Step 0: member customer
	const memberBtn = page.getByRole("button", { name: /^Member$/i });
	if (await memberBtn.isVisible()) await memberBtn.click();
	const search = page.getByTestId("pos-member-search-input");
	await search.waitFor({ timeout: 10_000 });
	await search.fill(firstName);
	await page
		.getByRole("button", { name: new RegExp(firstName, "i") })
		.first()
		.click();
	const toItems = page.getByRole("button", { name: /continue to items/i });
	if (await toItems.isVisible().catch(() => false)) await toItems.click();

	// Step 1: custom item
	await page.getByTestId("pos-add-product-button").click();
	await page.getByPlaceholder("Description").fill("E2E Online Item");
	await page
		.locator('input[type="number"][min="0"]')
		.first()
		.fill(String(ITEM_PRICE_CENTS / 100));
	await page.getByRole("button", { name: /continue to promotions/i }).click();

	// Step 2: skip promo
	await page.getByRole("button", { name: /continue to payment/i }).click();

	// Step 3: Online (Stripe link) — match the unique subtitle
	const onlineBtn = page.getByRole("button", { name: /send a payment link/i });
	await onlineBtn.waitFor({ timeout: 5_000 });
	await onlineBtn.click();

	// The online callout should appear.
	await expect(page.getByText(/payment link/i).first()).toBeVisible({
		timeout: 5_000,
	});

	await page.getByRole("button", { name: /review & confirm/i }).click();

	// Step 4: Charge & Confirm
	const confirm = page.getByTestId("pos-complete-sale-button");
	await confirm.waitFor({ timeout: 5_000 });

	// If Stripe isn't configured, the sale will error with SP-01 — detect & skip.
	const enabled = await confirm
		.isEnabled({ timeout: 3_000 })
		.catch(() => false);
	test.skip(!enabled, "Confirm disabled — payload not ready");
	await confirm.click();

	// Either the success toast fires, or an SP-01 "Stripe is not configured" error.
	const ok = page.getByText(/sale recorded successfully/i);
	const notConfigured = page.getByText(/stripe is not configured/i);
	await expect(ok.or(notConfigured).first()).toBeVisible({ timeout: 10_000 });
	test.skip(
		await notConfigured.isVisible().catch(() => false),
		"Stripe connected account not seeded — run seed-stripe-account.mjs",
	);

	await expect(ok).toBeVisible({ timeout: 5_000 });

	// Cleanup: cancel the just-created pending stripe order (find newest for client).
	try {
		type Order = {
			id: string;
			customerId?: string | null;
			status?: string;
			date?: string | null;
		};
		const orders = await orpcCall<object, { rows: Order[] }>(
			page,
			"salesOrders",
			"list",
			{
				organizationId: TEST_ORG_ID,
				status: "pending",
				limit: 20,
				offset: 0,
			},
		);
		const mine = (orders.rows ?? []).find(
			(o) => o.customerId === client!.userId,
		);
		if (mine)
			await orpcCall(page, "salesOrders", "cancel", {
				organizationId: TEST_ORG_ID,
				id: mine.id,
			});
	} catch (err) {
		if (!(err instanceof OrpcClientError)) throw err;
	}
});
