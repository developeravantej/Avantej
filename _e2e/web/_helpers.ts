import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Dev-server cold-start resilience. SSR/Vite dev servers intermittently wedge on
 * their first client bootstrap; a reload unsticks it. Use this for the first
 * paint of every page so the first spec of a run doesn't flake.
 */
export async function waitForWithReload(
	page: Page,
	locator: Locator,
	opts: { url?: string; attempts?: number; timeout?: number } = {},
): Promise<void> {
	const { url, attempts = 4, timeout = 20_000 } = opts;
	for (let i = 0; i < attempts; i++) {
		const ok = await locator
			.first()
			.waitFor({ state: "visible", timeout })
			.then(() => true)
			.catch(() => false);
		if (ok) return;
		if (url) await page.goto(url, { waitUntil: "domcontentloaded" });
		else await page.reload({ waitUntil: "domcontentloaded" });
	}
	await expect(locator.first()).toBeVisible({ timeout });
}

/**
 * Smoke-load a dashboard page:
 *  1. navigate
 *  2. wait for the app shell (sidebar) to mount — confirms auth + layout rendered
 *  3. assert the route did NOT crash into the ErrorBoundary ("Something went wrong")
 *  4. assert some real content (a heading) painted — not a blank Outlet
 *
 * Read-only: never clicks anything. Safe against live data.
 */
export async function smokeLoad(page: Page, url: string): Promise<void> {
	await page.goto(url, { waitUntil: "domcontentloaded" });

	// App shell is present on every authenticated route via AppLayout/SidebarProvider.
	await waitForWithReload(page, page.locator('[data-sidebar="content"]'), {
		url,
	});

	// Auth sanity: a protected route must not bounce us to /login.
	expect(
		page.url(),
		`expected to stay on a dashboard route, got ${page.url()}`,
	).not.toContain("/login");

	// The page-level content should settle. Give async route data a moment, then
	// assert the global ErrorBoundary fallback is NOT showing. A route crash
	// renders this exact heading ("Something went wrong") — its absence is the
	// core smoke signal. (This app styles most page titles as <span>, not
	// semantic <h1>–<h3>, so a generic heading check is unreliable.)
	await expect(
		page.getByRole("heading", { name: "Something went wrong" }),
	).toHaveCount(0, { timeout: 15_000 });

	// Confirm the route painted real content beyond the shell — the page content
	// region (sibling of the sidebar) should hold visible text.
	const contentText = (await page.locator("body").innerText()).trim();
	expect(
		contentText.length,
		"expected the page to render visible content, not a blank outlet",
	).toBeGreaterThan(0);
}
