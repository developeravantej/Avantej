/**
 * Logs into the dev app via the already-running Chrome (CDP port 9222),
 * injects missing permissions into the userContext API response so
 * permission-gated pages are accessible, then spawns `boneyard-js build`
 * as a child process while keeping this process alive (so the route
 * interceptor stays active throughout the entire build).
 *
 * Run instead of `npx boneyard-js build --cdp 9222 ...`
 */
import { chromium } from "playwright";
import { spawn } from "child_process";

const EMAIL = "franchisee@gmail.com";
const PASSWORD = "password123";
const BASE = "http://localhost:3021";

// Permissions the test user is missing that some pages require
const INJECT_PERMISSIONS = [
	"inventory:read",
	"payments:update",
	"payments:read",
	"stock_requests:read",
	"stock_requests:create",
	"transfer_order_management:read",
	"transfer_order_management:create",
	"sales:read",
	"sales:create",
];

const browser = await chromium.connectOverCDP("http://localhost:9222");
const context = browser.contexts()[0] ?? (await browser.newContext());

// Intercept every userContext response and inject the missing permissions.
// This interceptor must remain alive while boneyard visits each page —
// that's why we spawn boneyard as a child process below instead of exiting.
await context.route("**/rpc/auth/userContext", async (route) => {
	const response = await route.fetch();
	const body = await response.json();

	// body.json.organizations is an array of org objects, each with a permissions array
	if (body?.json?.organizations) {
		body.json.organizations = body.json.organizations.map((org) => ({
			...org,
			permissions: [
				...new Set([...(org.permissions ?? []), ...INJECT_PERMISSIONS]),
			],
		}));
	}

	await route.fulfill({
		status: response.status(),
		headers: response.headers(),
		body: JSON.stringify(body),
	});
});

const pages = context.pages();
const page = pages[0] ?? (await context.newPage());

// Use 'load' (not 'networkidle') — Vite's HMR WebSocket keeps the
// network perpetually "active", so networkidle never fires on a fresh context.
await page.goto(`${BASE}/login`, { waitUntil: "load" });

// Wait for whichever comes first: redirect to /dashboard or login form appearing
await Promise.race([
	page.waitForURL(`${BASE}/dashboard**`, { timeout: 8000 }),
	page.waitForSelector('input[type="email"], input[name="email"]', {
		timeout: 8000,
	}),
]).catch(() => {
	/* already on dashboard or still loading — handled below */
});

// If not yet on dashboard, log in
if (!page.url().includes("/dashboard")) {
	await page.fill('input[type="email"], input[name="email"]', EMAIL);
	await page.fill('input[type="password"], input[name="password"]', PASSWORD);
	await page.click('button[type="submit"]');
	await page.waitForURL(`${BASE}/dashboard**`, { timeout: 15000 });
}

console.log("Logged in. Permissions injector active.");
console.log(
	"Spawning boneyard build — interceptor will stay alive throughout...\n",
);

// Spawn boneyard as a child process so THIS process stays alive.
// If we called process.exit() here the Playwright context (and the route
// interceptor above) would be destroyed before boneyard visits a single page.
await new Promise((resolve, reject) => {
	const child = spawn("npx", ["boneyard-js", "build", BASE, "--cdp", "9222"], {
		cwd: process.cwd(),
		stdio: "inherit",
		// shell:true resolves npx on Windows without needing npx.cmd
		shell: true,
	});

	child.on("close", (code) => {
		if (code === 0 || code === null) resolve(code);
		else reject(new Error(`boneyard exited with code ${code}`));
	});

	child.on("error", reject);
});

console.log("\nBoneyard build complete. Interceptor was active throughout.");
process.exit(0);
