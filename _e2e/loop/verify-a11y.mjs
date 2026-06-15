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
await page
	.goto("/dashboard", { waitUntil: "networkidle", timeout: 60000 })
	.catch(() => {});
const info = await page.evaluate(() => {
	const bad = [...document.querySelectorAll("button")].filter(
		(b) =>
			!b.textContent?.trim() &&
			!b.getAttribute("aria-label") &&
			!b.getAttribute("title"),
	);
	return bad.map((b) => ({
		html: b.outerHTML.slice(0, 200),
		cls: b.className,
		dataSidebar: b.getAttribute("data-sidebar"),
		parent:
			b.parentElement?.tagName +
			"." +
			(b.parentElement?.className || "").slice(0, 40),
	}));
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
