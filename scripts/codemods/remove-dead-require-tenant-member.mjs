#!/usr/bin/env node
/**
 * Remove no-op requireTenantMember helpers left after tenantProcedure migration.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");

const DEAD_FN =
	/function requireTenantMember\(context: \{ tenantDb\?: unknown; member\?: unknown \}\) \{\s*\n\s*\n\s*\}\s*\n?/g;

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts")) continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	const before = content;

	content = content.replace(DEAD_FN, "");
	content = content.replace(/\s*requireTenantMember\(context\);\s*\n/g, "\n");
	content = content.replace(/context\.tenantDb!/g, "context.tenantDb");

	if (content !== before) {
		writeFileSync(path, content, "utf-8");
		console.log(`cleaned ${file}`);
	}
}
