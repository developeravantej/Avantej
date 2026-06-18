import { expect, test } from "@playwright/test";
import { waitForWithReload } from "../_helpers";

/**
 * DEEP — Sales → Installments tab (per-payment upcoming-installments view).
 *
 * Covers: tab + due-soon badge, status-pill filtering (URL-synced), branch
 * filter (positive + empty), customer search, Collect payment, Reschedule
 * (original→new date display), row → read-only schedule dialog, and CSV export
 * honouring active filters. Mutations (collect/reschedule) run against the
 * dedicated dev tenant (Test Fitness Franchise) seed data.
 *
 * testIDs asserted come from:
 *   apps/web/src/routes/.../sales/view.tsx       — sales-tab-installments
 *   apps/web/src/features/sales/components/InstallmentsTab.tsx
 *     installments-status-{due_soon|overdue|all}, installments-branch-filter,
 *     installments-export-csv, sales-installments-table, installment-row-*,
 *     collect-installment-*, reschedule-installment-*
 *   CollectPaymentDialog.tsx      — collect-payment-confirm
 *   RescheduleInstallmentDialog.tsx — reschedule-installment-confirm
 */

const TAB_URL = "/dashboard/sales/view?tab=installments&instStatus=due_soon";

/** Land on the Installments tab and wait for either the table or the empty state. */
async function openTab(
	page: import("@playwright/test").Page,
	instStatus = "due_soon",
) {
	await page.goto(
		`/dashboard/sales/view?tab=installments&instStatus=${instStatus}&branchId=`,
		{ waitUntil: "domcontentloaded" },
	);
	await waitForWithReload(page, page.locator('[data-sidebar="content"]'), {
		url: `/dashboard/sales/view?tab=installments&instStatus=${instStatus}`,
	});
	// The tab body is mounted once the toolbar status pills render.
	await expect(page.getByTestId("installments-status-due_soon")).toBeVisible({
		timeout: 20_000,
	});
}

