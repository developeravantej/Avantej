/**
 * LIVE OUTBOUND E2E (seeds REAL GHL, NO cleanup — for in-person review).
 *
 * Exercises the real changed code per case: resolveSyncContext (reads the org's
 * ghlGlobalFieldMap + branch path) → buildContactPayload (new designated_* +
 * standard-field stamping) → POST /contacts/ to the LIVE GHL location → GET the
 * contact back → assert the custom fields landed. Creates clearly-labeled mock
 * contacts and LEAVES them (no delete) so they can be reviewed in the GHL UI.
 *
 * Zero Avantej-DB writes (no manufactured members) — only GHL contacts.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/e2e-ghl-outbound.ts            # dry (build payloads, no GHL writes)
 *   bun run scripts/e2e-ghl-outbound.ts --seed     # POST to real GHL + verify
 */
import { decrypt } from "@avantej-core/db";
import * as cp from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import * as ten from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq } from "drizzle-orm";
import ws from "ws";
import { resolveSyncContext } from "../src/services/ghl/sync-context";
import { buildContactPayload } from "../src/services/ghl/payload-builders";

neonConfig.webSocketConstructor = ws;
const seed = process.argv.includes("--seed");
const TENANT = "Test Fitness Franchise";
const RUN = `e2e${Date.now().toString().slice(-6)}`; // short run tag for labels
const BASE = "https://services.leadconnectorhq.com";

const cpPool = new Pool({ connectionString: process.env.DATABASE_URL });
const cpDb = drizzle({ client: cpPool, schema: cp });
const org = await cpDb.query.organizations.findFirst({
	where: eq(organizations.name, TENANT),
});
if (!org?.ghlLocationId || !org.ghlApiKeyEncrypted) {
	console.log("not provisioned");
	process.exit(1);
}
const apiKey = decrypt(org.ghlApiKeyEncrypted);
let tcs: string;
try {
	tcs = decrypt(org.connectionString);
} catch {
	tcs = org.connectionString;
}
const tDb = drizzle({
	client: new Pool({ connectionString: tcs }),
	schema: ten,
});

async function branchByName(name: string): Promise<string | null> {
	const [b] = await tDb
		.select({ id: hierarchyNodes.id })
		.from(hierarchyNodes)
		.where(
			and(eq(hierarchyNodes.type, "branch"), eq(hierarchyNodes.name, name)),
		)
		.limit(1);
	return b?.id ?? null;
}

// Each case: a real branch + a labeled mock profile + the fields we expect on GHL.
const CASES: Array<{
	id: string;
	branch: string;
	profile: any;
	expect: { country: string; branch: string };
}> = [
	{
		id: "A1-malaysia-state",
		branch: "SS2",
		profile: {
			gender: "male",
			emergencyContactName: "ICE Tan",
			emergencyContactPhone: "+60100000001",
			medicalNotes: "none",
			creditPoints: 5,
			notes: "e2e A1",
		},
		expect: { country: "Malaysia", branch: "SS2" },
	},
	{
		id: "A2-thailand",
		branch: "Asok",
		profile: {
			gender: "female",
			emergencyContactName: "ICE Som",
			emergencyContactPhone: "+66000000002",
		},
		expect: { country: "Thailand", branch: "Asok" },
	},
	{
		id: "A3-singapore",
		branch: "Tanjong Pagar",
		profile: { gender: "male" },
		expect: { country: "Singapore", branch: "Tanjong Pagar" },
	},
	{
		id: "A4-all-fields",
		branch: "KLCC",
		profile: {
			gender: "female",
			emergencyContactName: "ICE Lim",
			emergencyContactPhone: "+60100000004",
			medicalNotes: "asthma",
			creditPoints: 99,
			notes: "e2e full fields",
			address: "1 Jalan Test",
		},
		expect: { country: "Malaysia", branch: "KLCC" },
	},
];

