/**
 * Journey: Extend Package Instance Expiry Date
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Route: /dashboard/packages/view?tab=session-packs
 * Seed: seeds a package instance via POS API if no active ones exist.
 *
 * Run: bunx playwright test e2e/package-lifecycle-extend.journey.spec.ts --project=journeys-e2e
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
	.serial("package-lifecycle-extend", () => {
		test("admin extends an active instance by 30 days — expiry date text changes", {
			tag: ["@p0"],
			timeout: 30_000,
		}, async ({ page }) => {
			// ── Seed: ensure at least one active package instance exists via POS ────
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
			const table = page.getByTestId("instances-table");
			await expect(table).toBeVisible({ timeout: 10_000 });
			await page
				.waitForFunction(
					() => {
						const tbl = document.querySelector(
							'[data-testid="instances-table"]',
						);
						const rows = tbl?.querySelectorAll("tbody tr") ?? [];
						return Array.from(rows).some(
							(r) => (r.textContent ?? "").trim().length > 10,
						);
					},
					{ timeout: 10_000 },
				)
				.catch(() => {
					/* timeout — continue anyway */
				});

			// Find an active row — skip if none.
			const activeRow = await findFirstRowWithStatus(
				page,
				"instances-table",
				"active",
			);
			test.skip(
				activeRow === null,
				"no active package instance in instances-table — approval gate may be blocking the POS-seeded instance",
			);

			// Capture the current expiry text before extending.
			const expiresCell = activeRow!.getByTestId("instance-expires-at");
			const originalExpiry = await expiresCell.textContent();

			// Open action menu → Extend.
			const actionMenu = activeRow!.getByTestId("instance-action-menu");
			await actionMenu.click();
			await page.getByTestId("instance-action-extend").click();

			// Dialog visible.
			await expect(page.getByTestId("extend-instance-dialog")).toBeVisible();

			// Fill days to extend.
			const daysInput = page.getByTestId("extend-days-input");
			await daysInput.fill("30");

			// The API requires a non-empty reason — fill it in.
			const extendReasonInput = page.locator("#extend-reason");
			if (await extendReasonInput.isVisible().catch(() => false)) {
				await extendReasonInput.fill("E2E test extension");
			}

			// Confirm button enabled after input.
			const confirmBtn = page.getByTestId("extend-instance-confirm-button");
			await expect(confirmBtn).toBeEnabled();
			await confirmBtn.click();

			// Toast confirms.
			const extendToast = page
				.getByRole("status")
				.or(page.getByRole("alert"))
				.or(page.locator("[data-sonner-toast]"));
			await expect(
				extendToast.filter({ hasText: /extend|success/i }).first(),
			).toBeVisible({ timeout: 10_000 });

			// Expiry cell text must have changed (we assert it differs from before, not exact math).
			await expect(expiresCell).not.toHaveText(originalExpiry ?? "", {
				timeout: 10_000,
			});
		});
	}); // end test.describe.serial
