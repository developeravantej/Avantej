import { defineConfig, devices } from "@playwright/test";

/**
 * Dedicated config for the AVANTEJ-9 regression spec.
 * Uses the API-only global-setup (no dashboard load) so it stays stable against
 * the local wrangler dev server. Records video (proof artifact).
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3022 \
 *     bunx playwright test --config _e2e/playwright.avantej9.config.ts
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3022";

export default defineConfig({
	testDir: "./web/sales",
	testMatch: "net-collected-refund.rule.spec.ts",
	outputDir: "./results/avantej9-artifacts",
	timeout: 60_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1,
	retries: 1,
	globalSetup: "./web/global-setup.api.ts",
	reporter: [["list"]],
	use: {
		baseURL,
		storageState: "_e2e/.auth/admin.json",
		video: "on",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		...devices["Desktop Chrome"],
	},
});
