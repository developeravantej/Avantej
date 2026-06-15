/**
 * Build-time codegen: emit
 * `packages/db/src/generated/control-panel-migrations.generated.ts` from the
 * `.sql` files in `packages/db/src/migrations/control-panel/`.
 *
 * Used by the read-only Plan F.4 `/dashboard/platform-admin/migrations` viewer
 * (Agent Mi) so the Workers runtime can surface migration SQL without filesystem
 * access. Pure embed — never executed at runtime.
 *
 * Run: bun scripts/gen-control-panel-migrations.ts
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ROOT = resolve(__dirname, "..");
const FILES_DIR = join(ROOT, "packages/db/src/migrations/control-panel");
const OUT_PATH = join(
	ROOT,
	"packages/db/src/generated/control-panel-migrations.generated.ts",
);

function escapeForTemplateLiteral(sql: string): string {
	return sql
		.replace(/\\/g, "\\\\")
		.replace(/`/g, "\\`")
		.replace(/\$\{/g, "\\${");
}

function build(): string {
	const tags = readdirSync(FILES_DIR)
		.filter((n) => n.endsWith(".sql"))
		.map((n) => n.replace(/\.sql$/, ""))
		.sort((a, b) => a.localeCompare(b));

	const entries = tags.map((tag) => {
		const sql = readFileSync(join(FILES_DIR, `${tag}.sql`), "utf-8");
		const escaped = escapeForTemplateLiteral(sql);
		return `\t{ tag: ${JSON.stringify(tag)}, sql: \`${escaped}\` },`;
	});

	const lines: string[] = [
		"// AUTO-GENERATED — do not edit. Run `bun scripts/gen-control-panel-migrations.ts` to regenerate.",
		"// Source: packages/db/src/migrations/control-panel/*.sql",
		"// Order: lex by filename (matches drizzle-kit ordering).",
		"",
		"export const CONTROL_PANEL_MIGRATIONS = [",
		...entries,
		"] as const;",
		"",
		"export const CONTROL_PANEL_LATEST_MIGRATION_TAG =",
		"\tCONTROL_PANEL_MIGRATIONS[CONTROL_PANEL_MIGRATIONS.length - 1]!.tag;",
		"",
	];

	return lines.join("\n");
}

function main(): void {
	const output = build();
	mkdirSync(dirname(OUT_PATH), { recursive: true });
	writeFileSync(OUT_PATH, output);
	console.log(`Wrote ${OUT_PATH}`);
}

main();
