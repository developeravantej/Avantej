#!/usr/bin/env node
/**
 * CI gate: tenant perimeter invariants after Plan C.5 migration.
 * Exit 1 on violations.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const routersDir = join(process.cwd(), "packages/api/src/routers");
const ALLOW_PROTECTED = new Set([
	"registration.ts",
	"index.ts",
	"base-router.ts",
]);
const ALLOW_LEGACY_BRANCH_RESOLVE = new Set([
	"hierarchy.ts",
	"members.ts",
	"invitations.ts",
]);

const errors = [];

/** Recursively collect every non-test .ts file under the routers tree. */
function collectRouterFiles(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			// _types/ holds server-router type stubs, not live procedures.
			if (entry.name === "_types") continue;
			out.push(...collectRouterFiles(full));
		} else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
			out.push(full);
		}
	}
	return out;
}

// Import-presence check is path-agnostic: split-folder routers import from
// "../../guards", top-level routers from "../guards".
function importsFromGuards(content, symbol) {
	return new RegExp(
		`import \\{[^}]*\\b${symbol}\\b[^}]*\\} from "\\.\\.[./]*guards"`,
	).test(content);
}

for (const path of collectRouterFiles(routersDir)) {
	const file = relative(routersDir, path).replaceAll("\\", "/");
	const baseName = file.split("/").pop();
	const content = readFileSync(path, "utf-8");

	if (
		content.includes("protectedProcedure") &&
		!ALLOW_PROTECTED.has(baseName)
	) {
		errors.push(
			`${file}: unexpected protectedProcedure (use tenantProcedure or allowlist)`,
		);
	}

	if (
		content.includes("requirePermissionOrpc(") &&
		!importsFromGuards(content, "requirePermissionOrpc")
	) {
		errors.push(`${file}: missing requirePermissionOrpc import from guards`);
	}

	if (content.includes("requirePermission(")) {
		errors.push(
			`${file}: still uses requirePermission() — migrate to requirePermissionOrpc`,
		);
	}

	if (
		content.includes("guardBranchAccessible(") &&
		!importsFromGuards(content, "guardBranchAccessible")
	) {
		errors.push(`${file}: missing guardBranchAccessible import from guards`);
	}

	if (
		content.includes("guardInputBranchForContext(") &&
		!importsFromGuards(content, "guardInputBranchForContext")
	) {
		errors.push(
			`${file}: missing guardInputBranchForContext import from guards`,
		);
	}

	if (
		content.includes("guardStoredBranchForContext(") &&
		!importsFromGuards(content, "guardStoredBranchForContext")
	) {
		errors.push(
			`${file}: missing guardStoredBranchForContext import from guards`,
		);
	}

	// Branch-guard intent split (see guards.ts):
	//   - input.branchId        → guardInputBranchForContext (null = bypass → FORBIDDEN)
	//   - <record>.branchId     → guardStoredBranchForContext (null = org-wide → allowed)
	// Feeding a STORED value to the INPUT guard silently 403s every org-wide row
	// (the Service Catalog bug). Flag any guardInputBranchForContext call whose
	// second argument is a `.branchId` property access on something other than `input`.
	const inputGuardCalls = content.matchAll(
		/guardInputBranchForContext\(\s*context\s*,\s*([\w.]+)\s*\)/g,
	);
	for (const match of inputGuardCalls) {
		const arg = match[1];
		if (arg.endsWith(".branchId") && !arg.startsWith("input.")) {
			errors.push(
				`${file}: guardInputBranchForContext(context, ${arg}) passes a stored value — use guardStoredBranchForContext for record.branchId (null = org-wide, not a bypass)`,
			);
		}
	}

	if (
		/getDescendantNodeIds\([\s\S]{0,300}includes\(input\.branchId\)/.test(
			content,
		)
	) {
		if (!ALLOW_LEGACY_BRANCH_RESOLVE.has(baseName)) {
			errors.push(
				`${file}: legacy getDescendantNodeIds branch guard — use guardInputBranchForContext`,
			);
		}
	}
}

if (errors.length > 0) {
	console.error("Tenant perimeter check failed:\n");
	for (const e of errors) console.error(`  - ${e}`);
	process.exit(1);
}

console.log("Tenant perimeter check passed.");
