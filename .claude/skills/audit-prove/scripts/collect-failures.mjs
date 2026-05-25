#!/usr/bin/env node
/**
 * Parse a Playwright JSON report and extract every FAILED test.step (including
 * failed expect.soft assertions, which keep the run going to the end). The
 * audit-prove remediation loop reads this to learn exactly which journeys/cases
 * are red and map them back to finding IDs — step titles are authored to start
 * with the target id (e.g. "GP-01 …", "F-stock-decrement …", "C-02 …").
 *
 * Usage:
 *   node scripts/collect-failures.mjs --results <results.json> [--out <file>]
 *
 * Prints a JSON array of { id, title, spec, message, location } to stdout (and
 * --out). Exit 0 with [] when everything passed; exit 3 when there are failures;
 * exit 1 on a usage/parse error.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (n, d = null) => {
	const i = args.indexOf(`--${n}`);
	return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const results = arg("results", null);
const out = arg("out", null);
if (!results || !existsSync(results)) {
	console.error(`ERROR: --results <file> is required and must exist (got: ${results})`);
	process.exit(1);
}

let report;
try {
	report = JSON.parse(readFileSync(results, "utf8"));
} catch (e) {
	console.error(`ERROR: could not parse ${results}: ${e.message}`);
	process.exit(1);
}

const failures = [];
const firstLine = (s) => (s || "").split("\n")[0].trim().slice(0, 300);
const loc = (l) => (l ? `${l.file}:${l.line}` : null);
// leading token of a step title is the target id (GP-01 / F-foo / C-02)
const idOf = (title) => {
	const m = (title || "").match(/^([A-Za-z]+-[A-Za-z0-9_-]+)/);
	return m ? m[1] : null;
};

function walkSteps(steps, specTitle) {
	for (const st of steps || []) {
		if (st.error) {
			failures.push({
				id: idOf(st.title),
				title: st.title,
				spec: specTitle,
				message: firstLine(st.error.message),
				location: loc(st.location),
			});
		}
		if (st.steps) walkSteps(st.steps, specTitle);
	}
}

function walkSuite(suite) {
	for (const spec of suite.specs || []) {
		for (const test of spec.tests || []) {
			for (const res of test.results || []) {
				walkSteps(res.steps, spec.title);
				// errors not attached to a step (soft asserts outside test.step)
				for (const err of res.errors || []) {
					const message = firstLine(err.message);
					if (!failures.some((f) => f.message === message)) {
						failures.push({
							id: idOf(spec.title),
							title: spec.title,
							spec: spec.title,
							message,
							location: loc(err.location),
						});
					}
				}
			}
		}
	}
	for (const child of suite.suites || []) walkSuite(child);
}
for (const s of report.suites || []) walkSuite(s);

const json = JSON.stringify(failures, null, 2);
if (out) writeFileSync(out, json);
process.stdout.write(`${json}\n`);
console.error(`[failures] ${failures.length} failing step(s)/assertion(s)`);
process.exit(failures.length ? 3 : 0);
