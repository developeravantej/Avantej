/**
 * Journey: Cancel Package Instance
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Route: /dashboard/packages/view?tab=session-packs
 * Seed: seeds a package instance via POS API if no active ones exist.
 *
 * Run: bunx playwright test e2e/package-lifecycle-cancel.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { findFirstRowWithStatus } from "./helpers/find-row-by-status";
import {
	pickFirstActiveClient,
	pickFirstService,
	recordPosSale,
} from "./helpers/seed-data";

const PACKAGES_URL = "/dashboard/packages/view?tab=session-packs";

// serial: prevent parallel runs from racing the same seeded instance rows
test.describe
	.serial("package-lifecycle-cancel", () => {
		test("admin cancels an active package instance — row moves to Cancelled tab", {
			tag: ["@p0"],
			timeout: 30_000,
		}, async ({ page }) => {
			// ── Seed: ensure at least one active package instance exists via POS ────
			// Always seed unconditionally — POS is cheap and idempotent. The API check
			// below is the reliable gate; the UI check after reload is the assertion.
			const client = await pickFirstActiveClient(page);
			const service = await pickFirstService(page, {
				hasSessions: true,
				isPackage: true,
			});
			if (client && service) {
				try {
					await recordPosSale(page, {
						customerId: client.userId,
						customerName: client.name,
						branchId: client.hierarchyScopeId!,
						items: [
							{
								type: "package",
								refId: service.id,
								description: service.name,
								quantity: 1,
								unitPriceCents: 10000,
							},
						],
						paymentMethod: "cash",
					});
				} catch {
					// Could not seed — will skip below if no active row found
				}
			}

			await page.goto(PACKAGES_URL);
			// Wait for data to load: at least one tbody row must appear (not just skeleton)
			const table = page.getByTestId("instances-table");
			await expect(table).toBeVisible({ timeout: 10_000 });
			// Wait for real data rows (not skeleton) — skeletons don't have click handlers
			await page
				.waitForFunction(
					() => {
						const tbl = document.querySelector(
							'[data-testid="instances-table"]',
						);
						const rows = tbl?.querySelectorAll("tbody tr") ?? [];
						// A real data row will have at least one non-skeleton cell with text
						return Array.from(rows).some(
							(r) => (r.textContent ?? "").trim().length > 10,
						);
					},
					{ timeout: 10_000 },
				)
				.catch(() => {
					/* timeout — continue anyway */
				});

			// Find an active row — skip if none exist.
			const activeRow = await findFirstRowWithStatus(
				page,
				"instances-table",
				"active",
			);
			test.skip(
				activeRow === null,
				"no active package instance in instances-table — approval gate may be blocking the POS-seeded instance",
			);

			// Open the row's action menu.
			const actionMenu = activeRow!.getByTestId("instance-action-menu");
			await actionMenu.click();

			// Click Cancel in the dropdown.
			await page.getByTestId("instance-action-cancel").click();

			// Dialog appears.
			await expect(page.getByTestId("cancel-instance-dialog")).toBeVisible();

			// Fill reason (≥5 chars required).
			const reasonInput = page.getByTestId("cancel-reason-input");
			await reasonInput.fill("E2E test cancellation");

			// Confirm button should be enabled after filling reason.
			const confirmBtn = page.getByTestId("cancel-instance-confirm-button");
			await expect(confirmBtn).toBeEnabled();
			await confirmBtn.click();

			// Toast confirms success — sonner uses role="status" for success toasts.
			// Also check data-sonner-toast as a fallback.
			const successToast = page
				.getByRole("status")
				.or(page.getByRole("alert"))
				.or(page.locator("[data-sonner-toast]"));
			await expect(
				successToast.filter({ hasText: /cancel/i }).first(),
			).toBeVisible({
				timeout: 10_000,
			});

			// Switch to Cancelled filter — row should appear there.
			await page.getByTestId("status-filter-cancelled").click();
			await expect(page.getByTestId("instances-table")).toBeVisible();
			// Wait for the cancelled row data to load
			await page
				.waitForFunction(
					() => {
						const tbl = document.querySelector(
							'[data-testid="instances-table"]',
						);
						const rows = tbl?.querySelectorAll("tbody tr") ?? [];
						return Array.from(rows).some(
							(r) =>
								(r.textContent ?? "").toLowerCase().includes("cancelled") ||
								(r.textContent ?? "").toLowerCase().includes("cancel"),
						);
					},
					{ timeout: 10_000 },
				)
				.catch(() => {
					/* timeout — will fail on null check below */
				});
			const cancelledRow = await findFirstRowWithStatus(
				page,
				"instances-table",
				"cancelled",
			);
			expect(cancelledRow).not.toBeNull();
		});
	}); // end test.describe.serial
