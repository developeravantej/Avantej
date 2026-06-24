/**
 * Schema drift gate.
 *
 * Reads the JSON sidecar emitted by `scripts/gen-erd.ts` at
 * `zhub/shared/schema-drift.json` and exits non-zero if any drift section
 * (missing FKs, extra FKs, action mismatches, orphan tables, missing tables)
 * is non-empty for either the tenant or the control-panel database — EXCEPT
 * for the documented, pre-existing divergence in `EXPECTED_DRIFT` below.
 *
 * The full, unfiltered drift always lands in the ERD doc + schema-drift.json
 * (so it stays visible); this gate only tolerates the known baseline so that
 * NEW drift introduced by a PR still fails CI. Keep `EXPECTED_DRIFT` SHRINKING.
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

type ActionMismatch = { key: string; schema: string; live: string };

type DriftSection = {
	missing_in_live: FkDescriptor[];
	extra_in_live: FkDescriptor[];
	action_mismatches: ActionMismatch[];
	orphan_tables: string[];
	missing_tables: string[];
};

type DriftReport = {
	generated_at: string;
	tenant: DriftSection;
	controlPanel: DriftSection;
};

/**
 * Known, pre-existing drift accepted by the gate. Everything here is divergence
 * that exists today on `main` (see docs handoff session-2026-06-02) and is NOT a
 * regression. ALL OTHER drift fails the gate. Each bucket keys FKs / mismatches
 * by "child_table.child_col"; tables by name.
 *
 * Remediation (tracked, not blocking): the tenant orphans are legacy tables with
 * no Drizzle schema, no migration, and no code references — they should be
 * DROPped from existing tenant DBs. The control-panel orphans are Better-Auth
 * managed tables (only `user` is a Drizzle pgTable). The action mismatches need a
 * one-off FK-realign migration. `partner_stripe_accounts` exists in schema +
 * tenant migration 0009 but the reference tenant is behind on migrations.
 */
type Baseline = {
	missing_in_live: string[];
	extra_in_live: string[];
	action_mismatches: string[];
	orphan_tables: string[];
	missing_tables: string[];
};

const EXPECTED_DRIFT: { tenant: Baseline; controlPanel: Baseline } = {
	tenant: {
		missing_in_live: [],
		// FKs that live in the tenant DB but aren't declared in Drizzle schema —
		// mostly on the dead `commission_*` / `stock_movements` legacy tables, plus
		// a few real-but-unmodeled FKs on schema'd tables (households, etc.).
		extra_in_live: [
			"commission_coach_slots.track_id",
			"commission_cycle_configs.branch_id",
			"commission_split_reversals.reversed_by_reversal_id",
			"commission_splits.track_id",
			"commission_splits.track_version_id",
			"commission_track_rates.tier_id",
			"commission_track_rates.track_id",
			"commission_track_versions.track_id",
			"commission_tracks.category_id",
			"households.primary_contact_profile_id",
			"stock_movements.branch_id",
			"stock_movements.product_id",
			"trainer_availability_exceptions.trainer_id",
		],
		// Schema declares onDelete:"restrict"; the live FK was created NO ACTION.
		action_mismatches: ["appointment_clients.walk_in_customer_id"],
		// Legacy tables in live tenant DBs with no schema / migration / code refs.
		orphan_tables: [
			"commission_cycle_configs",
			"commission_track_rates",
			"commission_track_versions",
			"commission_tracks",
			"credit_point_ledger",
			// ID-crosswalk table the legacy-onboarding ETL creates at runtime
			// (apps/server/scripts/migration/core/crosswalk.ts, CREATE TABLE IF
			// NOT EXISTS mig_xwalk). Intentionally not modeled in Drizzle; left
			// behind in tenants the migration pipeline has been run against.
			"mig_xwalk",
			"push_tokens",
			"scheduled_reports",
			"stock_movements",
			"trainer_availability_exceptions",
		],
		// Schema + tenant migration 0009 define it; the reference tenant is behind.
		missing_tables: ["partner_stripe_accounts"],
	},
	controlPanel: {
		missing_in_live: [],
		// Better-Auth organization-plugin FKs (tables managed by Better-Auth).
		extra_in_live: [
			"invitation.inviter_id",
			"invitation.organization_id",
			"member.organization_id",
			"member.user_id",
		],
		// Schema declares onDelete:"restrict"; the live FK was created NO ACTION.
		action_mismatches: ["organizations.owner_user_id"],
		// Better-Auth managed tables (not modeled as Drizzle pgTables).
		orphan_tables: ["invitation", "member", "organization"],
		missing_tables: [],
	},
};

