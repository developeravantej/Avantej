import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const cfg = JSON.parse(readFileSync("_e2e/loop/config.json", "utf8"));
const browser = await chromium.launch();
const ctx = await browser.newContext({
	baseURL: cfg.baseURL,
	storageState: resolve(cfg.authStatePath),
});
const page = await ctx.newPage();
for (const path of ["/dashboard", "/dashboard/expenses/view"]) {
	await page
		.goto(path, { waitUntil: "networkidle", timeout: 60000 })
		.catch(() => {});
	await page.waitForTimeout(1500);
	const title = await page.title();
	const url = page.url();
	const h1 = await page
		.locator("h1,h2")
		.first()
		.innerText()
		.catch(() => "(none)");
	const bodyText = (
		await page
			.locator("body")
			.innerText()
			.catch(() => "")
	)
		.replace(/\s+/g, " ")
		.slice(0, 300);
	const hasPwd = await page.locator('input[type="password"]').count();
	const navLinks = await page
		.locator("nav a, aside a, [data-sidebar] a")
		.count();
	console.log(
		`\n== ${path} ==\n url=${url}\n title=${title}\n firstHeading=${h1}\n passwordInputs=${hasPwd} navLinks=${navLinks}\n body="${bodyText}"`,
	);
}
await browser.close();
