// Build _e2e/coverage-ledger.json by extracting the JSON ledger arrays from the
// 5 Phase-2 mapping agents' output transcripts (without loading them into the
// orchestrator's context). Each agent wrapped its answer in a ```json fenced
// block; we take the longest valid array per file, merge, unescape HTML
// entities, dedupe, and write the ledger + print per-module counts.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

// Ledger source = the per-cluster part files persisted from the Phase-2 agents.
const PARTS_DIR = "_e2e/ledger-parts";

const unescapeHtml = (s) =>
	typeof s === "string"
		? s
				.replace(/&gt;/g, ">")
				.replace(/&lt;/g, "<")
				.replace(/&#39;/g, "'")
				.replace(/&quot;/g, '"')
				.replace(/&amp;/g, "&")
		: s;

function collectStrings(node, out) {
	if (typeof node === "string") out.push(node);
	else if (Array.isArray(node)) for (const x of node) collectStrings(x, out);
	else if (node && typeof node === "object")
		for (const v of Object.values(node)) collectStrings(v, out);
}

function extractLedger(file) {
	if (!existsSync(file)) return [];
	const raw = readFileSync(file, "utf8");
	// Concatenate all decoded text content from the JSONL transcript.
	const texts = [];
	for (const line of raw.split("\n")) {
		const t = line.trim();
		if (!t) continue;
		try {
			collectStrings(JSON.parse(t), texts);
		} catch {
			texts.push(t);
		}
	}
	const blob = texts.join("\n");
	// Balanced-bracket scan for the largest top-level JSON array whose elements
	// are ledger rows (have a `kind`). Handles both ```json-fenced answers and
	// bare `[ ... ]` arrays (one agent printed without fences). String/brace aware.
	let best = [];
	for (let i = 0; i < blob.length; i++) {
		if (blob[i] !== "[") continue;
		// must be an array of objects: next non-space char is '{'
		let j = i + 1;
		while (j < blob.length && /\s/.test(blob[j])) j++;
		if (blob[j] !== "{") continue;
		// walk to the matching ']'
		let depth = 0,
			inStr = false,
			esc = false,
			end = -1;
		for (let k = i; k < blob.length; k++) {
			const c = blob[k];
			if (inStr) {
				if (esc) esc = false;
				else if (c === "\\") esc = true;
				else if (c === '"') inStr = false;
				continue;
			}
			if (c === '"') inStr = true;
			else if (c === "[" || c === "{") depth++;
			else if (c === "]" || c === "}") {
				depth--;
				if (depth === 0) {
					end = k;
					break;
				}
			}
		}
		if (end === -1) continue;
		try {
			const arr = JSON.parse(blob.slice(i, end + 1));
			if (Array.isArray(arr) && arr.length > best.length && arr[0]?.kind)
				best = arr;
		} catch {}
		i = end; // skip past this array
	}
	return best;
}

const all = [];
const perAgent = {};
for (const f of readdirSync(PARTS_DIR).filter((f) => f.endsWith(".json"))) {
	const rows = JSON.parse(readFileSync(`${PARTS_DIR}/${f}`, "utf8"));
	perAgent[f.replace(".json", "")] = rows.length;
	for (const r of rows) {
		for (const k of Object.keys(r)) r[k] = unescapeHtml(r[k]);
		all.push(r);
	}
}

// Dedupe: operations by module|op, invariants by module|rule.
const seen = new Set();
const ledger = [];
for (const r of all) {
	const key =
		r.kind === "invariant"
			? `inv:${r.module}|${r.rule}`
			: `op:${r.module}|${r.entity}|${r.op}`;
	if (seen.has(key)) continue;
	seen.add(key);
	ledger.push(r);
}

writeFileSync(
	"_e2e/coverage-ledger.json",
	JSON.stringify(ledger, null, 2) + "\n",
);

const ops = ledger.filter((r) => r.kind === "operation").length;
const inv = ledger.filter((r) => r.kind === "invariant").length;
const danger = ledger.filter((r) => r.danger === "irreversible").length;
const byMod = {};
for (const r of ledger)
	(byMod[r.module] ??= { op: 0, inv: 0 }),
		byMod[r.module][r.kind === "invariant" ? "inv" : "op"]++;
console.log("per-agent rows extracted:", perAgent);
console.log(
	`\nledger: ${ledger.length} rows (${ops} operations, ${inv} invariants, ${danger} irreversible)`,
);
console.log("\nper module (op/inv):");
for (const m of Object.keys(byMod).sort())
	console.log(`  ${m}: ${byMod[m].op}/${byMod[m].inv}`);
