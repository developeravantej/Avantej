import { defineConfig, devices } from "@playwright/test";

const TENANT_ADMIN_AUTH = "e2e/.auth/tenant-admin.json";

export default defineConfig({
	testDir: "./e2e",
	timeout: 60_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	retries: 0,
	workers: 1,
	reporter: "list",
	use: {
		baseURL: "http://localhost:3001",
		trace: "on-first-retry",
		video: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		// Setup project — produces e2e/.auth/tenant-admin.json once per run.
		{
			name: "setup",
			testMatch: /auth\.setup\.ts/,
		},

		// Smoke + fixes-verification — pre-authenticated so they don't redirect to /login.
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"], storageState: TENANT_ADMIN_AUTH },
			testMatch: /\.(smoke|fixes-verification)\.spec\.ts/,
			dependencies: ["setup"],
		},

		// Legacy dashboard batches — keep for smoke coverage; migrate to storageState
		// later. Currently they UI-login per spec; storageState makes that unnecessary.
		{
			name: "dashboard-e2e",
			use: { ...devices["Desktop Chrome"], storageState: TENANT_ADMIN_AUTH },
			testMatch: /\.dashboard\.spec\.ts/,
			dependencies: ["setup"],
		},

		// Onboarding flow — intentionally NO storageState; tests anonymous customer
		// scanning the QR code (incognito-equivalent context).
		{
			name: "onboarding-e2e",
			use: { ...devices["Desktop Chrome"] },
			testMatch: /branch-onboarding\.spec\.ts/,
		},

		// Sales-pipeline-fixes journey suite (Phase 0-7 e2e coverage, 2026-05-12).
		// Excludes .anon.journey.spec.ts — those run under journeys-anon (no storageState).
		{
			name: "journeys-e2e",
			use: { ...devices["Desktop Chrome"], storageState: TENANT_ADMIN_AUTH },
			testMatch: /(?<!anon)\.journey\.spec\.ts/,
			dependencies: ["setup"],
		},

		// Anonymous variant for journeys that need a fresh context (e.g. onboarding submit).
		{
			name: "journeys-anon",
			use: { ...devices["Desktop Chrome"] },
			testMatch: /\.anon\.journey\.spec\.ts/,
		},
	],
});
