import { defineConfig, devices } from "@playwright/test";

// audit-prove session 2026-05-27-0231-audit-prove-commission — deep verification
// of F-05/F-06/F-08. Single continuous session; expect.soft throughout.
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
		["html", { outputFolder: `${SESSION}/test/html-deep`, open: "never" }],
		["json", { outputFile: `${SESSION}/test/results-deep.json` }],
	],
	use: {
		baseURL,
		video: "on",
		trace: "on",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "gap-prove-commission-deep",
			use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
			testMatch: /gap-prove-commission-deep\.spec\.ts/,
		},
	],
});
