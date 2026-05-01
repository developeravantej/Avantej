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
		// Boot web (vite) and server (wrangler dev) in parallel from repo root.
		// Server uses --var to bind MOCK_GHL=1 inside the Worker (process.env
		// in Workers comes from wrangler bindings, not OS env).
		command:
			'(cd apps/server && bunx wrangler dev --port=3000 --local-protocol=http --ip=0.0.0.0 --var MOCK_GHL:1) & (cd apps/web && bun run dev) & wait',
		cwd: "../..",
		cwd: "../..",
		url: "http://localhost:3001",
		timeout: 120_000,
		reuseExistingServer: !process.env.CI,
		env: {
			MOCK_GHL: "1",
		},
	},
});
