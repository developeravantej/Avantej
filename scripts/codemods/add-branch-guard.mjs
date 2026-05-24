#!/usr/bin/env node
/**
 * Add guardBranchAccessible for required input.branchId on tenantProcedure handlers.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");
const SKIP = new Set(["registration.ts", "onboarding.ts", "index.ts"]);

const PROC_SPLIT =
	/(?=(?:^|\n)(?:export const \w+Router = \{|const \w+ = tenantProcedure|\t\w+: tenantProcedure|\t\w+: tenantProcedure))/m;

const REQUIRED_BRANCH = /branchId: z\.string\(\)\.uuid\(\),(?!\s*\/\/)/;

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

function patchBlock(block) {
	const inputPart = block.split(".handler")[0] ?? block;
	if (!inputPart.includes("tenantProcedure") || !REQUIRED_BRANCH.test(inputPart)) {
		return block;
	}
	if (
		block.includes("guardBranchAccessible(") ||
		block.includes("includes(input.branchId)") ||
		block.includes("includes( input.branchId)")
	) {
		return block;
	}

	const guardLine =
		"\t\tguardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);\n";

	if (block.includes("assertOrgContextMatch(context, input);")) {
		return block.replace(
			/assertOrgContextMatch\(context, input\);\n/,
			`assertOrgContextMatch(context, input);\n${guardLine}`,
		);
	}

	return block.replace(
		/(\.handler\(async \(\{\s*(?:input, context|context, input)\s*\}\) => \{\s*\n)/,
		`$1${guardLine}`,
	);
}

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts") || SKIP.has(file)) continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	if (!content.includes("tenantProcedure") || !content.includes("branchId")) continue;

	const before = content;
	const parts = content.split(PROC_SPLIT);
	const patched = parts.map((part, i) => (i === 0 ? part : patchBlock(part)));
	content = patched.join("");

	if (content !== before) {
		content = ensureImport(content);
		writeFileSync(path, content, "utf-8");
		console.log(`added branch guard in ${file}`);
	}
}
