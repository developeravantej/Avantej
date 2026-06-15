import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const cfg = JSON.parse(readFileSync("_e2e/loop/config.json", "utf8"));
const routes = [
	"/dashboard/brands/view",
	"/dashboard/categories/view",
	"/dashboard/suppliers/view",
	"/dashboard/uom/view",
	"/dashboard/stock-requests/view",
	"/dashboard/transfer-orders/view",
	"/dashboard/payment/view",
	"/dashboard/settings/installment-plans",
	"/dashboard/inventory-options",
	"/dashboard/settings/google-calendar",
];
const browser = await chromium.launch();
const ctx = await browser.newContext({
	baseURL: cfg.baseURL,
	storageState: resolve(cfg.authStatePath),
	viewport: { width: 1440, height: 900 },
});
for (const path of routes) {
	const page = await ctx.newPage();
	const fails = [];
	const errs = [];
	page.on("response", (r) => {
		if (r.status() >= 400)
			fails.push(
				`${r.status()} ${r.url().replace("http://localhost:3021", "")}`,
			);
	});
	page.on("pageerror", (e) => errs.push(e.message || String(e)));
	await page
		.goto(path, { waitUntil: "domcontentloaded", timeout: 30000 })
		.catch(() => {});
	// wait up to 25s for spinner to clear
	const sel =
		'[role="progressbar"], .animate-spin, [data-loading="true"], .loading-spinner';
	const start = Date.now();
	let cleared = null;
	while (Date.now() - start < 25000) {
		const vis = await page
			.locator(sel)
			.first()
			.isVisible()
			.catch(() => false);
		if (!vis) {
			cleared = Math.round((Date.now() - start) / 1000);
			break;
		}
		await page.waitForTimeout(500);
	}
	const heading = await page
		.locator("h1,h2,h3")
		.first()
		.innerText()
		.catch(() => "(none)");
	const bodyLen = (
		await page
			.locator("body")
			.innerText()
			.catch(() => "")
	).length;
	console.log(`\n== ${path} ==`);
	console.log(
		`  spinnerCleared=${cleared === null ? "NEVER (still spinning at 25s)" : cleared + "s"}  heading="${heading.slice(0, 40)}" mainTextLen=${bodyLen}`,
	);
	console.log(
		`  failedRequests=${fails.length ? [...new Set(fails)].slice(0, 6).join(" | ") : "none"}`,
	);
	console.log(
		`  pageErrors=${errs.length ? errs.slice(0, 3).join(" | ") : "none"}`,
	);
	await page.close();
}
await browser.close();
