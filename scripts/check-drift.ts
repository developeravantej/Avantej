/**
 * Schema drift gate.
 *
 * Reads the JSON sidecar emitted by `scripts/gen-erd.ts` at
 * `zhub/shared/schema-drift.json` and exits non-zero if any drift section
 * (missing FKs, extra FKs, action mismatches, orphan tables, missing tables)
 * is non-empty for either the tenant or the control-panel database.
 *
 * Run:
 *   bun scripts/gen-erd.ts && bun scripts/check-drift.ts
 *
 * Use as a CI gate before merging schema-touching PRs.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type FkDescriptor = {
	child?: string;
	child_table?: string;
	col?: string;
	child_col?: string;
	parent?: string;
	parent_table?: string;
};

type DriftSection = {
	missing_in_live: FkDescriptor[];
	extra_in_live: FkDescriptor[];
	action_mismatches: Array<{ key: string; schema: string; live: string }>;
	orphan_tables: string[];
	missing_tables: string[];
};

type DriftReport = {
	generated_at: string;
	tenant: DriftSection;
	controlPanel: DriftSection;
};

const DRIFT_JSON = resolve(__dirname, "../zhub/shared/schema-drift.json");

function summarizeFk(f: FkDescriptor): string {
	const child = f.child ?? f.child_table ?? "?";
	const col = f.col ?? f.child_col ?? "?";
	const parent = f.parent ?? f.parent_table ?? "?";
	return `${child}.${col} → ${parent}`;
}

function isSectionDirty(s: DriftSection): boolean {
	return (
		s.missing_in_live.length > 0 ||
		s.extra_in_live.length > 0 ||
		s.action_mismatches.length > 0 ||
		s.orphan_tables.length > 0 ||
		s.missing_tables.length > 0
	);
}

function printSection(label: string, s: DriftSection): void {
	if (!isSectionDirty(s)) {
		console.log(`  ${label}: clean`);
		return;
	}
	console.log(`  ${label}:`);
	if (s.missing_in_live.length)
		console.log(
			`    missing_in_live (${s.missing_in_live.length}):`,
			s.missing_in_live.map(summarizeFk).join(", "),
		);
	if (s.extra_in_live.length)
		console.log(
			`    extra_in_live (${s.extra_in_live.length}):`,
			s.extra_in_live.map(summarizeFk).join(", "),
		);
	if (s.action_mismatches.length)
		console.log(
			`    action_mismatches (${s.action_mismatches.length}):`,
			s.action_mismatches.map((m) => `${m.key} schema=${m.schema} live=${m.live}`).join(", "),
		);
	if (s.orphan_tables.length)
		console.log(
			`    orphan_tables (${s.orphan_tables.length}):`,
			s.orphan_tables.join(", "),
		);
	if (s.missing_tables.length)
		console.log(
			`    missing_tables (${s.missing_tables.length}):`,
			s.missing_tables.join(", "),
		);
}

function main(): void {
	if (!existsSync(DRIFT_JSON)) {
		console.error(
			`Drift report not found at ${DRIFT_JSON}. Run \`bun scripts/gen-erd.ts\` first.`,
		);
		process.exit(2);
	}

	const report = JSON.parse(readFileSync(DRIFT_JSON, "utf-8")) as DriftReport;
	console.log(`Drift check (generated_at: ${report.generated_at})`);
	printSection("tenant", report.tenant);
	printSection("controlPanel", report.controlPanel);

	const dirty =
		isSectionDirty(report.tenant) || isSectionDirty(report.controlPanel);
	if (dirty) {
		console.error("\nDrift detected. Fix schema or run a migration.");
		process.exit(1);
	}
	console.log("\nNo drift detected.");
}

main();
