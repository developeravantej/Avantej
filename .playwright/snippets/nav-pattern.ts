/**
 * TanStack Router navigation helper.
 *
 * TanStack Router uses client-side navigation; using <a href> + page.click()
 * works, but page.waitForURL() patterns must allow for the typegen-generated
 * routes (e.g. /dashboard/sales/$id resolves to /dashboard/sales/<uuid>).
 *
 * For dynamic routes, prefer waitForURL with a regex.
 */

import type { Page } from "@playwright/test";

/**
 * Click a sidebar link by its visible label (e.g. "Sales", "Payouts")
 * and wait for the URL to settle.
 */
export async function navigateViaSidebar(
	page: Page,
	linkLabel: string,
	expectedUrlPattern: string | RegExp,
): Promise<void> {
	await page
		.getByRole("link", { name: new RegExp(`^${linkLabel}$`, "i") })
		.first()
		.click();
	await page.waitForURL(expectedUrlPattern, { timeout: 15_000 });
}

/**
 * Wait for a TanStack Query to settle after a mutation
 * (no built-in event; use a stable element appearing/disappearing).
 */
export async function waitForListSettle(
	page: Page,
	listSelector: string,
	timeoutMs = 10_000,
): Promise<void> {
	await page.waitForFunction(
		(sel) => {
			const el = document.querySelector(sel);
			return !!el && !el.querySelector("[data-loading]");
		},
		listSelector,
		{ timeout: timeoutMs },
	);
}
