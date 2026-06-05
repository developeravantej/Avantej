import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const cfg = JSON.parse(readFileSync("_e2e/loop/config.json", "utf8"));
const browser = await chromium.launch();
const ctx = await browser.newContext({
	baseURL: cfg.baseURL,
	storageState: resolve(cfg.authStatePath),
	viewport: { width: 1440, height: 900 },
});
for (const path of [
	"/dashboard/brands/view",
	"/dashboard/suppliers/view",
	"/dashboard/uom/view",
	"/dashboard/inventory-options",
]) {
	const page = await ctx.newPage();
	await page
		.goto(path, { waitUntil: "networkidle", timeout: 40000 })
		.catch(() => {});
	await page.waitForTimeout(3000);
	const heads = await page
		.locator("h1,h2,h3")
		.allInnerTexts()
		.catch(() => []);
	const stillSpinning = await page
		.locator('.animate-spin, [role="progressbar"]')
		.first()
		.isVisible()
		.catch(() => false);
	const main = (
		await page
			.locator("body")
			.innerText()
			.catch(() => "")
	)
		.replace(/\s+/g, " ")
		.slice(0, 160);
	console.log(
		`\n== ${path} ==\n headings=${JSON.stringify(heads.slice(0, 5))}\n stillSpinning=${stillSpinning}\n body="${main}"`,
	);
	await page.close();
}
await browser.close();
