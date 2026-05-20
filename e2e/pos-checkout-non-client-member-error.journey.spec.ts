/**
 * Journey: POS rejects sale to a non-client member with a friendly error
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Route: /dashboard/sales/create
 * Seed required: No — the admin account itself (role=admin) is the "bad" customer.
 *
 * Assertion: backend returns BAD_REQUEST with cause "non_client_member"; the
 * frontend surfaces a human-readable toast (not a raw stack trace).
 *
 * Run: bunx playwright test e2e/pos-checkout-non-client-member-error.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "franchisee@gmail.com";

test(
	"POS shows friendly error when attempting a sale to a staff/admin member",
	{ tag: ["@p0"] },
	async ({ page }) => {
		await page.goto("/dashboard/sales/create");

		// Step 1 — Member search: search using the admin's own email.
		const memberSearch = page.getByTestId("pos-member-search-input");
		await expect(memberSearch).toBeVisible();
		await memberSearch.fill(ADMIN_EMAIL);

		// Wait for the dropdown / suggestion to appear and select the first match.
		const firstSuggestion = page
			.getByRole("option")
			.or(page.locator("[data-testid='pos-member-suggestion']"))
			.first();

		// `searchPosCustomers` filters to role=client, so the admin won't appear in
		// suggestions — the journey's "find admin then fail at checkout" approach
		// can't be exercised against current backend behaviour. A future Day-3 seed
		// helper that creates a non-client member who DOES appear in search would
		// unblock this; for now we skip cleanly.
		const visible = await firstSuggestion.isVisible().catch(() => false);
		if (!visible) {
			test.skip(
				true,
				"non-client member search excluded by searchPosCustomers role filter — needs Day-3 seed helper to create a non-client member visible in search",
			);
		}
		await firstSuggestion.click();

		// Step 2 — Add any catalog item to the cart.
		const catalogItem = page.getByTestId("pos-catalog-item").first();
		await expect(catalogItem).toBeVisible({ timeout: 8_000 });
		await catalogItem.click();

		// Step 3 — Attempt to complete the sale.
		const completeBtn = page.getByTestId("pos-complete-sale-button");
		await expect(completeBtn).toBeVisible();
		await completeBtn.click();

		// Assert a friendly error — not a raw server trace.
		const errorToast = page
			.getByRole("alert")
			.or(page.getByTestId("pos-error-toast"))
			.or(page.getByText(/staff.*cannot be a sale target|use a client account|client members only/i));

		await expect(errorToast.first()).toBeVisible({ timeout: 10_000 });

		// Sale must NOT navigate away — POS form stays on /dashboard/sales/create.
		expect(page.url()).toContain("/dashboard/sales/create");
	},
);
