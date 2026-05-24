#!/usr/bin/env node
/**
 * CI gate: routers/index.ts must stay a thin assembly file (Plan D.2.1).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MAX_LINES = 150;
const indexPath = join(process.cwd(), "packages/api/src/routers/index.ts");
const lineCount = readFileSync(indexPath, "utf-8").split(/\r?\n/).length;

if (lineCount > MAX_LINES) {
	console.error(
		`Router index LOC check failed: ${indexPath} has ${lineCount} lines (max ${MAX_LINES}).`,
		);
	console.error(
		"Move wiring to base-router.ts or stubs to _types/ — run bun run gen:router-type-stubs if needed.",
	);
	process.exit(1);
}

console.log(`Router index LOC check passed (${lineCount}/${MAX_LINES}).`);