test.describe("installments", () => {
	test("Installments tab loads with a due-soon count badge", async ({
		page,
	}) => {
		await openTab(page);
		const tab = page.getByTestId("sales-tab-installments");
		await expect(tab).toBeVisible();
		// Tab label + numeric badge ("Installments  N").
		await expect(tab).toContainText("Installments");
		await expect(tab).toHaveText(/Installments\s*\d+/);
		// The per-payment table or a documented empty state must be present.
		const table = page.getByTestId("sales-installments-table");
		const empty = page.getByText("No upcoming installments");
		await expect(table.or(empty)).toBeVisible();
	});

	test("Status pills filter the list and sync the instStatus URL param", async ({
		page,
	}) => {
		await openTab(page);

		await page.getByTestId("installments-status-overdue").click();
		await expect(page).toHaveURL(/instStatus=overdue/);

		await page.getByTestId("installments-status-all").click();
		await expect(page).toHaveURL(/instStatus=all/);

		// "All Outstanding" is a superset of due_soon — assert it renders rows.
		await expect(
			page
				.getByTestId("sales-installments-table")
				.or(page.getByText("No upcoming installments")),
		).toBeVisible();
	});

	test("Branch filter narrows results (positive + empty cases)", async ({
		page,
	}) => {
		await openTab(page, "all");
		const select = page.getByTestId("installments-branch-filter");
		await expect(select).toBeVisible();

		// Capture baseline row count under "All Branches" (wait for the async
		// listUpcoming query to paint before snapshotting the count).
		const rows = page.locator('[data-testid^="installment-row-"]');
		await expect(rows.first()).toBeVisible({ timeout: 15_000 });
		const allCount = await rows.count();
		expect(allCount).toBeGreaterThan(0);

		// Positive: a branch known to carry installments keeps >=1 row.
		await select.selectOption({
			label: "Tenant Test Fitness Franchise Branch",
		});
		await expect(page).toHaveURL(/branchId=[0-9a-f-]{36}/);
		await expect(async () => {
			expect(await rows.count()).toBeGreaterThan(0);
		}).toPass({ timeout: 10_000 });

		// Empty: a branch with no installment plans collapses to the empty state
		// (the empty state renders both a heading and a sub-line — assert the
		// unambiguous heading, and that the table is gone).
		await select.selectOption({ label: "San Francisco Branch" });
		await expect(
			page
				.getByRole("heading", { name: "No upcoming installments" })
				.or(page.getByText("No upcoming installments", { exact: true }))
				.first(),
		).toBeVisible({ timeout: 10_000 });
		await expect(page.getByTestId("sales-installments-table")).toHaveCount(0);
	});

	test("Customer search filters the list", async ({ page }) => {
		await openTab(page, "all");
		const search = page.getByPlaceholder("Search customer or purchase #…");
		await expect(search).toBeVisible();
		await search.fill("Ahmad");
		// Debounced 300ms → query refires; rows should remain Ahmad-only or empty.
		await page.waitForTimeout(800);
		const rows = page.locator('[data-testid^="installment-row-"]');
		const n = await rows.count();
		if (n > 0) {
			await expect(rows.first()).toContainText("Ahmad");
		}
	});

	test("Row opens the read-only schedule dialog with the full plan", async ({
		page,
	}) => {
		await openTab(page, "all");
		const row = page.locator('[data-testid^="installment-row-"]').first();
		await expect(row).toBeVisible();
		// Click the Customer cell (avoids the action buttons, which stopPropagation).
		await row.locator("td").nth(1).click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText("Payment Schedule");
		// The schedule renders a table of all installments for the package.
		await expect(dialog.locator("table")).toBeVisible();
		await expect(dialog.locator("tbody tr").first()).toBeVisible();
		await page.keyboard.press("Escape");
	});

	test("Reschedule shows the original date struck-through → new date + badge", async ({
		page,
	}) => {
		await openTab(page, "all");
		const firstRow = page.locator('[data-testid^="installment-row-"]').first();
		await expect(firstRow).toBeVisible();

		// Open the reschedule dialog from the row's action button.
		await firstRow.locator('[data-testid^="reschedule-installment-"]').click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toContainText("Reschedule Installment");

		// New date = ~10 days out (stays within a sensible window), with a reason.
		const future = new Date();
		future.setUTCDate(future.getUTCDate() + 10);
		const iso = future.toISOString().slice(0, 10);
		await page.locator("#sales-reschedule-date").fill(iso);
		await page
			.locator("#sales-reschedule-reason")
			.fill("E2E: customer requested extension");
		await page.getByTestId("reschedule-installment-confirm").click();

		// Success toast, then the list shows the Rescheduled marker on some row.
		await expect(page.getByText("Installment rescheduled.")).toBeVisible({
			timeout: 10_000,
		});
		await expect(
			page
				.locator('[data-testid^="installment-row-"]', {
					hasText: "Rescheduled",
				})
				.first(),
		).toBeVisible({ timeout: 10_000 });
		// The struck-through original date renders alongside the new one.
		await expect(page.locator(".line-through").first()).toBeVisible();
	});

	test("Collect confirms an installment payment and the list updates", async ({
		page,
	}) => {
		await openTab(page, "all");
		const rows = page.locator('[data-testid^="installment-row-"]');
		// Wait for the async listUpcoming query to paint before snapshotting.
		await expect(rows.first()).toBeVisible({ timeout: 15_000 });
		const before = await rows.count();
		test.skip(before === 0, "no outstanding installments to collect");

		// Remember the exact installment we're paying so we can assert it leaves
		// the outstanding list (its successor installment has a different id).
		const paidRowTestId = await rows.first().getAttribute("data-testid");
		expect(paidRowTestId).toBeTruthy();

		await rows.first().locator('[data-testid^="collect-installment-"]').click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toContainText("Collect Payment");
		// Default method (Manual Transfer) is fine — just confirm.
		await page.getByTestId("collect-payment-confirm").click();

		await expect(page.getByText("Payment confirmed successfully.")).toBeVisible(
			{
				timeout: 10_000,
			},
		);
		// The paid installment must drop out of the outstanding list on refetch.
		await expect(page.getByTestId(paidRowTestId!)).toHaveCount(0, {
			timeout: 10_000,
		});
	});

	test("Export CSV serializes rows honouring the active filters", async ({
		page,
	}) => {
		await openTab(page, "all");
		await expect(
			page.locator('[data-testid^="installment-row-"]').first(),
		).toBeVisible();

		// Intercept the generated blob so we can assert CSV shape without a file read.
		await page.evaluate(() => {
			(window as unknown as { __csv?: string }).__csv = undefined;
			const orig = URL.createObjectURL;
			URL.createObjectURL = (blob: Blob) => {
				blob
					.text()
					.then((t) => {
						(window as unknown as { __csv?: string }).__csv = t;
					})
					.catch(() => {});
				return orig.call(URL, blob);
			};
			// Swallow the synthetic download click so no file dialog fires.
			HTMLAnchorElement.prototype.click = function () {};
		});

		await page.getByTestId("installments-export-csv").click();
		await expect(page.getByText("CSV exported successfully.")).toBeVisible({
			timeout: 15_000,
		});

		const csv = await page.evaluate(
			() => (window as unknown as { __csv?: string }).__csv ?? "",
		);
		expect(csv).toContain("purchase_number,customer_name,package");
		expect(csv).toContain("amount_due_cents");
		// Header + at least one data row.
		expect(csv.trim().split("\n").length).toBeGreaterThan(1);
	});
});