const DRIFT_JSON = resolve(__dirname, "../zhub/shared/schema-drift.json");

function fkKey(f: FkDescriptor): string {
	const child = f.child ?? f.child_table ?? "?";
	const col = f.col ?? f.child_col ?? "?";
	return `${child}.${col}`;
}

function summarizeFk(f: FkDescriptor): string {
	const parent = f.parent ?? f.parent_table ?? "?";
	return `${fkKey(f)} → ${parent}`;
}

/** Section with the EXPECTED_DRIFT baseline removed — only genuinely new drift. */
function unexpectedOnly(s: DriftSection, base: Baseline): DriftSection {
	return {
		missing_in_live: s.missing_in_live.filter(
			(f) => !base.missing_in_live.includes(fkKey(f)),
		),
		extra_in_live: s.extra_in_live.filter(
			(f) => !base.extra_in_live.includes(fkKey(f)),
		),
		action_mismatches: s.action_mismatches.filter(
			(m) => !base.action_mismatches.includes(m.key),
		),
		orphan_tables: s.orphan_tables.filter(
			(t) => !base.orphan_tables.includes(t),
		),
		missing_tables: s.missing_tables.filter(
			(t) => !base.missing_tables.includes(t),
		),
	};
}

function countBaselined(s: DriftSection, u: DriftSection): number {
	return (
		s.missing_in_live.length -
		u.missing_in_live.length +
		(s.extra_in_live.length - u.extra_in_live.length) +
		(s.action_mismatches.length - u.action_mismatches.length) +
		(s.orphan_tables.length - u.orphan_tables.length) +
		(s.missing_tables.length - u.missing_tables.length)
	);
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

function printSection(label: string, raw: DriftSection, u: DriftSection): void {
	const baselined = countBaselined(raw, u);
	if (!isSectionDirty(u)) {
		console.log(`  ${label}: clean (${baselined} baselined)`);
		return;
	}
	console.log(`  ${label}: NEW drift (${baselined} baselined, not shown):`);
	if (u.missing_in_live.length)
		console.log(
			`    missing_in_live (${u.missing_in_live.length}):`,
			u.missing_in_live.map(summarizeFk).join(", "),
		);
	if (u.extra_in_live.length)
		console.log(
			`    extra_in_live (${u.extra_in_live.length}):`,
			u.extra_in_live.map(summarizeFk).join(", "),
		);
	if (u.action_mismatches.length)
		console.log(
			`    action_mismatches (${u.action_mismatches.length}):`,
			u.action_mismatches
				.map((m) => `${m.key} schema=${m.schema} live=${m.live}`)
				.join(", "),
		);
	if (u.orphan_tables.length)
		console.log(
			`    orphan_tables (${u.orphan_tables.length}):`,
			u.orphan_tables.join(", "),
		);
	if (u.missing_tables.length)
		console.log(
			`    missing_tables (${u.missing_tables.length}):`,
			u.missing_tables.join(", "),
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

	const tenantNew = unexpectedOnly(report.tenant, EXPECTED_DRIFT.tenant);
	const cpNew = unexpectedOnly(
		report.controlPanel,
		EXPECTED_DRIFT.controlPanel,
	);

	printSection("tenant", report.tenant, tenantNew);
	printSection("controlPanel", report.controlPanel, cpNew);

	const dirty = isSectionDirty(tenantNew) || isSectionDirty(cpNew);
	if (dirty) {
		console.error(
			"\nNEW schema drift detected (beyond the documented EXPECTED_DRIFT baseline). Fix schema or run a migration.",
		);
		process.exit(1);
	}
	console.log(
		"\nNo new drift (only the documented EXPECTED_DRIFT baseline remains).",
	);
}

main();
