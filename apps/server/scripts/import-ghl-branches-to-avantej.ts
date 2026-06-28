/**
 * One-way reconcile: import the branches that exist as GHL per-country dropdown
 * options INTO the Avantej hierarchy (Avantej is source of truth; this catches
 * it up to branches that were only ever entered in GHL). Creates missing
 * state + branch nodes via the hierarchy service (correct depth/slug/denorm).
 *
 * Parsing: a GHL option "State - Branch" → state node (under country) + branch
 * node (under state). An option with no " - " → branch directly under country.
 * Junk options (placeholder "—", empty, "(no branch yet)") are skipped. Branch
 * names are globally unique in Avantej, so an existing branch (by bare name) is
 * skipped.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/import-ghl-branches-to-avantej.ts            # DRY RUN
 *   bun run scripts/import-ghl-branches-to-avantej.ts --apply    # write
 */
import { decrypt } from "@avantej-core/db";
import * as cp from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import * as ten from "@avantej-core/db/schema/tenant-schema";
import { createHierarchyNode } from "@avantej-core/services";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const SEP = " - ";
const JUNK = new Set(["—", "-", "", "(no branch yet)"]);
const apply = process.argv.includes("--apply");
const TENANT = process.env.RECONCILE_TENANT ?? "Test Fitness Franchise";

function parseOption(
	opt: string,
): { state: string | null; branch: string } | null {
	const clean = opt
		.trim()
		.replace(/(null|undefined)$/i, "")
		.trim();
	if (!clean || JUNK.has(clean)) return null;
	const i = clean.indexOf(SEP);
	if (i === -1) return { state: null, branch: clean };
	return {
		state: clean.slice(0, i).trim(),
		branch: clean.slice(i + SEP.length).trim(),
	};
}

const cpPool = new Pool({ connectionString: process.env.DATABASE_URL });
const cpDb = drizzle({ client: cpPool, schema: cp });
const org = await cpDb.query.organizations.findFirst({
	where: eq(organizations.name, TENANT),
});
if (!org?.ghlLocationId || !org.ghlApiKeyEncrypted) {
	console.log("tenant not org-shared/connected");
	process.exit(0);
}

let tc: string;
try {
	tc = decrypt(org.connectionString);
} catch {
	tc = org.connectionString;
}
const tPool = new Pool({ connectionString: tc });
const tDb = drizzle({ client: tPool, schema: ten });

const nodes = await tDb.select().from(hierarchyNodes);
const byId = new Map(nodes.map((n) => [n.id, n]));
// existing states keyed by `${countryId}|${lowername}`; branches by bare lowername (global).
const stateKey = (countryId: string, name: string) =>
	`${countryId}|${name.trim().toLowerCase()}`;
const stateMap = new Map<string, string>(); // key -> stateNodeId
const branchNames = new Set<string>();
for (const n of nodes) {
	if (n.type === "state" && n.countryNodeId)
		stateMap.set(stateKey(n.countryNodeId, n.name), n.id);
	if (n.type === "branch") branchNames.add(n.name.trim().toLowerCase());
}

const apiKey = decrypt(org.ghlApiKeyEncrypted);
const fieldMap = (org.ghlCountryFieldMap ?? {}) as Record<string, any>;

type Plan = {
	country: string;
	createStates: Set<string>;
	createBranches: Array<{ branch: string; state: string | null }>;
	skipped: string[];
};
const plans: Plan[] = [];

for (const [countryId, entry] of Object.entries(fieldMap)) {
	const country = byId.get(countryId);
	if (!country) {
		console.log(
			`⚠️ country node ${countryId} (${entry.fieldKey}) not in hierarchy — skipping`,
		);
		continue;
	}
	const res = await fetch(
		`https://services.leadconnectorhq.com/locations/${org.ghlLocationId}/customFields/${entry.ghlFieldId}`,
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Version: "2021-07-28",
				Accept: "application/json",
			},
		},
	);
	const j: any = await res.json();
	const opts: string[] =
		j?.customField?.picklistOptions ?? j?.customField?.options ?? [];
	const plan: Plan = {
		country: country.name,
		createStates: new Set(),
		createBranches: [],
		skipped: [],
	};
	for (const opt of opts) {
		const p = parseOption(opt);
		if (!p) {
			plan.skipped.push(`${opt} (junk)`);
			continue;
		}
		if (branchNames.has(p.branch.trim().toLowerCase())) {
			plan.skipped.push(`${opt} (branch exists)`);
			continue;
		}
		if (p.state && !stateMap.has(stateKey(countryId, p.state)))
			plan.createStates.add(p.state);
		plan.createBranches.push({ branch: p.branch, state: p.state });
	}
	plans.push(plan);
}

console.log(
	`\n${apply ? "APPLY" : "DRY RUN"} — import GHL branches into Avantej for "${TENANT}"\n`,
);
let nStates = 0,
	nBranches = 0;
for (const p of plans) {
	console.log(
		`■ ${p.country}: +${p.createStates.size} state(s), +${p.createBranches.length} branch(es), ${p.skipped.length} skipped`,
	);
	if (p.createStates.size)
		console.log(`   states:   ${[...p.createStates].join(", ")}`);
	if (p.createBranches.length)
		console.log(
			`   branches: ${p.createBranches.map((b) => (b.state ? `${b.state} - ${b.branch}` : b.branch)).join(", ")}`,
		);
	nStates += p.createStates.size;
	nBranches += p.createBranches.length;
}
console.log(`\nTotal: +${nStates} states, +${nBranches} branches.`);

if (!apply) {
	console.log("\nDRY RUN — no writes. Re-run with --apply to create them.");
	await tPool.end();
	await cpPool.end();
	process.exit(0);
}

// Apply: per country, create states first (so branches can parent to them).
for (const countryId of Object.keys(fieldMap)) {
	const country = byId.get(countryId);
	if (!country) continue;
	const plan = plans.find((p) => p.country === country.name);
	if (!plan) continue;
	for (const stateName of plan.createStates) {
		const node = await createHierarchyNode(tDb, {
			type: "state",
			name: stateName,
			parentId: country.id,
		});
		stateMap.set(stateKey(countryId, stateName), node.id);
		console.log(`  ✅ state  ${country.name} / ${stateName}`);
	}
	for (const b of plan.createBranches) {
		const parentId = b.state
			? stateMap.get(stateKey(countryId, b.state))!
			: country.id;
		try {
			await createHierarchyNode(tDb, {
				type: "branch",
				name: b.branch,
				parentId,
			});
			branchNames.add(b.branch.trim().toLowerCase());
			console.log(`  ✅ branch ${b.state ? `${b.state} / ` : ""}${b.branch}`);
		} catch (e) {
			console.log(
				`  ❌ branch ${b.branch}: ${e instanceof Error ? e.message : e}`,
			);
		}
	}
}
console.log("\nApply done.");
await tPool.end();
await cpPool.end();
