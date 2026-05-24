#!/usr/bin/env node
/**
 * Add missing requirePermissionOrpc import from ../guards when the symbol is used.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	if (!content.includes("requirePermissionOrpc(")) continue;
	if (content.includes("requirePermissionOrpc") && content.includes('from "../guards"')) {
		continue;
	}

	if (content.includes('from "../guards"')) {
		content = content.replace(
			/import \{([^}]+)\} from "\.\.\/guards";/,
			(_match, imports) => {
				if (imports.includes("requirePermissionOrpc")) return _match;
				return `import {${imports.trim()}, requirePermissionOrpc } from "../guards";`;
			},
		);
	} else if (content.match(/import \{ tenantProcedure \} from "\.\.\/index";/)) {
		content = content.replace(
			/(import \{ tenantProcedure \} from "\.\.\/index";)/,
			'$1\nimport { requirePermissionOrpc } from "../guards";',
		);
	} else if (content.match(/import \{ ORPCError \} from "@orpc\/server";/)) {
		content = content.replace(
			/(import \{ ORPCError \} from "@orpc\/server";)/,
			'$1\nimport { requirePermissionOrpc } from "../guards";',
		);
	}

	writeFileSync(path, content, "utf-8");
	console.log(`fixed import in ${file}`);
}
