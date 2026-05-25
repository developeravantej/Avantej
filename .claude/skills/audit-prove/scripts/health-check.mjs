#!/usr/bin/env node
/**
 * audit-prove BUILD GATE (universal).
 *
 * Resolves the build / type-check command in priority order:
 *   1. --build-cmd "<cmd>"                  (explicit override)
 *   2. --config <file> -> buildGate.command (resolved $SESSION/project.json)
 *   3. auto-detect from package.json scripts + lockfile package manager
 *
 * Clears stale *.tsbuildinfo first (harmless if none) so a stale incremental TS
 * cache can't mask a red build. Exit 0 = green (proceed to the browser stage);
 * non-zero = red (deliver the audit report only, skip test + video).
 *
 * Flags:
 *   --filter <pkg>   passed through to the build command IF buildGate.supportsFilter
 *   --root <dir>     repo root (default: cwd)
 *   --no-clean       skip the .tsbuildinfo sweep
 *
 * extraChecks from the config are printed as WARNINGS — commands the main gate is
 * known NOT to cover (e.g. packages a turbo gate skips). They are NOT run here.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (n, d = null) => {
	const i = args.indexOf(`--${n}`);
	return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const flag = (n) => args.includes(`--${n}`);
const root = arg("root", process.cwd());

// ── 1. resolve build command ──────────────────────────────────────
let buildCmd = arg("build-cmd", null);
let supportsFilter = false;
let extraChecks = [];
const configPath = arg("config", null);
if (!buildCmd && configPath && existsSync(configPath)) {
	try {
		const cfg = JSON.parse(readFileSync(configPath, "utf8"));
		buildCmd = cfg?.buildGate?.command ?? null;
		supportsFilter = !!cfg?.buildGate?.supportsFilter;
		extraChecks = Array.isArray(cfg?.buildGate?.extraChecks) ? cfg.buildGate.extraChecks : [];
	} catch (e) {
		console.warn(`[health] could not read --config ${configPath}: ${e.message}`);
	}
}
if (!buildCmd) {
	const has = (p) => existsSync(join(root, p));
	let pm = "npm";
	if (has("bun.lockb") || has("bun.lock")) pm = "bun";
	else if (has("pnpm-lock.yaml")) pm = "pnpm";
	else if (has("yarn.lock")) pm = "yarn";
	const run = (s) =>
		pm === "npm" ? `npm run ${s}` : pm === "pnpm" ? `pnpm run ${s}` : pm === "yarn" ? `yarn ${s}` : `bun run ${s}`;
	let scripts = {};
	try {
		scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts || {};
	} catch {
		/* ignore */
	}
	for (const s of ["check-types", "typecheck", "type-check", "types", "check", "build"]) {
		if (scripts[s]) {
			buildCmd = run(s);
			break;
		}
	}
	if (!buildCmd && has("tsconfig.json")) buildCmd = "npx tsc --noEmit";
	if (buildCmd) console.log(`[health] auto-detected build command: ${buildCmd}`);
}
if (!buildCmd) {
	console.error('[health] FAIL — no build command. Pass --build-cmd "<cmd>" or set buildGate.command in --config.');
	process.exit(2);
}

// ── 2. clear stale tsbuildinfo (harmless if none) ─────────────────
if (!flag("no-clean")) {
	const SKIP = new Set(["node_modules", ".git", "dist", ".turbo"]);
	let n = 0;
	const walk = (dir) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			if (SKIP.has(e.name)) continue;
			const p = join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".tsbuildinfo")) {
				try {
					rmSync(p);
					n++;
				} catch {
					/* ignore */
				}
			}
		}
	};
	try {
		walk(root);
	} catch {
		/* ignore */
	}
	console.log(`[health] cleared ${n} .tsbuildinfo file(s) — cold type-check`);
}

// ── 3. apply --filter (only if the gate supports it) ──────────────
const filter = arg("filter", null);
let cmd = buildCmd;
if (filter) {
	if (supportsFilter) cmd = `${buildCmd} --filter=${filter}`;
	else console.warn(`[health] --filter ${filter} ignored (buildGate.supportsFilter is not set)`);
}
console.log(`[health] running: ${cmd}`);

let code = 0;
try {
	execSync(cmd, { stdio: "inherit", cwd: root });
} catch (e) {
	code = typeof e.status === "number" ? e.status : 1;
}

// ── 4. surface extra-check blind spots (not run here) ─────────────
for (const c of extraChecks) {
	if (!c?.command) continue;
	console.warn(
		`[health] WARNING: the main gate does NOT cover this — run manually: ${c.command}${c.reason ? `  (${c.reason})` : ""}`,
	);
}

if (code === 0) {
	console.log("[health] PASS — build green. Proceed to test + video stage.");
	process.exit(0);
}
console.error("[health] FAIL — build is red. Deliver the audit report only; skip test + video.");
process.exit(code);
