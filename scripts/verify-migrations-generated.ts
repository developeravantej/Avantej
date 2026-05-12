/**
 * CI guard: ensure `packages/db/src/generated/tenant-migrations.generated.ts`
 * is in sync with the on-disk `.sql` files in `packages/db/src/migrations/tenant/`.
 *
 * Re-runs the same generator logic in-memory and byte-compares against the
 * committed file. Exits 1 with a hint to run `bun gen:migrations` if drift is
 * detected.
 *
 * Run: bun scripts/verify-migrations-generated.ts
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const FILES_DIR = join(ROOT, "packages/db/src/migrations/tenant");
const OUT_PATH = join(
	ROOT,
	"packages/db/src/generated/tenant-migrations.generated.ts",
);

// MUST match scripts/gen-tenant-migrations.ts. Keep in sync.
const HISTORICAL_ORDER: readonly string[] = [
	"0000_noisy_aqueduct",
	"0001_salty_morlocks",
	"0002_calm_martin_li",
	"0003_green_runaways",
	"0004_remove_soft_delete",
	"0005_schema_enhancement",
	"0005_confused_hitman",
	"0006_robust_titania",
	"0007_short_korath",
	"0008_schema_consolidation",
	"0009_bouncy_namorita",
	"0010_broad_ronan",
	"0011_installments",
	"0012_member_category_buffer",
	"0013_google_calendar",
	"0014_service_member_buffer",
	"0015_grace_period",
	"0016_credits_generated",
	"0017_installment_plans",
	"0018_installment_plan_premium",
	"0019_audit_logs",
	"0022_check_ins",
	"0023_refunds",
	"0024_commission_splits_status",
	"0025_member_sessions",
	"0026_pipeline_audit",
	"0027_walkin_commission",
	"0028_checkin_display_name",
	"0029_service_category_commission",
	"0015_abnormal_absorbing_man",
	"0016_worried_wolfpack",
	"0017_jazzy_hercules",
	"0018_famous_ego",
	"0021_add_tenant_migrations_metadata",
];

function escapeForTemplateLiteral(sql: string): string {
	return sql
		.replace(/\\/g, "\\\\")
		.replace(/`/g, "\\`")
		.replace(/\$\{/g, "\\${");
}

function build(): string {
	const allFiles = readdirSync(FILES_DIR)
		.filter((n) => n.endsWith(".sql"))
		.map((n) => n.replace(/\.sql$/, ""));
	const fileSet = new Set(allFiles);
	const missing = HISTORICAL_ORDER.filter((h) => !fileSet.has(h));
	if (missing.length > 0) {
		throw new Error(
			`Missing .sql files for historical migration hashes: ${missing.join(", ")}.`,
		);
	}
	const historicalSet = new Set(HISTORICAL_ORDER);
	const newcomers = allFiles
		.filter((h) => !historicalSet.has(h))
		.sort((a, b) => a.localeCompare(b));
	const ordered = [...HISTORICAL_ORDER, ...newcomers];
	const entries = ordered.map((hash) => {
		const sql = readFileSync(join(FILES_DIR, `${hash}.sql`), "utf-8");
		const escaped = escapeForTemplateLiteral(sql);
		return `\t{ hash: ${JSON.stringify(hash)}, sql: \`${escaped}\` },`;
	});
	const lines: string[] = [
		"// AUTO-GENERATED — do not edit. Run `bun gen:migrations` to regenerate.",
		"// Source: packages/db/src/migrations/tenant/*.sql",
		"// Order: HISTORICAL_ORDER in scripts/gen-tenant-migrations.ts, then newer files lex by filename.",
		"",
		"export const TENANT_MIGRATIONS = [",
		...entries,
		"] as const;",
		"",
		"export const LATEST_MIGRATION_VERSION =",
		"\tTENANT_MIGRATIONS[TENANT_MIGRATIONS.length - 1]!.hash;",
		"",
	];
	return lines.join("\n");
}

const expected = build();
let committed: string;
try {
	committed = readFileSync(OUT_PATH, "utf-8");
} catch {
	console.error(
		`Generated file not found: ${OUT_PATH}\nRun \`bun gen:migrations\` and commit the result.`,
	);
	process.exit(1);
}

if (committed !== expected) {
	console.error(
		"tenant-migrations.generated.ts is out of sync with .sql files.\n" +
			"Run `bun gen:migrations` and commit the result.",
	);
	// Show a small hint about size/length deltas to aid debugging.
	console.error(
		`  committed length: ${committed.length}, expected length: ${expected.length}`,
	);
	process.exit(1);
}

console.log("tenant-migrations.generated.ts is in sync with .sql files.");
