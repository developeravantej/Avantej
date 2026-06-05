// Merge shard JSON reports (_e2e/results/report-*.json) into one report.json
// for gen-review-html. Concatenates the per-shard `suites` arrays.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const dir = "_e2e/results";
const parts = readdirSync(dir)
	.filter((f) => /^report-\d+\.json$/.test(f))
	.sort();

const suites = [];
let total = 0;
for (const f of parts) {
	try {
		const r = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
		for (const s of r.suites ?? []) suites.push(s);
		const count = (function walk(ss) {
			let n = 0;
			for (const x of ss) {
				n += (x.specs ?? []).length;
				n += walk(x.suites ?? []);
			}
			return n;
		})(r.suites ?? []);
		total += count;
		console.log(`  ${f}: ${count} specs`);
	} catch (e) {
		console.warn(`  skip ${f}: ${e.message}`);
	}
}

writeFileSync(`${dir}/report.json`, JSON.stringify({ suites }, null, 2));
console.log(
	`merged ${parts.length} shard reports -> ${dir}/report.json (${total} specs)`,
);
