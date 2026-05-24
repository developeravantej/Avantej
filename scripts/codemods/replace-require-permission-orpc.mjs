#!/usr/bin/env node
/**
 * Replace try/catch requirePermission blocks with requirePermissionOrpc.
 * Run: node scripts/codemods/replace-require-permission-orpc.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");

const FORBIDDEN_CATCH =
	/\}\s*catch\s*\(\s*(?:error|e)?\s*\)\s*\{\s*throw new ORPCError\("FORBIDDEN",\s*\{\s*message:\s*(?:error|e) instanceof Error\s*\?\s*(?:error|e)\.message\s*:\s*"[^"]*",?\s*\}\);\s*\}/;

function permissionTryCatch(tenantDb, member) {
	return new RegExp(
		`try\\s*\\{\\s*await requirePermission\\(\\s*${tenantDb},\\s*${member},\\s*"([^"]+)",\\s*"([^"]+)",?\\s*\\)\\s*;\\s*\\}${FORBIDDEN_CATCH.source}`,
		"g",
	);
}

const REPLACERS = [
	{
		pattern:
			/try\s*\{\s*await requirePermission\(\s*([\w.!?]+),\s*([\w.!?]+)[\s\S]*?"([^"]+)",\s*"([^"]+)"[\s\S]*?\)\s*;\s*\}\s*catch\s*\(\s*(?:error|e)?\s*\)\s*\{\s*throw new ORPCError\("FORBIDDEN"[\s\S]*?\}\);\s*\}/g,
		emit: (_tenantDb, _member, resource, action) => {
			const tenantDb = _tenantDb.replace(/!$/, "");
			const member = _member.replace(/!$/, "");
			return `await requirePermissionOrpc(${tenantDb}, ${member}, "${resource}", "${action}");`;
		},
		arity: 4,
	},
	{
		pattern: permissionTryCatch(String.raw`context\.tenantDb!`, String.raw`context\.member!`),
		emit: (resource, action) =>
			`await requirePermissionOrpc(context.tenantDb, context.member, "${resource}", "${action}");`,
	},
	{
		pattern: permissionTryCatch(String.raw`context\.tenantDb`, String.raw`context\.member!`),
		emit: (resource, action) =>
			`await requirePermissionOrpc(context.tenantDb, context.member, "${resource}", "${action}");`,
	},
	{
		pattern: permissionTryCatch(String.raw`context\.tenantDb!`, String.raw`context\.member`),
		emit: (resource, action) =>
			`await requirePermissionOrpc(context.tenantDb, context.member, "${resource}", "${action}");`,
	},
	{
		pattern: permissionTryCatch(String.raw`tenantDb`, String.raw`member`),
		emit: (resource, action) =>
			`await requirePermissionOrpc(tenantDb, member, "${resource}", "${action}");`,
	},
	{
		pattern:
			/try\s*\{\s*await requirePermission\(\s*context\.tenantDb,\s*context\.member,\s*"([^"]+)",\s*"([^"]+)",?\s*\);\s*\}\s*catch\s*\{\s*throw new ORPCError\("FORBIDDEN",\s*\{[^}]+\}\);\s*\}/g,
		emit: (resource, action) =>
			`await requirePermissionOrpc(context.tenantDb, context.member, "${resource}", "${action}");`,
	},
];

function applyReplacements(content) {
	let replacements = 0;
	for (const { pattern, emit, arity = 2 } of REPLACERS) {
		content = content.replace(pattern, (...args) => {
			replacements++;
			if (arity === 4) {
				return emit(args[1], args[2], args[3], args[4]);
			}
			return emit(args[1], args[2]);
		});
	}

	// Bare await requirePermission(...) without try/catch — single line only (never multiline / for-loops)
	content = content.replace(
		/await requirePermission\(\s*([\w.!?]+),\s*([\w.!?]+),\s*"([^"]+)",\s*"([^"]+)",?\s*\)\s*;/g,
		(_match, _tenantDb, _member, resource, action) => {
			replacements++;
			const tenantDb = _tenantDb.replace(/!$/, "");
			const member = _member.replace(/!$/, "");
			return `await requirePermissionOrpc(${tenantDb}, ${member}, "${resource}", "${action}");`;
		},
	);

	return { content, replacements };
}

function ensureGuardsImport(content) {
	if (
		!content.includes("requirePermissionOrpc") ||
		content.includes('from "../guards"')
	) {
		return content;
	}
	if (content.match(/import \{[^}]*\} from "\.\.\/index";/)) {
		return content.replace(
			/(import \{[^}]+\} from "\.\.\/index";)/,
			'$1\nimport { requirePermissionOrpc } from "../guards";',
		);
	}
	return content.replace(
		/(import \{ ORPCError \} from "@orpc\/server";)/,
		'$1\nimport { requirePermissionOrpc } from "../guards";',
	);
}

function dropUnusedRequirePermissionImport(content) {
	if (content.includes("requirePermission(")) return content;
	return content
		.replace(/\s*requirePermission,\n?/g, "\n")
		.replace(/,\s*requirePermission/g, "")
		.replace(/requirePermission,\s*/g, "");
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
		content = ensureGuardsImport(content);
		content = dropUnusedRequirePermissionImport(content);
		writeFileSync(path, content, "utf-8");
		totalFiles++;
		console.log(`updated ${file}`);
	}
}

console.log(`Done: ${totalReplacements} replacements in ${totalFiles} files`);
