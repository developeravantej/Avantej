#!/usr/bin/env node
/**
 * Strip redundant tenantDb/member guards from tenantProcedure handlers.
 * Safe patterns only — does not touch registration.ts or helper functions.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");

const STRIP_PATTERNS = [
	/if \(!context\.tenantDb\) throw new ORPCError\("INTERNAL_SERVER_ERROR", \{ message: "[^"]*" \}\);\s*\n/g,
	/if \(!context\.member\) throw new ORPCError\("FORBIDDEN", \{ message: "[^"]*" \}\);\s*\n/g,
	/if \(!context\.tenantDb \|\| !context\.member\) throw new ORPCError\("FORBIDDEN"\);\s*\n/g,
	/if \(!context\.tenantDb\) \{\s*throw new ORPCError\("INTERNAL_SERVER_ERROR",[\s\S]*?\}\);\s*\}\s*\n/g,
	/if \(!context\.member\) \{\s*throw new ORPCError\("(FORBIDDEN|UNAUTHORIZED)",[\s\S]*?\}\);\s*\}\s*\n/g,
];

const SKIP = new Set(["registration.ts", "onboarding.ts", "index.ts"]);

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts") || SKIP.has(file))
		continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	if (!content.includes("tenantProcedure")) continue;

	const before = content;
	for (const pattern of STRIP_PATTERNS) {
		content = content.replace(pattern, "");
	}
	content = content.replace(/\n{3,}/g, "\n\n");

	if (content !== before) {
		writeFileSync(path, content, "utf-8");
		console.log(`stripped guards in ${file}`);
	}
}
