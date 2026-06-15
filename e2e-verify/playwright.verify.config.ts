import { defineConfig, devices } from "@playwright/test";

/**
 * Standalone Playwright config for post-simplification verification against the
 * RUNNING dev app (web :3021 → server :3020). Records video for every test
 * (not just failures) so the journeys can be reviewed. Kept separate from the
 * project's e2e/playwright.config.ts (which targets a :3001 preview build with
 * tenant-admin storageState).
 */
export default defineConfig({
	testDir: ".",
	timeout: 90_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [["list"], ["json", { outputFile: ".results/report.json" }]],
	outputDir: ".results",
	use: {
		baseURL: "http://localhost:3021",
		video: "on",
		screenshot: "on",
		trace: "retain-on-failure",
		actionTimeout: 15_000,
	},
	projects: [{ name: "verify", use: { ...devices["Desktop Chrome"] } }],
});
