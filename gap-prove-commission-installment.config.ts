import { defineConfig, devices } from "@playwright/test";

/**
 * Session-scoped Playwright config for
 *   zplan/2026-05-27-1700-audit-prove-a-commission-installment
 *
 * Runs ONLY gap-prove-commission-installment.spec.ts with the tenant-admin
 * storageState. Always-on video so the final pass becomes the proof video.
 *
 * Usage:
 *   bunx playwright test -c gap-prove-commission-installment.config.ts
 */

const TENANT_ADMIN_AUTH = "e2e/.auth/tenant-admin.json";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

export default defineConfig({
	testDir: "./e2e",
	timeout: 120_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	retries: 0,
	workers: 1,
	reporter: [["list"], ["json", { outputFile: "test-results/gap-prove-results.json" }]],
	use: {
		baseURL,
		trace: "on",
		video: "on",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "setup",
			testMatch: /auth\.setup\.ts/,
		},
		{
			name: "gap-prove-commission-installment",
			use: { ...devices["Desktop Chrome"], storageState: TENANT_ADMIN_AUTH },
			testMatch: /gap-prove-commission-installment\.spec\.ts/,
			dependencies: ["setup"],
		},
	],
});
