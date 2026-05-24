#!/usr/bin/env node
/**
 * CI gate: individual router files must not exceed LOC budget (Plan D-S7).
 * Scans top-level routers and split-router subfolders (e.g. services/*.procedures.ts).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");
const MAX_LINES = 400;

/** Known mega-routers tracked for D-S7 split — remove when fully modularized. */
const ALLOWLIST = new Set([
	"package-instances.ts",
	"invitations.ts",
]);

const SKIP = new Set(["index.ts", "base-router.ts"]);

const violations = [];

function checkFile(relativePath) {
	const base = relativePath.split(/[/\\]/).pop() ?? relativePath;
	if (base.endsWith(".test.ts") || SKIP.has(base)) return;
	if (relativePath.includes("_types")) return;

	const path = join(routersDir, relativePath);
	const lineCount = readFileSync(path, "utf-8").split(/\r?\n/).length;
	if (lineCount <= MAX_LINES) return;
	if (ALLOWLIST.has(base)) return;
	violations.push(`${relativePath}: ${lineCount} lines (max ${MAX_LINES})`);
}

function walk(dir, prefix = "") {
	for (const entry of readdirSync(dir)) {
		const rel = prefix ? `${prefix}/${entry}` : entry;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (entry === "_types") continue;
			walk(full, rel);
			continue;
		}
		if (!entry.endsWith(".ts")) continue;
		checkFile(rel.replace(/\\/g, "/"));
	}
}

walk(routersDir);

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
