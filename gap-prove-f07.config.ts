import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";
const AUTH_STATE = "e2e/.auth/tenant-admin.json";
const SESSION = "zplan/2026-05-27-0231-audit-prove-commission";

export default defineConfig({
	testDir: "./e2e",
	timeout: 120_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	workers: 1,
	reporter: [
		["list"],
		["json", { outputFile: `${SESSION}/test/results-f07.json` }],
	],
	use: {
		baseURL,
		video: "on",
		trace: "on",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "f07",
			use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
			testMatch: /gap-prove-f07-refund-lock\.spec\.ts/,
		},
	],
});
