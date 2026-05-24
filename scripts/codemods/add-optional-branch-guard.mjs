#!/usr/bin/env node
/**
 * Guard optional input.branchId before passing to services (Plan C.1.3).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");
const SKIP = new Set(["registration.ts", "onboarding.ts", "index.ts"]);

const PROC_SPLIT =
	/(?=(?:^|\n)(?:export const \w+Router = \{|const \w+ = tenantProcedure|\t\w+: tenantProcedure))/m;

const OPTIONAL_BRANCH = /branchId: z\.string\(\)\.uuid\(\)\.optional\(\)/;

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
	return content;
}

function patchBlock(block) {
	const inputPart = block.split(".handler")[0] ?? block;
	if (!inputPart.includes("tenantProcedure") || !OPTIONAL_BRANCH.test(inputPart)) {
		return block;
	}
	if (
		block.includes("guardBranchAccessible(") ||
		block.includes("includes(input.branchId)")
	) {
		return block;
	}
	if (!block.includes("input.branchId")) return block;

	const guardBlock =
		"\t\tif (input.branchId) {\n\t\t\tguardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);\n\t\t}\n";

	if (block.includes("assertOrgContextMatch(context, input);")) {
		return block.replace(
			/assertOrgContextMatch\(context, input\);\n/,
			`assertOrgContextMatch(context, input);\n${guardBlock}`,
		);
	}
	return block.replace(
		/(\.handler\(async \(\{\s*(?:input, context|context, input)\s*\}\) => \{\s*\n)/,
		`$1${guardBlock}`,
	);
}

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts") || SKIP.has(file)) continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	if (!content.includes("tenantProcedure") || !OPTIONAL_BRANCH.test(content)) continue;

	const before = content;
	const parts = content.split(PROC_SPLIT);
	content = parts.map((part, i) => (i === 0 ? part : patchBlock(part))).join("");

	if (content !== before) {
		content = ensureImport(content);
		writeFileSync(path, content, "utf-8");
		console.log(`added optional branch guard in ${file}`);
	}
}
