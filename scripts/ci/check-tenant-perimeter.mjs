#!/usr/bin/env node
/**
 * CI gate: tenant perimeter invariants after Plan C.5 migration.
 * Exit 1 on violations.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");
const ALLOW_PROTECTED = new Set(["registration.ts", "index.ts", "base-router.ts"]);
const ALLOW_LEGACY_BRANCH_RESOLVE = new Set([
	"hierarchy.ts",
	"members.ts",
	"invitations.ts",
]);

const errors = [];

for (const file of readdirSync(routersDir)) {
	if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
	const path = join(routersDir, file);
	const content = readFileSync(path, "utf-8");

	if (content.includes("protectedProcedure") && !ALLOW_PROTECTED.has(file)) {
		errors.push(`${file}: unexpected protectedProcedure (use tenantProcedure or allowlist)`);
	}

	if (content.includes("requirePermissionOrpc(")) {
		if (!content.match(/import \{[^}]*requirePermissionOrpc[^}]*\} from "\.\.\/guards"/)) {
			errors.push(`${file}: missing requirePermissionOrpc import from ../guards`);
		}
	}

	if (content.includes("requirePermission(")) {
		errors.push(`${file}: still uses requirePermission() — migrate to requirePermissionOrpc`);
	}

	if (content.includes("guardBranchAccessible(")) {
		if (!content.match(/import \{[^}]*guardBranchAccessible[^}]*\} from "\.\.\/guards"/)) {
			errors.push(`${file}: missing guardBranchAccessible import from ../guards`);
		}
	}

	if (content.includes("guardInputBranchForContext(")) {
		if (!content.match(/import \{[^}]*guardInputBranchForContext[^}]*\} from "\.\.\/guards"/)) {
			errors.push(`${file}: missing guardInputBranchForContext import from ../guards`);
		}
	}

	if (/getDescendantNodeIds\([\s\S]{0,300}includes\(input\.branchId\)/.test(content)) {
		if (!ALLOW_LEGACY_BRANCH_RESOLVE.has(file)) {
			errors.push(`${file}: legacy getDescendantNodeIds branch guard — use guardInputBranchForContext`);
		}
	}
}

if (errors.length > 0) {
	console.error("Tenant perimeter check failed:\n");
	for (const e of errors) console.error(`  - ${e}`);
	process.exit(1);
}

console.log("Tenant perimeter check passed.");
