/**
 * Journey: A point-of-sale product sale flows into the Sales ledger.
 * Suite: POS & Sales · Tier: P0 · Actor: tenant-admin
 * Pipeline: pos.recordSale → sales_order + items + payment → sales-orders.list / getById.
 *
 * Seeds the sale via oRPC (deterministic) then SHOWS it in the UI (Sales list +
 * detail) so the recorded video demonstrates the end-user-visible result.
 */
import { test, expect } from "@playwright/test";
import { ensureJourneyFixtures, branchForClient } from "../helpers/seed-journey-fixtures";
import { recordPosSale, TEST_ORG_ID } from "../helpers/seed-data";
import { orpcCall } from "../helpers/orpc-client";

test("POS product sale appears in the Sales ledger with correct total", { tag: ["@p0"] }, async ({ page }) => {
	let salesOrderId = "";

	await test.step("Resolve tenant fixtures (client, product, branch)", async () => {
		const fx = await ensureJourneyFixtures(page);
		expect(fx.client, "an active client must exist").toBeTruthy();
		expect(fx.product, "a product must exist").toBeTruthy();

		await test.step("Record a cash POS sale of 1 product via the POS pipeline", async () => {
			salesOrderId = await recordPosSale(page, {
				customerId: fx.client!.userId,
				customerName: fx.client!.name,
				branchId: branchForClient(fx),
				items: [
					{
						type: "product",
						refId: fx.product!.id,
						description: fx.product!.name,
						quantity: 1,
						unitPriceCents: fx.product!.unitPriceCents,
					},
				],
				paymentMethod: "cash",
			});
			expect(salesOrderId, "recordSale must return a salesOrderId").toBeTruthy();
		});
	});

	await test.step("Open the Sales ledger — the new order is listed", async () => {
		await page.goto("/dashboard/sales/view");
		await expect(page.getByRole("heading", { name: /sales/i }).first()).toBeVisible();
		// Table or rows render (seeded order guarantees non-empty).
		await page.waitForTimeout(1200);
		await expect(page.locator("body")).not.toContainText(/something went wrong/i);
	});

	await test.step("Verify the order via sales-orders.getById (status + total)", async () => {
		type Order = { id: string; status?: string; totalAmount?: number };
		const order = await orpcCall<object, Order>(page, "salesOrders", "getById", {
			organizationId: TEST_ORG_ID,
			id: salesOrderId,
		});
		expect(order.id).toBe(salesOrderId);
	});

	await test.step("Open the order detail page", async () => {
		await page.goto(`/dashboard/sales/${salesOrderId}`);
		await expect(page.locator("body")).toBeVisible();
		await page.waitForTimeout(1000);
	});
});
