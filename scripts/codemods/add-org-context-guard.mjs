#!/usr/bin/env node
/**
 * Insert assertOrgContextMatch(context, input) at tenantProcedure handler entry
 * when input includes organizationId (Plan C.2 at scale).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");
const SKIP = new Set(["registration.ts", "onboarding.ts", "index.ts"]);

function ensureImport(content) {
	if (!content.includes("assertOrgContextMatch")) {
		if (content.includes('from "../guards"')) {
			return content.replace(
				/import \{([^}]+)\} from "\.\.\/guards";/,
				(_m, imp) =>
					imp.includes("assertOrgContextMatch")
						? _m
						: `import {${imp.trim()}, assertOrgContextMatch } from "../guards";`,
			);
		}
		return content.replace(
			/(import \{ tenantProcedure \} from "\.\.\/index";)/,
			'$1\nimport { assertOrgContextMatch } from "../guards";',
		);
	}
	return content;
}

const HANDLER_PATTERNS = [
	/\.handler\(async \(\{ input, context \}\) => \{\s*\n(?!\s*assertOrgContextMatch)/g,
	/\.handler\(async \(\{ context, input \}\) => \{\s*\n(?!\s*assertOrgContextMatch)/g,
];

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts") || SKIP.has(file)) continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	if (!content.includes("tenantProcedure") || !content.includes("organizationId: z.string().uuid()")) {
		continue;
	}

	const before = content;
	content = ensureImport(content);
	for (const pattern of HANDLER_PATTERNS) {
		content = content.replace(
			pattern,
			(m) => `${m}\t\tassertOrgContextMatch(context, input);\n`,
		);
	}

	if (content !== before) {
		writeFileSync(path, content, "utf-8");
		console.log(`added org guard in ${file}`);
	}
}
