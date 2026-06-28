import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const E2E = dirname(fileURLToPath(import.meta.url));
const led = JSON.parse(readFileSync(join(E2E, "uat-ledger.json"), "utf8"));

const specs = new Set();
const bySection = {};
for (const s of led.sections) {
	bySection[s.n] = [];
	for (let g of s.specGlobs ?? []) {
		let pat = g;
		if (pat.endsWith("/**")) pat = pat.slice(0, -3) + "/**/*.spec.ts";
		else if (pat.endsWith("**")) pat = pat.slice(0, -2) + "**/*.spec.ts";
		else if (!pat.endsWith(".spec.ts")) pat = pat + "**/*.spec.ts";
		let matches = [];
		try {
			matches = globSync(pat, { cwd: E2E });
		} catch (e) {
			matches = [];
		}
		for (const m of matches) {
			const rel = "_e2e/" + m.replace(/\\/g, "/");
			specs.add(rel);
			bySection[s.n].push(rel);
		}
	}
}
const sorted = [...specs].sort();
console.log("UAT-mapped spec files:", sorted.length);
for (const [n, arr] of Object.entries(bySection)) {
	console.log(`§${n}: ${arr.length} specs`);
}
console.log("---LIST---");
for (const s of sorted) console.log(s);
