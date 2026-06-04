import { defineConfig, devices } from "@playwright/test";

/**
 * Journey suite — deep end-user journeys + operation pipelines, recorded for review.
 *
 * Targets the RUNNING dev app on FREE ports (server :3000 ← web :3001) using the
 * plain wrangler + vite-proxy path (NOT Alchemy — that path is pinned to :3020/:3021
 * and breaks on alternate ports). Standard avantej dev ports were occupied by another
 * worktree, so we remap with the proven var recipe (CORS_ORIGIN / BETTER_AUTH_URL /
 * WEB_APP_URL + SERVER_PORT for the vite proxy).
 *
 * video:on + screenshot:on + trace:on so EVERY test (passing too) produces artifacts
 * for the HTML review page (see e2e/journeys/build-review.ts).
 *
 * Run: bunx playwright test --config playwright.journeys.config.ts
 */

const ADMIN_AUTH = "e2e/journeys/.auth/tenant-admin.json";
const PLATFORM_AUTH = "e2e/journeys/.auth/platform-admin.json";
const STAFF_AUTH = "e2e/journeys/.auth/scoped-staff.json";

const SERVER_BOOT =
	"(cd apps/server && ../../node_modules/.bin/wrangler dev --port=3000 --local-protocol=http --ip=127.0.0.1 --var CORS_ORIGIN:http://localhost:3001 --var BETTER_AUTH_URL:http://localhost:3000 --var WEB_APP_URL:http://localhost:3001 --var MOCK_GHL:1)";
const WEB_BOOT =
	"(cd apps/web && SERVER_PORT=3000 ../../node_modules/.bin/vite --port=3001 --strictPort)";

export default defineConfig({
	testDir: "./e2e/journeys",
	timeout: 120_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1, // sequential — shared tenant DB state
	retries: 0,
	reporter: [["list"], ["json", { outputFile: "e2e/journeys/.results/report.json" }]],
	outputDir: "e2e/journeys/.results/artifacts",
	use: {
		baseURL: "http://localhost:3001",
		video: "on",
		screenshot: "on",
		trace: "on",
		actionTimeout: 20_000,
	},
	projects: [
		// ── Setup projects: produce storageState per role ──────────────────────────
		{ name: "setup-admin", testMatch: /_auth\.admin\.setup\.ts/ },
		{ name: "setup-platform", testMatch: /_auth\.platform\.setup\.ts/ },
		{ name: "setup-staff", testMatch: /_auth\.staff\.setup\.ts/, dependencies: ["setup-admin"] },

		// ── Tenant-admin journeys (the bulk of the suite) ──────────────────────────
		{
			name: "admin-journeys",
			use: { ...devices["Desktop Chrome"], storageState: ADMIN_AUTH },
			testMatch: /\.admin\.journey\.spec\.ts/,
			dependencies: ["setup-admin"],
		},

		// ── Scoped-staff journeys (RBAC deny / hierarchy scoping) ──────────────────
		{
			name: "staff-journeys",
			use: { ...devices["Desktop Chrome"], storageState: STAFF_AUTH },
			testMatch: /\.staff\.journey\.spec\.ts/,
			dependencies: ["setup-staff"],
		},

		// ── Platform-admin journeys ────────────────────────────────────────────────
		{
			name: "platform-journeys",
			use: { ...devices["Desktop Chrome"], storageState: PLATFORM_AUTH },
			testMatch: /\.platform\.journey\.spec\.ts/,
			dependencies: ["setup-platform"],
		},

		// ── Anonymous journeys (login failure, onboarding, invite accept) ──────────
		{
			name: "anon-journeys",
			use: { ...devices["Desktop Chrome"] },
			testMatch: /\.anon\.journey\.spec\.ts/,
		},
	],
	webServer: {
		command: `${SERVER_BOOT} & ${WEB_BOOT} & wait`,
		cwd: ".",
		url: "http://localhost:3001",
		reuseExistingServer: true,
		timeout: 180_000,
	},
});
