#!/usr/bin/env node
/**
 * Migrate protectedProcedure → tenantProcedure in routers that use requirePermissionOrpc.
 * Strips redundant tenantDb/member null checks (first block only per handler is manual cleanup).
 * Run: node scripts/codemods/migrate-tenant-procedure.mjs [file...]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const targets = process.argv.slice(2);
const routersDir = join(process.cwd(), "packages/api/src/routers");
const files =
	targets.length > 0
		? targets.map((f) => join(routersDir, f))
		: ["announcements.ts", "audit-logs.ts"].map((f) => join(routersDir, f));

const tenantDbCheck =
	/if \(!context\.tenantDb\) \{\s*throw new ORPCError\("INTERNAL_SERVER_ERROR",[^}]+\}\);\s*\}/gs;

const memberCheck =
	/if \(!context\.member\) \{\s*throw new ORPCError\("(FORBIDDEN|UNAUTHORIZED)",[^}]+\}\);\s*\}/gs;

for (const path of files) {
	let content = readFileSync(path, "utf-8");
	const before = content;

	if (!content.includes("requirePermissionOrpc")) continue;

	content = content.replace(
		/import \{ protectedProcedure \} from "\.\.\/index";/,
		'import { tenantProcedure } from "../index";',
	);
	content = content.replace(/\bprotectedProcedure\b/g, "tenantProcedure");
	content = content.replace(tenantDbCheck, "");
	content = content.replace(memberCheck, "");

	// Drop unused requirePermission import from services
	if (
		!content.includes("requirePermission(") &&
		content.includes("requirePermission,")
	) {
		content = content.replace(/\s*requirePermission,\n?/g, "\n");
		content = content.replace(/,\s*requirePermission/g, "");
	}

	if (content !== before) {
		writeFileSync(path, content, "utf-8");
		console.log(`migrated ${path.split(/[/\\]/).pop()}`);
	}
}
