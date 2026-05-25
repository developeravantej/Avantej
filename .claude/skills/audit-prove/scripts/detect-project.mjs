#!/usr/bin/env node
/**
 * audit-prove PROJECT DETECTOR (universal, zero-dependency).
 *
 * Emits a resolved project config (JSON) describing how to BUILD the repo, where
 * its API surface + routes live, and how to drive Playwright — so nothing in this
 * skill is hardcoded to one repo. The conductor runs this in Phase 0, then REVIEWS
 * and corrects the result (detection is heuristic), and saves it to
 * $SESSION/project.json.
 *
 * Usage:
 *   node scripts/detect-project.mjs [--root <dir>] [--out <file>]
 *
 * Prints the JSON to stdout; also writes to --out if given. Human-readable REVIEW
 * warnings go to stderr (so they don't pollute the JSON on stdout).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (n, d = null) => {
	const i = args.indexOf(`--${n}`);
	return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const root = arg("root", process.cwd());
const out = arg("out", null);

const has = (p) => existsSync(join(root, p));
const readJson = (p) => {
	try {
		return JSON.parse(readFileSync(join(root, p), "utf8"));
	} catch {
		return null;
	}
};

// ── package manager (from lockfile) ───────────────────────────────
let pm = "npm";
if (has("bun.lockb") || has("bun.lock")) pm = "bun";
else if (has("pnpm-lock.yaml")) pm = "pnpm";
else if (has("yarn.lock")) pm = "yarn";
const runScript = (s) =>
	pm === "npm"
		? `npm run ${s}`
		: pm === "pnpm"
			? `pnpm run ${s}`
			: pm === "yarn"
				? `yarn ${s}`
				: `bun run ${s}`;

const pkg = readJson("package.json") || {};
const scripts = pkg.scripts || {};
const isMonorepo =
	!!pkg.workspaces || has("turbo.json") || has("pnpm-workspace.yaml");

// ── build / type-check command ────────────────────────────────────
let buildCommand = null;
for (const s of ["check-types", "typecheck", "type-check", "types", "tsc", "check", "build"]) {
	if (scripts[s]) {
		buildCommand = runScript(s);
		break;
	}
}
if (!buildCommand && has("tsconfig.json")) buildCommand = "npx tsc --noEmit";
const supportsFilter = isMonorepo && /turbo/.test(buildCommand || "");

// ── source globs: include every candidate dir that exists ─────────
const pick = (cands) => cands.filter((c) => has(c.dir)).map((c) => c.glob);
const routerGlobs = pick([
	{ dir: "packages/api/src/routers", glob: "packages/api/src/routers/**/*.ts" },
	{ dir: "apps/server/src/routers", glob: "apps/server/src/routers/**/*.ts" },
	{ dir: "src/routers", glob: "src/routers/**/*.ts" },
	{ dir: "src/controllers", glob: "src/controllers/**/*.ts" },
	{ dir: "src/api", glob: "src/api/**/*.ts" },
	{ dir: "app/api", glob: "app/api/**/route.{ts,tsx}" },
	{ dir: "src/app/api", glob: "src/app/api/**/route.{ts,tsx}" },
	{ dir: "pages/api", glob: "pages/api/**/*.ts" },
	{ dir: "src/server", glob: "src/server/**/*.ts" },
]);
const serviceGlobs = pick([
	{ dir: "packages/services/src", glob: "packages/services/src/**/*.ts" },
	{ dir: "src/services", glob: "src/services/**/*.ts" },
	{ dir: "src/lib", glob: "src/lib/**/*.ts" },
	{ dir: "lib", glob: "lib/**/*.ts" },
]);
const routeGlobs = pick([
	{ dir: "apps/web/src/routes", glob: "apps/web/src/routes/**/*.tsx" },
	{ dir: "src/routes", glob: "src/routes/**/*.tsx" },
	{ dir: "app", glob: "app/**/page.{tsx,jsx}" },
	{ dir: "src/app", glob: "src/app/**/page.{tsx,jsx}" },
	{ dir: "pages", glob: "pages/**/*.tsx" },
	{ dir: "src/pages", glob: "src/pages/**/*.tsx" },
]);

// ── context hub (optional) ────────────────────────────────────────
const hub = {};
if (has("zhub/index.md")) hub.index = "zhub/index.md";
if (has("zhub/shared/api-overview.md")) hub.apiOverview = "zhub/shared/api-overview.md";
if (has("zhub/pages")) hub.pagesDir = "zhub/pages";

