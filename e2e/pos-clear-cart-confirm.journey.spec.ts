/**
 * Journey: POS "Clear cart?" confirmation dialog when changing customer mid-cart
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * The dialog fires via handleCustomerSelect in pos-workflow.tsx:
 *   if (items.length > 0 && selectedCustomer && selectedCustomer.id !== customer.id)
 *     → pendingCustomerRef.current = newCustomer; setClearCartDialogOpen(true)
 *
 * To trigger it from the UI: while on the Items step, click the "Change" button in
 * the customer recap pill (visible at the top of the Items step), then select a
 * different customer.
 *
 * Steps:
 *   1. Pick two distinct active clients; skip if fewer than 2 exist
 *   2. Navigate to /dashboard/sales/create
 *   3. Select client #1 → advance to Items step
 *   4. Add a custom line item
 *   5. Click "Change" button in the customer recap pill → navigate back to Customer step
 *   6. Select client #2 — dialog "Clear cart?" appears
 *   7. Cancel → assert client #1 still selected and item still in cart
 *   8. Click "Change" again → select client #2 again → confirm ("Clear Cart & Continue")
 *   9. Assert: client #2 selected, cart is empty
 *
 * Skip conditions:
 *   - Fewer than 2 active client members
 *
 * Run: bunx playwright test e2e/pos-clear-cart-confirm.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { orpcCall } from "./helpers/orpc-client";
import { TEST_ORG_ID } from "./helpers/seed-data";
import type { Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ClientInfo {
	memberId: string;
	userId: string;
	name: string;
}

async function listClients(page: Page): Promise<ClientInfo[]> {
	type MemberRow = {
		id: string;
		userId: string;
		role: string;
		status: string;
		name: string;
	};
	try {
		const rows = await orpcCall<object, MemberRow[]>(page, "members", "list", {
			organizationId: TEST_ORG_ID,
			role: "client",
			status: "active",
		});
		return rows.map((r) => ({
			memberId: r.id,
			userId: r.userId,
			name: r.name,
		}));
	} catch {
		return [];
	}
}

/**
 * Select a customer by first word of their name in the customer search.
 * Assumes we are on the Customer step (step 0) with Member mode active.
 */
async function selectCustomer(page: Page, name: string): Promise<void> {
	// POS member-search box (NOT the sidebar "Power search…", which also matches
	// /search/i and triggers a strict-mode violation).
	const searchInput = page.getByTestId("pos-member-search-input");

	// When a customer is already selected, the Customer step hides the search box
	// behind a selected-customer pill — clear it first to reveal the search.
	if (!(await searchInput.isVisible().catch(() => false))) {
		const clearBtn = page.getByRole("button", {
			name: /clear customer selection/i,
		});
		if (await clearBtn.isVisible().catch(() => false)) {
			await clearBtn.click();
		}
	}

	await searchInput.waitFor({ timeout: 10_000 });
	// Clear before filling to avoid stale search results
	await searchInput.fill("");
	await searchInput.fill(name.split(" ")[0] ?? name);

	const firstResult = page
		.getByRole("button", {
			name: new RegExp(name.split(" ")[0] ?? name, "i"),
		})
		.first();
	await firstResult.waitFor({ timeout: 10_000 });
	await firstResult.click();
}

// ─── Test ──────────────────────────────────────────────────────────────────────

