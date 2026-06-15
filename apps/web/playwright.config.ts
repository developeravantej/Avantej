import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";
const serverPort = process.env.SERVER_PORT ?? "3020";
const serverHealthUrl =
	process.env.PLAYWRIGHT_SERVER_URL ?? `http://localhost:${serverPort}`;
const isCI = !!process.env.CI;

export default defineConfig({
	testDir: "./e2e/tests",
	globalSetup: "./e2e/global-setup.ts",
	timeout: 60_000,
	retries: isCI ? 1 : 0,
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL,
		trace: "on",
		video: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: isCI
		? [
				{
					command: "bun run dev:server",
					cwd: "../..",
					url: `${serverHealthUrl}/health`,
					timeout: 180_000,
					reuseExistingServer: false,
					env: { MOCK_GHL: "1" },
				},
				{
					command: "bun run dev:web",
					cwd: "../..",
					url: baseURL,
					timeout: 180_000,
					reuseExistingServer: false,
				},
			]
		: {
				command: "bun run dev",
				cwd: "../..",
				url: baseURL,
				timeout: 180_000,
				reuseExistingServer: true,
				env: { MOCK_GHL: "1" },
			},
});
