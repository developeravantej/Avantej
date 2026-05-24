#!/usr/bin/env node
/**
 * Migrate protectedProcedure → tenantProcedure and strip redundant context checks.
 *
 * Usage:
 *   node scripts/codemods/migrate-tenant-procedure.mjs              # default batch 2
 *   node scripts/codemods/migrate-tenant-procedure.mjs brands.ts …  # explicit files
 *   node scripts/codemods/migrate-tenant-procedure.mjs --batch=1    # re-run batch 1
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BATCHES = {
	1: ["announcements.ts", "audit-logs.ts", "analytics.ts", "pos.ts"],
	2: [
		"brands.ts",
		"service-categories.ts",
		"product-categories.ts",
		"rooms.ts",
		"trainers.ts",
		"tax-rates.ts",
	],
	3: [
		"sales-orders.ts",
		"cancelled-sales.ts",
		"installments.ts",
		"installment-plans.ts",
		"refunds.ts",
		"payouts.ts",
		"package-instances.ts",
	],
	4: [
		"members.ts",
		"hierarchy.ts",
		"invitations.ts",
		"role-permissions.ts",
		"appointments.ts",
		"scheduled-reports.ts",
		"notifications.ts",
	],
	5: [
		"products.ts",
		"services.ts",
		"commission-splits.ts",
		"goods-receipts.ts",
		"purchase-orders.ts",
		"stock-requests.ts",
		"transfer-orders.ts",
		"branch-invites.ts",
		"check-ins.ts",
		"service-members.ts",
		"households.ts",
		"memberships.ts",
		"customer-directory.ts",
		"customer-profiles.ts",
		"walk-in-customers.ts",
	],
	6: [
		"class-slots.ts",
		"waitlist.ts",
		"trainer-availability.ts",
		"trainer-tiers.ts",
		"expenses.ts",
		"invoices.ts",
		"promotions.ts",
		"roles.ts",
		"category-commission.ts",
		"category-buffer-overrides.ts",
		"coach-intake.ts",
		"preferred-times.ts",
		"suppliers.ts",
		"units-of-measure.ts",
	],
	7: [
		"google-calendar.ts",
		"member-profiles.ts",
		"permissions.ts",
		"user-activity-log.ts",
		"organization-settings.ts",
		"notification-preferences.ts",
	],
};

const routersDir = join(process.cwd(), "packages/api/src/routers");
const args = process.argv.slice(2);

let files;
if (args.length === 0) {
	files = BATCHES[2].map((f) => join(routersDir, f));
} else if (args[0]?.startsWith("--batch=")) {
	const n = args[0].split("=")[1];
	files = (BATCHES[n] ?? []).map((f) => join(routersDir, f));
} else {
	files = args.map((f) =>
		f.includes("/") ? f : join(routersDir, f),
	);
}

const tenantDbCheck =
	/if \(!context\.tenantDb\) \{\s*throw new ORPCError\("INTERNAL_SERVER_ERROR",[\s\S]*?\}\);\s*\}/g;

const memberCheck =
	/if \(!context\.member\) \{\s*throw new ORPCError\("(FORBIDDEN|UNAUTHORIZED)",[\s\S]*?\}\);\s*\}/g;

const importProtected =
	/import \{ protectedProcedure(?:, tenantProcedure)? \} from "\.\.\/index";/;

const importBoth =
	/import \{ protectedProcedure, tenantProcedure \} from "\.\.\/index";/;

for (const path of files) {
	let content = readFileSync(path, "utf-8");
	const before = content;

	if (importBoth.test(content)) {
		content = content.replace(
			importBoth,
			'import { tenantProcedure } from "../index";',
		);
	} else if (importProtected.test(content)) {
		content = content.replace(
			importProtected,
			'import { tenantProcedure } from "../index";',
		);
	}

	content = content.replace(/\bprotectedProcedure\b/g, "tenantProcedure");
	content = content.replace(tenantDbCheck, "");
	content = content.replace(memberCheck, "");
	content = content.replace(/\n{3,}/g, "\n\n");

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
