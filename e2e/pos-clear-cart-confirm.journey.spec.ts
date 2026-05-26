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
    return rows.map((r) => ({ memberId: r.id, userId: r.userId, name: r.name }));
  } catch {
    return [];
  }
}

/**
 * Select a customer by first word of their name in the customer search.
 * Assumes we are on the Customer step (step 0) with Member mode active.
 */
async function selectCustomer(page: Page, name: string): Promise<void> {
  const searchInput = page.getByRole("textbox", { name: /search/i });
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

test(
  "POS clear-cart dialog appears when changing customer with items in cart",
  { tag: ["@p1"] },
  async ({ page }) => {
    // ── Preconditions ──────────────────────────────────────────────────────────
    const clients = await listClients(page);
    test.skip(
      clients.length < 2,
      `Need at least 2 active clients; found ${clients.length} — skip`,
    );

    const client1 = clients[0]!;
    const client2 = clients.find((c) => c.memberId !== client1.memberId)!;

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

    // Continue to Items
    const continueToItems = page.getByRole("button", {
      name: /continue to items/i,
    });
    await continueToItems.waitFor({ timeout: 5_000 });
    await continueToItems.click();

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

    // ── Click "Change" button in customer recap pill ───────────────────────────
    // In Items step (step 1), a recap pill with the selected customer is shown.
    // It has a "Change" button that calls setCurrentStep(0).
    const changeCustomerButton = page.getByRole("button", { name: /^Change$/i });
    await changeCustomerButton.waitFor({ timeout: 5_000 });
    await changeCustomerButton.click();

    // Back to step 0 — Customer step should be active
    // Now select client #2 — this triggers handleCustomerSelect which detects
    // items.length > 0 && customer.id !== selectedCustomer.id → dialog opens.
    await selectCustomer(page, client2.name);

    // ── Assert: "Clear cart?" dialog appears ───────────────────────────────────
    // Dialog title is "Clear cart?" (from DialogTitle in pos-workflow.tsx)
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

    // ── Path B: Confirm the dialog ─────────────────────────────────────────────
    // Click Change again
    const changeCustomerButton2 = page.getByRole("button", {
      name: /^Change$/i,
    });
    await changeCustomerButton2.waitFor({ timeout: 5_000 });
    await changeCustomerButton2.click();

    // Select client #2 again
    await selectCustomer(page, client2.name);

    // Dialog appears again
    await expect(dialogTitle).toBeVisible({ timeout: 5_000 });

    // Click "Clear Cart & Continue"
    const confirmButton = page.getByRole("button", {
      name: /clear cart & continue/i,
    });
    await confirmButton.waitFor({ timeout: 3_000 });
    await confirmButton.click();

    // Dialog closes
    await expect(dialogTitle).not.toBeVisible({ timeout: 3_000 });

    // ── Assert: client #2 selected, cart is empty ──────────────────────────────
    // After confirmation the workflow advances to step 1 with the new customer.
    // The customer recap pill should show client2's name.
    const client2FirstWord = client2.name.split(" ")[0] ?? client2.name;
    await expect(
      page.getByText(new RegExp(client2FirstWord, "i")).first(),
    ).toBeVisible({ timeout: 5_000 });

    // No item rows in the cart (items array was cleared by confirmClearCart)
    await expect(page.getByTestId("pos-catalog-item")).not.toBeVisible({
      timeout: 3_000,
    });

    // The empty state message confirms the cart is clear
    await expect(
      page.getByText(/no items added/i),
    ).toBeVisible({ timeout: 3_000 });
  },
);
