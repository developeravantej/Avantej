/**
 * LIVE CRUD E2E (real GHL + prod DB). Covers:
 *   • Branch-option C/U/D on the real {country}_location dropdown (labeled
 *     throwaway option — the D step removes its own subject).
 *   • Contact delete-in: a GHL delete webhook → Avantej soft-delete.
 *
 * Usage: cd apps/server && bun run scripts/e2e-ghl-crud.ts --seed
 */
import { createHash } from "node:crypto";
import { decrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { and, eq } from "drizzle-orm";
import { getControlPanelDb, getTenantDb } from "../src/lib/db";
import {
	ensureBranchOption,
	renameBranchOption,
	removeBranchOption,
} from "../src/services/ghl/branch-sync";
import { processGhlWebhook } from "../src/services/gohighlevel.service";

const seed = process.argv.includes("--seed");
const LOC = "G0izzPbelobw04MIntR1";
const RUN = `e2ecrud${Date.now().toString().slice(-6)}`;
const BASE = "https://services.leadconnectorhq.com";
const sign = (s: string, b: string) =>
	`sha256=${createHash("sha256").update(`${s}.${b}`).digest("hex")}`;

const cpDb = getControlPanelDb();
const org = await cpDb.query.organizations.findFirst({
	where: eq(organizations.name, "Test Fitness Franchise"),
});
if (!org?.ghlApiKeyEncrypted) {
	console.log("no org");
	process.exit(1);
}
const tDb = await getTenantDb(org.id);
const apiKey = decrypt(org.ghlApiKeyEncrypted);
const map = (org.ghlCountryFieldMap ?? {}) as Record<string, any>;
const myField = Object.values(map).find((e: any) =>
	e.fieldKey?.includes("malaysia"),
) as any;
const [link] = await cpDb
	.select({ s: ghlBranchLinks.webhookSecret })
	.from(ghlBranchLinks)
	.where(
		and(
			eq(ghlBranchLinks.ghlLocationId, LOC),
			eq(ghlBranchLinks.isActive, true),
		),
	)
	.limit(1);
const secret = link?.s ?? org.ghlWebhookSecret ?? "";

const args = {
	ghlLocationId: org.ghlLocationId!,
	ghlApiKey: apiKey,
	ghlFieldId: myField.ghlFieldId,
};
async function opts(): Promise<string[]> {
	const r = await fetch(
		`${BASE}/locations/${org!.ghlLocationId}/customFields/${myField.ghlFieldId}`,
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Version: "2021-07-28",
				Accept: "application/json",
			},
		},
	);
	const j: any = await r.json();
	return j?.customField?.picklistOptions ?? j?.customField?.options ?? [];
}

if (!seed) {
	console.log(
		`DRY — would CRUD option on ${myField.fieldKey} + delete-webhook. Re-run --seed.`,
	);
	process.exit(0);
}

console.log(`SEED — CRUD e2e run=${RUN} field=${myField.fieldKey}\n`);
const results: any[] = [];

// ── Branch-option CREATE
const optC = `E2E ${RUN} - Create`;
await ensureBranchOption({ ...args, optionLabel: optC });
let has = (await opts()).includes(optC);
console.log(`■ option CREATE "${optC}" → ${has ? "✅ present" : "❌ missing"}`);
results.push({ case: "branchopt-C", pass: has });

// ── Branch-option UPDATE (rename)
const optU = `E2E ${RUN} - Renamed`;
await renameBranchOption({ ...args, oldLabel: optC, newLabel: optU });
const after = await opts();
const renamed = after.includes(optU) && !after.includes(optC);
console.log(`■ option UPDATE rename → ${renamed ? "✅ renamed" : "❌ failed"}`);
results.push({ case: "branchopt-U", pass: renamed });

// ── Branch-option DELETE
await removeBranchOption({ ...args, optionLabel: optU });
const gone = !(await opts()).includes(optU);
console.log(`■ option DELETE → ${gone ? "✅ removed" : "❌ still present"}`);
results.push({ case: "branchopt-D", pass: gone });

// ── Contact DELETE-IN: seed a linked contact, then delete-webhook it.
const cid = `${RUN}-del`;
const seedBody = JSON.stringify({
	type: "ContactCreate",
	locationId: LOC,
	contact: {
		id: cid,
		firstName: "E2EDel",
		lastName: "Target",
		phone: "+60169900001",
		selected_location: "SS2",
		selected_country: "Malaysia",
	},
});
await processGhlWebhook({
	c: undefined as any,
	locationId: LOC,
	rawBody: seedBody,
	signature: sign(secret, seedBody),
	payload: JSON.parse(seedBody),
});
const delBody = JSON.stringify({
	type: "ContactDelete",
	locationId: LOC,
	contact: { id: cid, phone: "+60169900001" },
});
const dr = await processGhlWebhook({
	c: undefined as any,
	locationId: LOC,
	rawBody: delBody,
	signature: sign(secret, delBody),
	payload: JSON.parse(delBody),
});
// α-canonical: Avantej is source of truth → a GHL delete on a LINKED contact
// is REJECTED (skipped), Avantej data left intact. That is the correct,
// integrity-preserving outcome (NOT a soft-delete).
const [lnk] = await tDb
	.select({
		st: ghlContactLinks.syncStatus,
		cp: ghlContactLinks.customerProfileId,
	})
	.from(ghlContactLinks)
	.where(eq(ghlContactLinks.ghlContactId, cid))
	.limit(1);
const stillActive = lnk?.st === "active";
let profileIntact = true;
if (lnk?.cp) {
	const [p] = await tDb
		.select({ d: customerProfiles.isDeleted })
		.from(customerProfiles)
		.where(eq(customerProfiles.id, lnk.cp))
		.limit(1);
	profileIntact = !p?.d;
}
const rejected = dr.status === "skipped" && stillActive && profileIntact;
console.log(
	`■ contact DELETE-IN (webhook, linked) → status=${dr.status} link=${lnk?.st} ${rejected ? "✅ rejected (α-canonical: Avantej protected)" : "❌"}`,
);
results.push({ case: "contact-D-in", pass: rejected, contactId: cid });

console.log("\n── CRUD RESULTS ──");
for (const r of results) console.log(`  ${r.pass ? "✅" : "❌"} ${r.case}`);
process.exit(0);
