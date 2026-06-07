#!/usr/bin/env node
// Safe review-page build: refuses to generate review.html from a partial/stale
// report (the trap that drops every other module's cards). Runs the reconcile
// guard first, then gen-review + fix-video-paths.
//
//   node _e2e/build-review.mjs
//
// gen-review-html.mjs lives in the e2e-deep skill; pass its path or set
// E2E_GEN_REVIEW. Falls back to the default skill location.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const HOME = process.env.USERPROFILE || process.env.HOME || "";
const GEN =
	process.env.E2E_GEN_REVIEW ||
	[
		`${HOME}/.claude/skills/e2e-deep/scripts/gen-review-html.mjs`,
		`${HOME}/.claude/skills/e2e/scripts/gen-review-html.mjs`,
	].find(existsSync);

function run(cmd, argv) {
	const r = spawnSync(cmd, argv, { stdio: "inherit", shell: false });
	return r.status ?? 1;
}

// 1) Partial-run guard (report-aware reconcile).
if (run("node", ["_e2e/reconcile.mjs"]) !== 0) {
	console.error(
		"\n✖ Not generating review.html — fix the drift above (likely a partial run; re-run the FULL suite).",
	);
	process.exit(1);
}

// 2) Generate + normalize video paths.
if (!GEN) {
	console.error(
		"Could not find gen-review-html.mjs — set E2E_GEN_REVIEW to its path.",
	);
	process.exit(1);
}
const order =
	"home,access-control,sales,commissions,customers,products,tax-rates,promotions,suppliers,settings,packages";
if (
	run("node", [
		GEN,
		"--source",
		"playwright",
		"--report",
		"_e2e/results/report.json",
		"--out",
		"_e2e/review.html",
		"--order",
		order,
	]) !== 0
)
	process.exit(1);
if (run("node", ["_e2e/fix-video-paths.mjs"]) !== 0) process.exit(1);
console.log("\n✓ review.html built from a complete report.");
