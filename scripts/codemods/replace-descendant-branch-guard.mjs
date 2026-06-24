#!/usr/bin/env node
/**
 * Replace duplicated getDescendantNodeIds + includes(input.branchId) blocks
 * with guardInputBranchForContext (Plan C.1.3).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");

const INPUT_BRANCH_BLOCK =
	/if \(input\.branchId\) \{\s*const accessibleNodeIds =\s*context\.accessibleNodeIds \?\?\s*\(context\.member\s*\?\s*await getDescendantNodeIds\(\s*context\.tenantDb,\s*context\.member\.hierarchyScopeId\s*\)\s*:\s*\[\]\);\s*if \(!accessibleNodeIds\.includes\(input\.branchId\)\) \{\s*throw new ORPCError\("FORBIDDEN", \{\s*message: "[^"]*",\s*\}\);\s*\}\s*\}/g;

const ENTITY_BRANCH_BLOCK =
	/const accessibleNodeIds =\s*context\.accessibleNodeIds \?\?\s*\(context\.member\s*\?\s*await getDescendantNodeIds\(\s*context\.tenantDb,\s*context\.member\.hierarchyScopeId\s*\)\s*:\s*\[\]\);\s*if \(!accessibleNodeIds\.includes\((\w+)\.branchId\)\) \{\s*throw new ORPCError\("FORBIDDEN", \{\s*message: "[^"]*",\s*\}\);\s*\}/g;

const POS_INLINE =
	/const accessibleNodeIds = context\.accessibleNodeIds ?? \[\];\s*if \(!accessibleNodeIds\.includes\(input\.branchId\)\) \{\s*throw new ORPCError\("FORBIDDEN", \{\s*message: "[^"]*",\s*\}\);\s*\}/g;

const INPUT_BRANCH_AFTER_RESOLVE =
	/if \(input\.branchId !== undefined && input\.branchId !== null\) \{\s*if \(!accessibleNodeIds\.includes\(input\.branchId\)\) \{\s*throw new ORPCError\("FORBIDDEN", \{\s*message: "[^"]*",\s*\}\);\s*\}\s*\}\s*/g;

const OPTIONAL_INPUT_BRANCH_BLOCK =
	/if \(input\.branchId\) \{\s*const accessibleNodeIds =\s*context\.accessibleNodeIds \?\?\s*\(context\.member\s*\?\s*await getDescendantNodeIds\(\s*context\.tenantDb,\s*context\.member\.hierarchyScopeId,?\s*\)\s*:\s*\[\]\);\s*if \(!accessibleNodeIds\.includes\(input\.branchId\)\) \{\s*throw new ORPCError\("FORBIDDEN", \{\s*message: "[^"]*",\s*\}\);\s*\}\s*\}/g;

function ensureImport(content) {
	if (!content.includes("guardInputBranchForContext")) return content;
	if (
		/guardInputBranchForContext/.test(
			content.match(/import \{[^}]*\} from "\.\.\/guards"/)?.[0] ?? "",
		)
	) {
		return content;
	}
	return content.replace(
		/import \{([^}]+)\} from "\.\.\/guards";/,
		(_m, imp) =>
			imp.includes("guardInputBranchForContext")
				? _m
				: `import {${imp.trim()}, guardInputBranchForContext } from "../guards";`,
	);
}

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	const before = content;

	content = content.replace(
		INPUT_BRANCH_BLOCK,
		"await guardInputBranchForContext(context, input.branchId);",
	);
	content = content.replace(
		ENTITY_BRANCH_BLOCK,
		"await guardInputBranchForContext(context, $1.branchId);",
	);
	content = content.replace(
		POS_INLINE,
		"await guardInputBranchForContext(context, input.branchId);",
	);
	content = content.replace(
		OPTIONAL_INPUT_BRANCH_BLOCK,
		"await guardInputBranchForContext(context, input.branchId);",
	);
	content = content.replace(
		INPUT_BRANCH_AFTER_RESOLVE,
		"await guardInputBranchForContext(context, input.branchId);\n",
	);

	if (content !== before) {
		content = ensureImport(content);
		writeFileSync(path, content, "utf-8");
		console.log(`replaced descendant branch guard in ${file}`);
	}
}
