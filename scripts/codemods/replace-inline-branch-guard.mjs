#!/usr/bin/env node
/**
 * Replace inline branch scope checks with guardBranchAccessible (Plan C.1.3).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");

const INLINE_GUARD =
	/const accessibleNodeIds = context\.accessibleNodeIds ?? \[\];\s*\n\s*if \(!accessibleNodeIds\.includes\(input\.branchId\)\) \{\s*\n\s*throw new ORPCError\("FORBIDDEN", \{\s*\n\s*message: "[^"]*",\s*\n\s*\}\);\s*\n\s*\}\s*\n/g;

const INLINE_GUARD_LEN =
	/if \(accessibleNodeIds\.length > 0 && !accessibleNodeIds\.includes\(input\.branchId\)\) \{\s*\n[\s\S]*?throw new ORPCError\("FORBIDDEN"[\s\S]*?\}\s*\n\s*\}\s*\n/g;

function ensureImport(content) {
	if (content.includes("guardBranchAccessible")) return content;
	if (content.includes('from "../guards"')) {
		return content.replace(
			/import \{([^}]+)\} from "\.\.\/guards";/,
			(_m, imp) =>
				imp.includes("guardBranchAccessible")
					? _m
					: `import {${imp.trim()}, guardBranchAccessible } from "../guards";`,
		);
	}
	return content.replace(
		/(import \{ tenantProcedure \} from "\.\.\/index";)/,
		'$1\nimport { guardBranchAccessible } from "../guards";',
	);
}

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	const before = content;

	content = content.replace(
		INLINE_GUARD,
		"guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);\n",
	);
	content = content.replace(
		INLINE_GUARD_LEN,
		"guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);\n",
	);

	if (content !== before) {
		content = ensureImport(content);
		writeFileSync(path, content, "utf-8");
		console.log(`replaced inline branch guard in ${file}`);
	}
}