const seeded: Array<Record<string, unknown>> = [];
console.log(
	`${seed ? "SEED" : "DRY"} — outbound e2e, run=${RUN}, location=${org.ghlLocationId}\n`,
);

for (const c of CASES) {
	const branchNodeId = await branchByName(c.branch);
	if (!branchNodeId) {
		console.log(`✗ ${c.id}: branch "${c.branch}" not found`);
		continue;
	}
	const ctx = await resolveSyncContext({
		controlPanelDb: cpDb,
		tenantDb: tDb,
		organizationId: org.id,
		branchNodeId,
		decryptApiKey: decrypt,
	});
	if (ctx.model !== "org-shared") {
		console.log(`✗ ${c.id}: ctx=${ctx.model}`);
		continue;
	}
	const email = `${RUN}-${c.id}@avantej-e2e.test`;
	const payload = buildContactPayload({
		locationId: ctx.locationId,
		user: {
			id: `u_${RUN}_${c.id}`,
			email,
			firstName: "E2E",
			lastName: c.id,
			name: `E2E ${c.id}`,
		},
		profile: {
			id: `cp_${RUN}_${c.id}`,
			phone: null,
			dateOfBirth: null,
			fitnessGoals: null,
			address: null,
			...c.profile,
		} as any,
		memberStatus: "active",
		customFieldIds: ctx.globalFieldIds,
		branchCountryFieldId: ctx.branchCountryFieldId,
		branchOptionLabel: ctx.branchOptionLabel,
		branchName: ctx.branchName,
		countryName: ctx.countryName,
	});
	console.log(
		`■ ${c.id}  branch=${c.branch}  expect designated_country=${c.expect.country} designated_branch=${c.expect.branch} dropdown="${ctx.branchOptionLabel}"`,
	);
	if (!seed) {
		console.log(`   (dry) customFields=${payload.customFields?.length ?? 0}\n`);
		continue;
	}

	// POST to real GHL
	const res = await fetch(`${BASE}/contacts/`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: "2021-07-28",
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify(payload),
	});
	const txt = await res.text();
	let cid: string | null = null;
	try {
		const j = JSON.parse(txt);
		cid = j?.contact?.id ?? j?.id ?? j?.meta?.contactId ?? null;
	} catch {}
	if (!cid) {
		console.log(`   ❌ POST failed ${res.status}: ${txt.slice(0, 200)}\n`);
		continue;
	}

	// GET back + verify
	const get = await fetch(`${BASE}/contacts/${cid}`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: "2021-07-28",
			Accept: "application/json",
		},
	});
	const gj: any = await get.json();
	const cf: any[] = gj?.contact?.customFields ?? [];
	const val = (fid?: string | null) =>
		cf.find((f) => f.id === fid)?.value ??
		cf.find((f) => f.id === fid)?.field_value ??
		null;
	const gotCountry = val(ctx.globalFieldIds.designatedCountry);
	const gotBranch = val(ctx.globalFieldIds.designatedBranch);
	const okCountry = gotCountry === c.expect.country;
	const okBranch = gotBranch === c.expect.branch;
	console.log(`   contact=${cid} email=${email}`);
	console.log(
		`   designated_country=${JSON.stringify(gotCountry)} ${okCountry ? "✅" : "❌"}  designated_branch=${JSON.stringify(gotBranch)} ${okBranch ? "✅" : "❌"}\n`,
	);
	seeded.push({
		case: c.id,
		contactId: cid,
		email,
		designated_country: gotCountry,
		designated_branch: gotBranch,
		pass: okCountry && okBranch,
	});
}

if (seed) {
	console.log("── SEEDED (left in GHL for review) ──");
	for (const s of seeded)
		console.log(
			`  ${s.pass ? "✅" : "❌"} ${s.case}  contact=${s.contactId}  ${s.email}`,
		);
	console.log(
		`\nReview in GHL: search contacts for "${RUN}" or domain @avantej-e2e.test`,
	);
}
await cpPool.end();
process.exit(0);
