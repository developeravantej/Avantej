import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";
const AUTH_STATE = "e2e/.auth/tenant-admin.json";
const SESSION = "zplan/2026-05-27-0231-audit-prove-commission";

export default defineConfig({
	testDir: "./e2e",
	timeout: 300_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	workers: 1,
	reporter: [
		["list"],
		["json", { outputFile: `${SESSION}/test/results-state-machine.json` }],
	],
	use: { baseURL, video: "on", trace: "on", screenshot: "only-on-failure" },
	projects: [
		{
			name: "state-machine",
			use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
			testMatch: /gap-prove-payouts-state-machine\.spec\.ts/,
		},
	],
});
