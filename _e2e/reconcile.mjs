#!/usr/bin/env node
// Drift guard for the _e2e suite. Specs on disk are the source of truth; this
// asserts the report, journeys, and ledger stay in sync with them so a re-run or
// a renamed/deleted spec can never SILENTLY lose tests, journeys, or coverage.
//
//   node _e2e/reconcile.mjs            # full check (report-aware) — local, pre-review
//   node _e2e/reconcile.mjs --static   # CI: skip report-based checks (report.json is gitignored)
//   node _e2e/reconcile.mjs --prune    # auto-remove orphaned journey entries, then re-check
//
// Exit code 0 = in sync, 1 = drift (fail hard). Designed for a small internal
// suite: plain JSON in git + this one script is the whole integrity system.
import {
	readFileSync,
	writeFileSync,
	existsSync,
	readdirSync,
	statSync,
} from "node:fs";
import { join } from "node:path";

const WEB = "_e2e/web";
const REPORT = "_e2e/results/report.json";
const JOURNEYS = "_e2e/journey-steps.json";
const LEDGER = "_e2e/coverage-ledger.json";

const args = process.argv.slice(2);
const STATIC = args.includes("--static");
const PRUNE = args.includes("--prune");

// ---- 1. tests on disk (the source of truth) ----
function diskTests() {
	const ids = new Set();
	const files = new Set();
	const walk = (d) => {
		for (const e of readdirSync(d)) {
			const p = join(d, e);
			if (statSync(p).isDirectory()) walk(p);
			else if (/\.spec\.ts$/.test(e)) {
				const rel = p.replace(/\\/g, "/").replace(/^_e2e\/web\//, "");
				files.add(rel);
				const src = readFileSync(p, "utf8");
				const re = /test(?:\.skip|\.only)?\(\s*([`"'])([^`"']+)\1/g;
				let m;
				while ((m = re.exec(src))) ids.add(`${rel}::${m[2]}`);
			}
		}
	};
	walk(WEB);
	return { ids, files };
}

// ---- 2. tests in the last report ----
function reportTests() {
	if (!existsSync(REPORT)) return null;
	const ids = new Set();
	const r = JSON.parse(readFileSync(REPORT, "utf8"));
	const w = (s) => {
		for (const sp of s.specs ?? []) {
			const f = (sp.file ?? s.file ?? "")
				.replace(/^.*?_e2e\/web\//, "")
				.replace(/\\/g, "/");
			ids.add(`${f}::${sp.title}`);
		}
		for (const c of s.suites ?? []) w(c);
	};
	(r.suites ?? []).forEach(w);
	return ids;
}

const esc = (s) => s; // ids are already plain
const minus = (a, b) => [...a].filter((x) => !b.has(x));

const disk = diskTests();
let journeys = existsSync(JOURNEYS)
	? JSON.parse(readFileSync(JOURNEYS, "utf8"))
	: {};
const journeyKeys = new Set(Object.keys(journeys));
const ledger = existsSync(LEDGER)
	? JSON.parse(readFileSync(LEDGER, "utf8"))
	: [];

const problems = [];
const warnings = [];

// CHECK A — orphaned journeys (a journey for a test that no longer exists → rename/delete drift)
const orphanJourneys = minus(journeyKeys, disk.ids);
if (orphanJourneys.length) {
	if (PRUNE) {
		for (const k of orphanJourneys) delete journeys[k];
		writeFileSync(JOURNEYS, JSON.stringify(journeys, null, 2) + "\n");
		console.log(
			`[prune] removed ${orphanJourneys.length} orphaned journey entries`,
		);
	} else {
		problems.push(
			`${orphanJourneys.length} ORPHANED journey(s) (test renamed/deleted, journey left behind). Run with --prune to remove, or restore the test:\n` +
				orphanJourneys
					.slice(0, 15)
					.map((x) => `      - ${x}`)
					.join("\n"),
		);
	}
}

// CHECK B — ledger rows marked covered/failing whose specFile is gone (coverage silently lost)
const staleLedger = ledger.filter(
	(r) =>
		(r.status === "covered" || r.status === "failing") &&
		r.specFile &&
		!disk.files.has(r.specFile),
);
if (staleLedger.length) {
	problems.push(
		`${staleLedger.length} ledger row(s) point at a spec file that no longer exists (coverage claimed but spec deleted):\n` +
			[...new Set(staleLedger.map((r) => r.specFile))]
				.slice(0, 15)
				.map((x) => `      - ${x}`)
				.join("\n"),
	);
}

// CHECK C — disk tests with no journey (card would show "journey unavailable") — warn, not loss
const noJourney = minus(disk.ids, journeyKeys);
if (noJourney.length) {
	warnings.push(
		`${noJourney.length} test(s) on disk have NO journey entry (card shows "journey unavailable"):\n` +
			noJourney
				.slice(0, 15)
				.map((x) => `      - ${x}`)
				.join("\n"),
	);
}

// CHECK D — PARTIAL-RUN GUARD (report-aware only): a test exists on disk but is missing
// from the last report → the report is stale/partial; regenerating the review page now
// would DROP that test's card. This is the failure that bit us.
if (!STATIC) {
	const report = reportTests();
	if (report === null) {
		warnings.push(
			`no ${REPORT} yet — run the suite before generating the review page.`,
		);
	} else {
		const missing = minus(disk.ids, report);
		if (missing.length) {
			problems.push(
				`PARTIAL/STALE REPORT: ${missing.length} test(s) exist on disk but are missing from ${REPORT}.\n` +
					`      The review page would DROP these. Re-run the FULL suite before regenerating:\n` +
					`        bunx playwright test --config _e2e/playwright.config.ts\n` +
					missing
						.slice(0, 15)
						.map((x) => `      - ${x}`)
						.join("\n"),
			);
		}
		const extra = minus(report, disk.ids);
		if (extra.length) {
			warnings.push(
				`${extra.length} test(s) in the report no longer exist on disk (stale report rows): ` +
					extra.slice(0, 5).join(", "),
			);
		}
	}
}

// ---- report ----
console.log(
	`reconcile: ${disk.ids.size} tests on disk across ${disk.files.size} spec files`,
);
for (const w of warnings) console.log(`\n  ⚠️  WARN: ${w}`);
for (const p of problems) console.log(`\n  ❌ DRIFT: ${p}`);

if (problems.length) {
	console.log(`\n✖ reconcile FAILED — ${problems.length} drift problem(s).`);
	process.exit(1);
}
console.log(
	`\n✓ reconcile OK${warnings.length ? ` (${warnings.length} warning(s))` : ""} — specs, journeys${STATIC ? "" : ", report"}, and ledger are in sync.`,
);
