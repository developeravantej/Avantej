// Merge all *.journey.json sidecars under _e2e/web/** into _e2e/journey-steps.json,
// preserving existing entries (smoke + core journeys). Sidecars are
// { "<relpath>::<title>": string[] } where relpath is "<module>/<file>.spec.ts".
import {
	readFileSync,
	writeFileSync,
	existsSync,
	readdirSync,
	statSync,
} from "node:fs";
import { join } from "node:path";

const WEB = "_e2e/web";
const OUT = "_e2e/journey-steps.json";

let journeys = {};
if (existsSync(OUT)) {
	try {
		journeys = JSON.parse(readFileSync(OUT, "utf8"));
	} catch {}
}

let merged = 0;
const walk = (dir) => {
	for (const e of readdirSync(dir)) {
		const p = join(dir, e);
		const st = statSync(p);
		if (st.isDirectory()) walk(p);
		else if (e.endsWith(".journey.json")) {
			try {
				const obj = JSON.parse(readFileSync(p, "utf8"));
				for (const [k, v] of Object.entries(obj)) {
					if (Array.isArray(v)) {
						journeys[k] = v;
						merged++;
					}
				}
			} catch (err) {
				console.warn(`[merge] bad sidecar ${p}:`, err.message);
			}
		}
	}
};
walk(WEB);

writeFileSync(OUT, JSON.stringify(journeys, null, 2) + "\n");
console.log(
	`merged ${merged} journey entries; ${Object.keys(journeys).length} total in ${OUT}`,
);
