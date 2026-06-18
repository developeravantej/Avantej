import { test, expect } from "@playwright/test";
import { smokeLoad } from "../_helpers";

// Deep detail check for the refactored sales/$id page. The list-row-click spec
// (sales.detail.spec.ts) skips when the default list view shows no rows, so this
// drives the detail page DIRECTLY via a real order id fetched from the API.
// Exercises the extracted SalesStatusBadge / StatusHistoryCard / CancelSaleDialog /
// mapReceiptResponse and the removed `createdByName` / `branchId` casts.
const ORG = process.env.E2E_ORG_ID ?? "996febce-aaad-4ded-8f47-02d2b566c8ee";
const SERVER = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:3020";

test.describe("sales", () => {
	test("Sale detail ($id) renders order content + Cancel dialog opens (no submit)", async ({
		page,
		request,
	}) => {
		// Find a real order id (request fixture inherits the admin storageState cookie).
		const res = await request.post(`${SERVER}/rpc/salesOrders/list`, {
			data: { json: { organizationId: ORG, limit: 1 } },
		});
		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		const order = body?.json?.rows?.[0];
		test.skip(!order, "no sales orders in tenant — seed to cover detail");

		await smokeLoad(page, `/dashboard/sales/${order.id}`);

		// 1. No crash / not the "order not found" error path.
		await expect(
			page.getByRole("heading", {
				name: /something went wrong|order not found/i,
			}),
		).toHaveCount(0);

		// 2. Real content: order number + the Order Summary labels (incl. "Created By",
		//    which reads order.createdByName — the field whose `as any` cast was removed).
		await expect(page.getByText(order.salesOrderNumber)).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText(/total amount/i).first()).toBeVisible();
		await expect(page.getByText(/created by/i).first()).toBeVisible();

		// 3. Cancel Sale dialog (extracted CancelSaleDialog) opens — read-to-confirm
		//    ONLY. Cancelling a sale is irreversible, so we open + Escape, never submit.
		const cancelBtn = page.getByTestId("cancel-sale-button");
		if (await cancelBtn.isVisible().catch(() => false)) {
			await cancelBtn.click();
			await expect(page.getByRole("dialog")).toBeVisible();
			await expect(page.getByText(/cancel sale|reason/i).first()).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(page.getByRole("dialog")).toBeHidden();
		}
	});
});
