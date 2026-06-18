import { defineConfig, devices } from "@playwright/test";

const TENANT_ADMIN_AUTH = "e2e/.auth/tenant-admin.json";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";
const serverHealthUrl =
	process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:3020";

const isCI = !!process.env.CI;

export default defineConfig({
	testDir: "./e2e",
	timeout: 60_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	retries: isCI ? 1 : 0,
	workers: 1,
	reporter: isCI ? [["list"], ["github"]] : "list",
	use: {
		baseURL,
		trace: "on-first-retry",
		// PW_VIDEO=on records video for passing runs too (demo/proof runs).
		video: process.env.PW_VIDEO === "on" ? "on" : "retain-on-failure",
		screenshot: "only-on-failure",
	},
	webServer: isCI
		? [
				{
					command: "bun run dev:server",
					url: `${serverHealthUrl}/health`,
					reuseExistingServer: false,
					timeout: 180_000,
				},
				{
					command: "bun run dev:web",
					url: baseURL,
					reuseExistingServer: false,
					timeout: 180_000,
				},
			]
		: undefined,
	projects: [
		{
			name: "setup",
			testMatch: /auth\.setup\.ts/,
		},
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"], storageState: TENANT_ADMIN_AUTH },
			// The smoke files are literally smoke.spec.ts / fixes-verification.spec.ts
			// (no module prefix) — requiring a leading dot matched nothing, which
			// broke `bun e2e:smoke` and the CI smoke workflow ("No tests found").
			testMatch: /(^|[\\/])(smoke|fixes-verification)\.spec\.ts$/,
			dependencies: ["setup"],
		},
		{
			name: "dashboard-e2e",
			use: { ...devices["Desktop Chrome"], storageState: TENANT_ADMIN_AUTH },
			testMatch: /\.dashboard\.spec\.ts/,
			dependencies: ["setup"],
		},
		{
			name: "onboarding-e2e",
			use: { ...devices["Desktop Chrome"] },
			testMatch: /branch-onboarding\.spec\.ts/,
		},
		{
			name: "journeys-e2e",
			use: { ...devices["Desktop Chrome"], storageState: TENANT_ADMIN_AUTH },
			testMatch: /(?<!anon)\.journey\.spec\.ts/,
			dependencies: ["setup"],
		},
		{
			name: "journeys-e2e-firefox",
			use: { ...devices["Desktop Firefox"], storageState: TENANT_ADMIN_AUTH },
			testMatch: /(?<!anon)\.journey\.spec\.ts/,
			dependencies: ["setup"],
		},
		{
			name: "journeys-e2e-webkit",
			use: { ...devices["Desktop Safari"], storageState: TENANT_ADMIN_AUTH },
			testMatch: /(?<!anon)\.journey\.spec\.ts/,
			dependencies: ["setup"],
		},
		{
			name: "journeys-anon",
			use: { ...devices["Desktop Chrome"] },
			testMatch: /\.anon\.journey\.spec\.ts/,
		},
	],
});
