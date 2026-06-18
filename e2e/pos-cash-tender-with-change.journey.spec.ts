/**
 * Journey: POS cash tender > total → change-due displays + sale records correctly
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Steps:
 *   1. Pick first active client + ensure a product exists
 *   2. Navigate to /dashboard/sales/create
 *   3. Select member customer
 *   4. Add a custom line item (avoids needing a catalogued service; predictable price)
 *   5. Advance through Promotions to Payment
 *   6. Select Cash
 *   7. Enter an amount tendered LARGER than the total (total + RM 50)
 *   8. Assert: "Change Due" StatusCallout appears with the correct MYR difference
 *   9. Advance to Confirm & submit
 *  10. Assert: redirect to /dashboard/sales/:id (receipt page)
 *
 * Skip if no active client or product can be found/seeded.
 *
 * Run: bunx playwright test e2e/pos-cash-tender-with-change.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	pickFirstActiveClient,
	ensureFirstProduct,
	TEST_ORG_ID,
} from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

const OVERPAY_CENTS = 5000; // RM 50 extra
const ITEM_PRICE_CENTS = 3000; // RM 30 custom line item

test("POS cash tender greater than total shows correct change due", {
	tag: ["@p1"],
}, async ({ page }) => {
	// ── Preconditions ──────────────────────────────────────────────────────────
	// Navigate first so the oRPC picks (relative /rpc fetch via page.evaluate)
	// run against a real origin instead of about:blank (which returns null → skip).
	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");

	const clientInfo = await pickFirstActiveClient(page);
	test.skip(!clientInfo, "No active client member found — skip");

	const product = await ensureFirstProduct(page);
	test.skip(!product, "Could not seed a product — skip");

	// ── Navigate to POS ──────────────────────────────────────────────────────────
	await page.goto("/dashboard/sales/create");
	await page.waitForLoadState("networkidle");

	// ── Step 0: Select customer ────────────────────────────────────────────────
	// The page loads at step 0 (Customer). Make sure we're on the member mode.
	const memberButton = page.getByRole("button", { name: /^Member$/i });
	if (await memberButton.isVisible()) {
		await memberButton.click();
	}

	// Search for the client by name (the POS member-search box, NOT the sidebar
	// "Power search…" — they both match /search/i, so target the test-id).
	const searchInput = page.getByTestId("pos-member-search-input");
	await searchInput.waitFor({ timeout: 10_000 });
	await searchInput.fill(clientInfo!.name.split(" ")[0] ?? clientInfo!.name);
	// Wait for the search results and click the first matching customer
	const customerResult = page.getByRole("button", {
		name: new RegExp(clientInfo!.name.split(" ")[0] ?? clientInfo!.name, "i"),
	});
	await customerResult.first().waitFor({ timeout: 10_000 });
	await customerResult.first().click();

	// Selecting a customer may auto-advance to the Items step; only click
	// "Continue to Items" if it's still showing.
	const continueToItems = page.getByRole("button", {
		name: /continue to items/i,
	});
	if (await continueToItems.isVisible().catch(() => false)) {
		await continueToItems.click();
	}

	// ── Step 1: Add custom item ────────────────────────────────────────────────
	// Add a custom line (no service catalog dependency)
	const addCustomButton = page.getByTestId("pos-add-product-button");
	await addCustomButton.waitFor({ timeout: 5_000 });
	await addCustomButton.click();

	// Fill in the description
	const descInput = page.getByPlaceholder("Description");
	await descInput.waitFor({ timeout: 3_000 });
	await descInput.fill("E2E Test Item");

	// Set unit price to ITEM_PRICE_CENTS (RM 30.00)
	const priceInput = page.locator('input[type="number"][min="0"]').first();
	await priceInput.fill(String(ITEM_PRICE_CENTS / 100));

	// Continue to Promotions
	const continueToPromo = page.getByRole("button", {
		name: /continue to promotions/i,
	});
	await continueToPromo.waitFor({ timeout: 5_000 });
	await continueToPromo.click();

	// ── Step 2: Skip Promotions ────────────────────────────────────────────────
	const continueToPayment = page.getByRole("button", {
		name: /continue to payment/i,
	});
	await continueToPayment.waitFor({ timeout: 5_000 });
	await continueToPayment.click();

	// ── Step 3: Select Cash and enter over-tendered amount ─────────────────────
	// The method button's accessible name is "Cash Exact change" (label +
	// subtitle), so /^Cash$/i matches nothing — target the unique subtitle.
	const cashButton = page.getByRole("button", { name: /exact change/i });
	await cashButton.waitFor({ timeout: 5_000 });
	await cashButton.click();

	// The cash tendered input has id="cash-tendered" and label "Amount tendered (RM)"
	const tenderedInput = page.locator("#cash-tendered");
	await tenderedInput.waitFor({ timeout: 5_000 });

	// Enter total + RM 50 = RM 30 + RM 50 = RM 80
	const tenderRm = (ITEM_PRICE_CENTS + OVERPAY_CENTS) / 100; // 80.00
	await tenderedInput.fill(String(tenderRm));
	// Trigger change event to update state
	await tenderedInput.press("Tab");

	// ── Assert: Change Due callout appears ─────────────────────────────────────
	// PaymentStep renders a StatusCallout with title "Change Due" when changeDueCents > 0.
	// The callout contains the formatted RM amount: OVERPAY_CENTS / 100 = RM 50.00
	const changeDueCallout = page.getByText(/change due/i);
	await expect(changeDueCallout).toBeVisible({ timeout: 5_000 });

	// The change amount (RM 50.00) should be visible inside the callout
	const expectedChangeRm = OVERPAY_CENTS / 100; // 50
	const changeDueAmount = page.getByText(
		new RegExp(`RM\\s*${expectedChangeRm.toFixed(2).replace(".", "\\.")}`, "i"),
	);
	await expect(changeDueAmount).toBeVisible({ timeout: 3_000 });

	// Advance to Confirm step
	const reviewButton = page.getByRole("button", {
		name: /review & confirm/i,
	});
	await reviewButton.waitFor({ timeout: 5_000 });
	await reviewButton.click();

	// ── Step 4: Submit the sale ────────────────────────────────────────────────
	const confirmButton = page.getByTestId("pos-complete-sale-button");
	await confirmButton.waitFor({ timeout: 5_000 });
	await expect(confirmButton).toBeEnabled();
	await confirmButton.click();

	// ── Assert: sale recorded, then redirected to the receipt page ────────────
	// Prove the sale actually completed first — the receipt-URL regex below also
	// matches ".../sales/create", so a failed sale would otherwise false-pass.
	await expect(page.getByText(/sale recorded successfully/i)).toBeVisible({
		timeout: 10_000,
	});
	await page.waitForURL(/\/dashboard\/sales\/(?!create$)[a-zA-Z0-9-]+$/, {
		timeout: 15_000,
	});
	const currentUrl = page.url();
	expect(currentUrl).toMatch(/\/dashboard\/sales\/(?!create$)[a-zA-Z0-9-]+$/);

	// Verify page is not a 404
	const title = await page.title();
	expect(title).not.toContain("404");

	// ── Cleanup: cancel the created sales order ────────────────────────────────
	const salesOrderId = currentUrl.split("/").pop() ?? "";
	if (salesOrderId) {
		try {
			await orpcCall(page, "salesOrders", "cancel", {
				organizationId: TEST_ORG_ID,
				id: salesOrderId,
			});
		} catch {
			// cleanup is best-effort
		}
	}
});
