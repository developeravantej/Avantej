import { defineConfig, devices } from "@playwright/test";

/**
 * Dedicated config for the /e2e review suite (module-grouped, video-recorded).
 * Separate from the repo's root playwright.config.ts so it can't disturb CI.
 *
 * Run:  bunx playwright test --config _e2e/playwright.config.ts
 * Then: node <skill>/scripts/gen-review-html.mjs --source playwright
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

export default defineConfig({
	testDir: "./web",
	outputDir: "./results/test-artifacts",
	timeout: 60_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1,
	retries: 1,
	globalSetup: "./web/global-setup.ts",
	reporter: [["list"], ["json", { outputFile: "./results/report.json" }]],
	use: {
		baseURL,
		storageState: "_e2e/.auth/admin.json",
		video: "on",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		...devices["Desktop Chrome"],
	},
});
