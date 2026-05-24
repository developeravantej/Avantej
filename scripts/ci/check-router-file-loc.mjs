#!/usr/bin/env node
/**
 * CI gate: individual router files must not exceed LOC budget (Plan D-S7).
 * Legacy mega-routers are allowlisted until split; new violations fail CI.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");
const MAX_LINES = 400;

/** Known mega-routers tracked for D-S7 split — do not add new files here. */
const ALLOWLIST = new Set([
	"package-instances.ts",
	"members.ts",
	"hierarchy.ts",
	"appointments.ts",
	"services.ts",
	"commission-splits.ts",
	"invitations.ts",
	"class-slots.ts",
	"refunds.ts",
]);

const SKIP = new Set(["index.ts", "base-router.ts"]);

const violations = [];

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts") || SKIP.has(file)) {
		continue;
	}
	const path = join(routersDir, file);
	const lineCount = readFileSync(path, "utf-8").split(/\r?\n/).length;
	if (lineCount <= MAX_LINES) continue;
	if (ALLOWLIST.has(file)) continue;
	violations.push(`${file}: ${lineCount} lines (max ${MAX_LINES}, not allowlisted)`);
}

if (violations.length > 0) {
	console.error("Router file LOC check failed:\n");
	for (const v of violations) console.error(`  - ${v}`);
	console.error(
		"\nSplit the router or add to ALLOWLIST only for tracked D-S7 mega-router work.",
	);
	process.exit(1);
}

console.log(
	`Router file LOC check passed (≤${MAX_LINES} LOC, ${ALLOWLIST.size} mega-routers allowlisted).`,
);
