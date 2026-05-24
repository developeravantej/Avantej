#!/usr/bin/env node
/**
 * Replace try/catch requirePermission blocks with requirePermissionOrpc.
 * Run: node scripts/codemods/replace-require-permission-orpc.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");

const singleLinePattern =
	/try\s*\{\s*await requirePermission\(\s*context\.tenantDb,\s*context\.member,\s*"([^"]+)",\s*"([^"]+)"\s*\);\s*\}\s*catch\s*\(\s*(?:error|e)\s*\)\s*\{\s*throw new ORPCError\("FORBIDDEN",\s*\{\s*message:\s*(?:error|e) instanceof Error\s*\?\s*(?:error|e)\.message\s*:\s*"[^"]*",?\s*\}\);\s*\}/gs;

const multilinePattern =
	/try\s*\{\s*await requirePermission\(\s*context\.tenantDb,\s*context\.member,\s*"([^"]+)",\s*"([^"]+)",?\s*\);\s*\}\s*catch\s*\(\s*(?:error|e)?\s*\)\s*\{\s*throw new ORPCError\("FORBIDDEN",\s*\{\s*message:\s*(?:error|e) instanceof Error\s*\?\s*(?:error|e)\.message\s*:\s*"[^"]*",?\s*\}\);\s*\}/gs;

const bareCatchPattern =
	/try\s*\{\s*await requirePermission\(\s*context\.tenantDb,\s*context\.member,\s*"([^"]+)",\s*"([^"]+)",?\s*\);\s*\}\s*catch\s*\{\s*throw new ORPCError\("FORBIDDEN",\s*\{[^}]+\}\);\s*\}/gs;

function applyReplacements(content) {
	let replacements = 0;
	const replace = (pattern) => {
		content = content.replace(pattern, (_match, resource, action) => {
			replacements++;
			return `await requirePermissionOrpc(context.tenantDb, context.member, "${resource}", "${action}");`;
		});
	};
	replace(singleLinePattern);
	replace(multilinePattern);
	replace(bareCatchPattern);
	return { content, replacements };
}

let totalFiles = 0;
let totalReplacements = 0;

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
	const path = join(routersDir, file);
	let content = readFileSync(path, "utf-8");
	const before = content;

	const result = applyReplacements(content);
	content = result.content;
	totalReplacements += result.replacements;

	if (content !== before) {
		if (!content.includes("requirePermissionOrpc")) {
			// noop - always includes after replace
		}
		if (
			content.includes("requirePermissionOrpc") &&
			!content.includes('from "../guards"')
		) {
			content = content.replace(
				/(import \{ protectedProcedure(?:, tenantProcedure)? \} from "\.\.\/index";)/,
				'$1\nimport { requirePermissionOrpc } from "../guards";',
			);
			if (!content.includes('from "../guards"')) {
				content = content.replace(
					/(import \{ ORPCError \} from "@orpc\/server";)/,
					'$1\nimport { requirePermissionOrpc } from "../guards";',
				);
			}
		}

		// Drop requirePermission from @avantej-core/services import when unused
		if (
			!content.includes("requirePermission(") &&
			content.includes("requirePermission,")
		) {
			content = content.replace(/\s*requirePermission,\n?/g, "\n");
			content = content.replace(/,\s*requirePermission/g, "");
			content = content.replace(/requirePermission,\s*/g, "");
		}

		writeFileSync(path, content, "utf-8");
		totalFiles++;
		console.log(`updated ${file}`);
	}
}

console.log(`Done: ${totalReplacements} replacements in ${totalFiles} files`);
