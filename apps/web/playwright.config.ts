import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e/tests",
	globalSetup: "./e2e/global-setup.ts",
	timeout: 60_000,
	retries: 0,
	workers: 1, // Sequential — DB writes share state across checkpoints
	reporter: [["list"]],
	use: {
		baseURL: "http://localhost:3001",
		trace: "on",
		video: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
	],
	webServer: {
		// Run from repo root so turbo/bun workspace resolves correctly.
		// MOCK_GHL=1 short-circuits GHL HTTP calls in apps/server/src/services/ghl/http-client.ts.
		command: "MOCK_GHL=1 bun dev",
		cwd: "../..",
		url: "http://localhost:3001",
		timeout: 120_000,
		reuseExistingServer: !process.env.CI,
		env: {
			MOCK_GHL: "1",
		},
	},
});
