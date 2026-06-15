#!/usr/bin/env node
/**
 * CI gate: individual router files must not exceed LOC budget (Plan D-S7).
 * Scans top-level routers and split-router subfolders (e.g. services/*.procedures.ts).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Router roots scanned by the gate. Both the shared API routers and the
 * server-only routers are held to the same per-file LOC budget. */
const ROUTER_ROOTS = [
	"packages/api/src/routers",
	"apps/server/src/routers",
].map((d) => join(process.cwd(), d));
const MAX_LINES = 400;

/** Known mega-routers tracked for D-S7 split — empty when all routers are modularized. */
const ALLOWLIST = new Set([]);

const SKIP = new Set(["index.ts", "base-router.ts"]);

const violations = [];

function checkFile(rootDir, relativePath) {
	const base = relativePath.split(/[/\\]/).pop() ?? relativePath;
	if (base.endsWith(".test.ts") || SKIP.has(base)) return;
	if (relativePath.includes("_types")) return;

	const path = join(rootDir, relativePath);
	const lineCount = readFileSync(path, "utf-8").split(/\r?\n/).length;
	if (lineCount <= MAX_LINES) return;
	if (ALLOWLIST.has(base)) return;
	violations.push(`${relativePath}: ${lineCount} lines (max ${MAX_LINES})`);
}

function walk(rootDir, dir, prefix = "") {
	for (const entry of readdirSync(dir)) {
		const rel = prefix ? `${prefix}/${entry}` : entry;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (entry === "_types") continue;
			walk(rootDir, full, rel);
			continue;
		}
		if (!entry.endsWith(".ts")) continue;
		checkFile(rootDir, rel.replace(/\\/g, "/"));
	}
}

for (const root of ROUTER_ROOTS) walk(root, root);

if (violations.length > 0) {
	console.error("Router file LOC check failed:\n");
	for (const v of violations) console.error(`  - ${v}`);
	console.error(
		"\nSplit with: node scripts/split-router-by-marker.mjs <router> <module:procs...>",
	);
	process.exit(1);
}

console.log(
	`Router file LOC check passed (≤${MAX_LINES} LOC, ${ALLOWLIST.size} mega-routers allowlisted).`,
);