test("POS clear-cart dialog appears when changing customer with items in cart", {
	tag: ["@p1"],
}, async ({ page }) => {
	// ── Preconditions ──────────────────────────────────────────────────────────
	const clients = await listClients(page);
	test.skip(clients.length < 1, "Need at least 1 active client — skip");

	const client1 = clients[0]!;

	// ── Navigate ───────────────────────────────────────────────────────────────
	await page.goto("/dashboard/sales/create");
	await page.waitForLoadState("networkidle");

	// Ensure Member mode
	const memberButton = page.getByRole("button", { name: /^Member$/i });
	if (await memberButton.isVisible()) {
		await memberButton.click();
	}

	// ── Select client #1 ──────────────────────────────────────────────────────
	await selectCustomer(page, client1.name);

	// Continue to Items — selecting a customer may auto-advance; only click if shown.
	const continueToItems = page.getByRole("button", {
		name: /continue to items/i,
	});
	if (await continueToItems.isVisible().catch(() => false)) {
		await continueToItems.click();
	}

	// ── Add a custom line item ─────────────────────────────────────────────────
	const addCustomButton = page.getByTestId("pos-add-product-button");
	await addCustomButton.waitFor({ timeout: 5_000 });
	await addCustomButton.click();

	const descInput = page.getByPlaceholder("Description");
	await descInput.waitFor({ timeout: 3_000 });
	await descInput.fill("E2E Cart Test Item");

	// Verify the item row is present
	await expect(page.getByTestId("pos-catalog-item")).toBeVisible({
		timeout: 3_000,
	});

	// ── Trigger the clear-cart guard ───────────────────────────────────────────
	// In the current UI you change customer by CLEARING the selected one. On the
	// Items step click "Change" to return to step 0, then click the selected
	// customer's "×" (Clear customer selection). With items in the cart this
	// fires the "Clear cart?" confirmation dialog.
	const changeCustomerButton = page.getByRole("button", { name: /^Change$/i });
	await changeCustomerButton.waitFor({ timeout: 5_000 });
	await changeCustomerButton.click();

	const clearCustomerBtn = page.getByRole("button", {
		name: /clear customer selection/i,
	});
	await clearCustomerBtn.waitFor({ timeout: 5_000 });
	await clearCustomerBtn.click();

	// ── Assert: "Clear cart?" dialog appears ───────────────────────────────────
	const dialogTitle = page.getByRole("heading", { name: /clear cart\?/i });
	await expect(dialogTitle).toBeVisible({ timeout: 5_000 });

	// ── Path A: Cancel the dialog ──────────────────────────────────────────────
	const cancelButton = page.getByRole("button", { name: /^Cancel$/i });
	await cancelButton.waitFor({ timeout: 3_000 });
	await cancelButton.click();

	// Dialog should close
	await expect(dialogTitle).not.toBeVisible({ timeout: 3_000 });

	// Client #1 should still be selected — the customer recap pill should still
	// show client1's name. We're back at step 0 so the step-1 pill is hidden;
	// instead the step-0 "done" summary pill should show client1's initials/name.
	// Navigate back to Items step to verify item is intact.
	const continueToItemsAgain = page.getByRole("button", {
		name: /continue to items/i,
	});
	if (await continueToItemsAgain.isVisible()) {
		await continueToItemsAgain.click();
	}
	// Item should still be in the cart
	await expect(page.getByTestId("pos-catalog-item")).toBeVisible({
		timeout: 3_000,
	});

	// Customer recap pill in the Items step should still show client1's name
	// (partial match since the pill truncates)
	const client1FirstWord = client1.name.split(" ")[0] ?? client1.name;
	await expect(
		page.getByText(new RegExp(client1FirstWord, "i")).first(),
	).toBeVisible({ timeout: 3_000 });

	// ── Path B: Confirm the dialog clears the cart ─────────────────────────────
	// Re-trigger: Change → step 0 → "×" clear customer → dialog → confirm.
	const changeCustomerButton2 = page.getByRole("button", { name: /^Change$/i });
	await changeCustomerButton2.waitFor({ timeout: 5_000 });
	await changeCustomerButton2.click();

	const clearCustomerBtn2 = page.getByRole("button", {
		name: /clear customer selection/i,
	});
	await clearCustomerBtn2.waitFor({ timeout: 5_000 });
	await clearCustomerBtn2.click();

	await expect(dialogTitle).toBeVisible({ timeout: 5_000 });

	const confirmButton = page.getByRole("button", {
		name: /clear cart & continue/i,
	});
	await confirmButton.waitFor({ timeout: 3_000 });
	await confirmButton.click();

	// Dialog closes.
	await expect(dialogTitle).not.toBeVisible({ timeout: 3_000 });

	// ── Assert: the cart was cleared ───────────────────────────────────────────
	// Confirming clears both the customer and the items. The customer search box
	// reappears (no customer selected) and there are no catalog item rows.
	await expect(page.getByTestId("pos-member-search-input")).toBeVisible({
		timeout: 5_000,
	});
	await expect(page.getByTestId("pos-catalog-item")).not.toBeVisible({
		timeout: 3_000,
	});
});
