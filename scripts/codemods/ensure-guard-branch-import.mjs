#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	if (!content.includes("guardBranchAccessible(")) continue;
	if (/import \{[^}]*guardBranchAccessible[^}]*\} from "\.\.\/guards"/.test(content)) {
		continue;
	}
	if (content.includes('from "../guards"')) {
		content = content.replace(
			/import \{([^}]+)\} from "\.\.\/guards";/,
			(_m, imp) =>
				imp.includes("guardBranchAccessible")
					? _m
					: `import {${imp.trim()}, guardBranchAccessible } from "../guards";`,
		);
	} else {
		content = content.replace(
			/(import \{ tenantProcedure \} from "\.\.\/index";)/,
			'$1\nimport { guardBranchAccessible } from "../guards";',
		);
	}
	writeFileSync(path, content, "utf-8");
	console.log(`fixed guard import in ${file}`);
}
