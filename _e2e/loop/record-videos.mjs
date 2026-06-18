import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, renameSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const cfg = JSON.parse(readFileSync("_e2e/loop/config.json", "utf8"));
const slug = (p) =>
	p
		.replace(/^\/+|\/+$/g, "")
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.toLowerCase();
// Confirmed, navigation-reproducible findings (no interaction needed to see the bug):
const routes = [
	"/dashboard/settings/google-calendar", // 500
	"/dashboard/brands/view",
	"/dashboard/categories/view",
	"/dashboard/suppliers/view",
	"/dashboard/uom/view",
	"/dashboard/uom-conversions/view",
	"/dashboard/stock-requests/view",
	"/dashboard/transfer-orders/view",
	"/dashboard/payment/view",
	"/dashboard/settings/installment-plans",
	"/dashboard/inventory-options",
];
const outRoot = resolve("_e2e/loop/videos");
mkdirSync(outRoot, { recursive: true });
const browser = await chromium.launch();
for (const path of routes) {
	const id = slug(path);
	const dir = resolve(outRoot, id);
	mkdirSync(dir, { recursive: true });
	const ctx = await browser.newContext({
		baseURL: cfg.baseURL,
		storageState: resolve(cfg.authStatePath),
		viewport: { width: 1280, height: 720 },
		recordVideo: { dir, size: { width: 1280, height: 720 } },
	});
	const page = await ctx.newPage();
	await page
		.goto(path, { waitUntil: "domcontentloaded", timeout: 30000 })
		.catch(() => {});
	await page.waitForTimeout(11000); // let the perpetual spinner / 500 state be clearly visible
	await ctx.close(); // flushes the video
	// rename the random-hash .webm to <id>.webm
	const f = readdirSync(dir).find((x) => x.endsWith(".webm"));
	if (f) renameSync(resolve(dir, f), resolve(outRoot, `${id}.webm`));
	console.log(`recorded ${id}.webm`);
}
await browser.close();
console.log("done");
