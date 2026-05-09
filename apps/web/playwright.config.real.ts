/**
 * Real-GHL Playwright config: same as playwright.config.ts but does NOT bind
 * MOCK_GHL=1 to the wrangler dev server. Spec 07 uses this to exercise live
 * GHL `/users/` API calls.
 *
 * Run via: `bun run e2e:test:real --grep "07"`
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e/tests",
	globalSetup: "./e2e/global-setup.ts",
	timeout: 120_000,
	retries: 0,
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: "http://localhost:3001",
		trace: "on",
		video: "on",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		// No MOCK_GHL var — real GHL HTTP calls hit https://services.leadconnectorhq.com
		command:
			'export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"; (cd apps/server && node ../../node_modules/wrangler/bin/wrangler.js dev --port=3000 --local-protocol=http --ip=0.0.0.0) & (cd apps/web && bun run dev) & wait',
		cwd: "../..",
		url: "http://localhost:3001",
		timeout: 180_000,
		reuseExistingServer: !process.env.CI,
	},
});
