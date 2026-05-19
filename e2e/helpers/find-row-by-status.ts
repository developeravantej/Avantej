import type { Locator, Page } from "@playwright/test";

/**
 * Scans the first visible row inside `tableTestId` that matches a lifecycle status.
 *
 * Returns the *row* Locator if one is found, or `null` if the table is empty.
 * Callers should `test.skip(row === null, "…")` for mutation-based journeys.
 *
 * @param page         - Playwright Page
 * @param tableTestId  - data-testid on the <table> / container element
 * @param status       - status text to match (e.g. "active", "frozen", "cancelled") — case-insensitive
 */
export async function findFirstRowWithStatus(
	page: Page,
	tableTestId: string,
	status: string,
): Promise<Locator | null> {
	const table = page.getByTestId(tableTestId);
	// If the table isn't even mounted (empty-state placeholder shown instead),
	// short-circuit so the caller can skip cleanly.
	if (!(await table.isVisible().catch(() => false))) return null;
	const rows = table.locator("tbody tr");
	const count = await rows.count();
	if (count === 0) return null;

	for (let i = 0; i < count; i++) {
		const row = rows.nth(i);
		const text = (await row.textContent()) ?? "";
		if (text.toLowerCase().includes(status.toLowerCase())) {
			return row;
		}
	}
	return null;
}