// ── Playwright config scan (best-effort) ──────────────────────────
const pwFiles = [
	"playwright.config.ts",
	"playwright.config.js",
	"playwright.config.mjs",
].filter(has);
let baseURL = null;
let testDir = "e2e";
let authStorageState = null;
let setupTestMatch = null;
let devServerCommand = null;
if (pwFiles.length) {
	const txt = readFileSync(join(root, pwFiles[0]), "utf8");
	const m = (re) => {
		const x = txt.match(re);
		return x ? x[1] : null;
	};
	// matches both `baseURL: "http://..."` and `const baseURL = process.env.X ?? "http://..."`
	baseURL = m(/(?:baseURL|baseUrl)\s*[:=]\s*[^"'`\n]*["'`](https?:\/\/[^"'`]+)["'`]/);
	testDir = m(/testDir\s*:\s*["'`]([^"'`]+)["'`]/) || testDir;
	authStorageState = m(/storageState\s*:\s*["'`]([^"'`]+)["'`]/);
	// store the LOGICAL filename (unescaped) — gen-playwright-config.mjs re-escapes it
	const rawSetup = m(/testMatch\s*:\s*\/([^/]+)\//);
	setupTestMatch = rawSetup ? rawSetup.replace(/\\/g, "") : null;
	devServerCommand = m(/webServer\s*:\s*\{[\s\S]*?command\s*:\s*["'`]([^"'`]+)["'`]/);
}
// fall back to an existing auth-state file if the config didn't name one
if (!authStorageState) {
	for (const d of [".auth", "e2e/.auth", "tests/.auth"]) {
		if (!has(d)) continue;
		try {
			const f = readdirSync(join(root, d)).find((x) => x.endsWith(".json"));
			if (f) {
				authStorageState = `${d}/${f}`;
				break;
			}
		} catch {
			/* ignore */
		}
	}
}
if (!devServerCommand) {
	if (scripts.dev) devServerCommand = runScript("dev");
	else if (scripts.start) devServerCommand = runScript("start");
}

// ── database verification (optional) ──────────────────────────────
const dbHelper = [
	"apps/server/src/tests/helpers/integration-setup.ts",
	"src/tests/helpers/integration-setup.ts",
	"tests/helpers/integration-setup.ts",
	"src/test/helpers/db.ts",
].find(has);
const devVarsFile = [
	"apps/server/.dev.vars",
	".dev.vars",
	".env.test",
	".env.local",
	".env",
].find(has);
const multiTenant = has("packages/db/src/schema/tenant") || /tenant/i.test(dbHelper || "");
const dbRunner = pm === "bun" ? "bun" : "npx tsx";
const dbEnabled = !!(dbHelper || devVarsFile);

const config = {
	$generatedBy: "audit-prove/scripts/detect-project.mjs",
	$note:
		"Best-effort detection. REVIEW before use — globs / baseURL / auth may need correcting. Then save as $SESSION/project.json.",
	stack: "",
	conventions: "",
	packageManager: pm,
	monorepo: isMonorepo,
	buildGate: { command: buildCommand, supportsFilter, extraChecks: [] },
	apiSurface: { routerGlobs, serviceGlobs },
	routes: { routeGlobs, clientPattern: "" },
	hub,
	e2e: {
		testDir,
		baseURL,
		authStorageState,
		setupTestMatch,
		devServerCommand,
		specName: "gap-prove",
	},
	domainStrategy: "auto",
	remediation: {
		enabled: true,
		scope: "full", // build-and-proof | partial | full
		maxIterations: 6,
		maxFixesPerTarget: 3,
		stopOnNoProgress: true,
		branch: "audit-prove/remediation",
		parallelFixAgents: 3,
		fixPolicy: {
			latitude: "touched-path", // surgical | touched-path | aggressive
			flagLargeRefactorsAs: "deferred-finding",
		},
	},
	db: {
		enabled: dbEnabled,
		verifyMode: "auto", // auto = direct DB where reachable, else API read-back
		runner: dbRunner,
		connectionEnv: "DATABASE_URL",
		devVarsFile: devVarsFile || null,
		verifyHelper: dbHelper || null,
		multiTenant,
		testOrgId: null,
	},
};

const json = JSON.stringify(config, null, 2);
if (out) {
	writeFileSync(out, json);
	console.error(`[detect] wrote ${out}`);
}
process.stdout.write(`${json}\n`);

const warn = [];
if (!buildCommand)
	warn.push("no build/type-check command found — set buildGate.command or pass --build-cmd to the gate");
if (!routerGlobs.length)
	warn.push("no API-surface dirs matched — set apiSurface.routerGlobs manually");
if (!baseURL) warn.push("no Playwright baseURL detected — set e2e.baseURL (or pass --base-url)");
if (!authStorageState)
	warn.push("no auth storageState detected — the run will be UNAUTHENTICATED unless you set e2e.authStorageState");
if (!dbEnabled)
	warn.push("no DB helper/creds detected — persistence checks will fall back to API read-back (set db.* to assert the real rows)");
if (dbEnabled && multiTenant && !dbHelper)
	warn.push("multi-tenant DB but no integration helper found — set db.verifyHelper so persistence checks reach the right tenant DB");
if (dbEnabled && multiTenant)
	warn.push("set db.testOrgId to the org/tenant the proof runs against (persistence checks need the right tenant branch)");
if (warn.length) console.error(`[detect] REVIEW:\n - ${warn.join("\n - ")}`);
