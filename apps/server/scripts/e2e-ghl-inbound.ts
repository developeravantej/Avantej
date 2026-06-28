/**
 * LIVE INBOUND E2E (drives the real processGhlWebhook against prod DB, NO server).
 *
 * Phone-only contacts → placeholder emails → no magic-link email sent. Each case
 * posts a signed webhook through the real signature gate + processGhlWebhook (new
 * code), then reads the tenant DB back to PROVE branch resolution / member
 * creation. Labeled mock members are LEFT in place for in-person review.
 *
 * NOTE: there is an ACTIVE ghl_branch_links row for this location, so org
 * resolution goes via the per-branch path (link.tenantBranchId is the fallback
 * branch). The branch-NAME matching + matcher hardening + country-scope still run.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/e2e-ghl-inbound.ts          # dry (plan only)
 *   bun run scripts/e2e-ghl-inbound.ts --seed   # drive real webhooks + verify
 */
import { createHash } from "node:crypto";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { neonConfig } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import ws from "ws";
import { getControlPanelDb, getTenantDb } from "../src/lib/db";
import {
	processGhlWebhook,
	buildPlaceholderEmail,
} from "../src/services/gohighlevel.service";

neonConfig.webSocketConstructor = ws;
const seed = process.argv.includes("--seed");
const TENANT = "Test Fitness Franchise";
const LOC = "G0izzPbelobw04MIntR1";
const RUN = `e2einb${Date.now().toString().slice(-6)}`;
const sign = (secret: string, body: string) =>
	`sha256=${createHash("sha256").update(`${secret}.${body}`).digest("hex")}`;

const cpDb = getControlPanelDb();
const org = await cpDb.query.organizations.findFirst({
	where: eq(organizations.name, TENANT),
});
if (!org) {
	console.log("no org");
	process.exit(1);
}
const tDb = await getTenantDb(org.id);
const [link] = await cpDb
	.select({ s: ghlBranchLinks.webhookSecret, b: ghlBranchLinks.tenantBranchId })
	.from(ghlBranchLinks)
	.where(
		and(
			eq(ghlBranchLinks.ghlLocationId, LOC),
			eq(ghlBranchLinks.isActive, true),
		),
	)
	.limit(1);
const secret = link?.s ?? org.ghlWebhookSecret ?? "";
const fallbackBranch = link?.b ?? null;

async function branchId(name: string) {
	const [b] = await tDb
		.select({ id: hierarchyNodes.id })
		.from(hierarchyNodes)
		.where(
			and(eq(hierarchyNodes.type, "branch"), eq(hierarchyNodes.name, name)),
		)
		.limit(1);
	return b?.id ?? null;
}
async function memberScope(contactId: string) {
	const email = buildPlaceholderEmail(contactId);
	const [u] = await cpDb
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.email, email))
		.limit(1);
	if (!u)
		return {
			email,
			scope: null as string | null,
			userId: null as string | null,
		};
	const [m] = await tDb
		.select({ s: members.hierarchyScopeId })
		.from(members)
		.where(eq(members.userId, u.id))
		.limit(1);
	return { email, scope: m?.s ?? null, userId: u.id };
}

// cases: selected_location → expected resolved branch (by name) or "fallback"
const CASES = [
	{
		id: "B2-composite",
		country: "Malaysia",
		location: "Selangor - SS2",
		expectBranch: "SS2",
	},
	{
		id: "B4-null-artifact",
		country: "Malaysia",
		location: "Kuala Lumpur - KLCCnull",
		expectBranch: "KLCC",
	},
	{
		id: "B5-stale-fallback",
		country: "Malaysia",
		location: "Ghost Branch Zzz",
		expectBranch: "__fallback__",
	},
	{
		id: "B6-empty-fallback",
		country: "Malaysia",
		location: "",
		expectBranch: "__fallback__",
	},
	{
		id: "B7-country-scope",
		country: "Thailand",
		location: "Asok",
		expectBranch: "Asok",
	},
];

console.log(
	`${seed ? "SEED" : "DRY"} — inbound e2e run=${RUN} loc=${LOC} secretLen=${secret.length} fallbackBranch=${fallbackBranch}\n`,
);
const results: any[] = [];

let phoneSeq = 0;
for (const c of CASES) {
	const contactId = `${RUN}-${c.id}`;
	const phone = `+60169${String(100000 + phoneSeq++).slice(-6)}`; // unique per case
	const payload = {
		type: "ContactCreate",
		locationId: LOC,
		contact: {
			id: contactId,
			firstName: "E2EIn",
			lastName: c.id,
			phone,
			selected_country: c.country,
			selected_location: c.location,
		},
	};
	const expectBranchId =
		c.expectBranch === "__fallback__"
			? fallbackBranch
			: await branchId(c.expectBranch);
	console.log(
		`■ ${c.id}  selected_location=${JSON.stringify(c.location)} → expect ${c.expectBranch} (${expectBranchId})`,
	);
	if (!seed) {
		console.log("");
		continue;
	}
	const body = JSON.stringify(payload);
	let status = "?";
	try {
		const r = await processGhlWebhook({
			c: undefined as any,
			locationId: LOC,
			rawBody: body,
			signature: sign(secret, body),
			payload,
		});
		status = r.status;
	} catch (e) {
		status = `error:${e instanceof Error ? e.message : e}`;
	}
	const ms = await memberScope(contactId);
	const pass = ms.scope === expectBranchId;
	console.log(
		`   status=${status} member.scope=${ms.scope} ${pass ? "✅" : "❌"}  email=${ms.email}`,
	);
	results.push({
		case: c.id,
		contactId,
		status,
		expected: expectBranchId,
		got: ms.scope,
		pass,
		email: ms.email,
		userId: ms.userId,
	});
	console.log("");
}

// C3: bad-secret rejection
if (seed) {
	const body = JSON.stringify({
		type: "ContactCreate",
		locationId: LOC,
		contact: { id: `${RUN}-C3`, phone: "+60160000001" },
	});
	let rejected = false;
	try {
		await processGhlWebhook({
			c: undefined as any,
			locationId: LOC,
			rawBody: body,
			signature: "sha256=deadbeef",
			payload: JSON.parse(body),
		});
	} catch (e: any) {
		rejected = e?.status === 401 || /signature|auth/i.test(String(e?.message));
	}
	console.log(
		`■ C3-bad-secret → ${rejected ? "✅ rejected" : "❌ NOT rejected"}\n`,
	);
	results.push({
		case: "C3-bad-secret",
		pass: rejected,
		status: rejected ? "401" : "accepted",
	});
}

if (seed) {
	console.log("── INBOUND SEEDED (members left for review) ──");
	for (const r of results)
		console.log(
			`  ${r.pass ? "✅" : "❌"} ${r.case}  ${r.contactId ?? ""}  scope=${r.got ?? "-"}  ${r.email ?? ""}`,
		);
	console.log(
		`\nReview in Avantej: members with placeholder email ghl-${RUN}-*@ghl.placeholder`,
	);
}
process.exit(0);
