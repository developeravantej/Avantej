/**
 * LIVE STAFF-USER CRUD E2E (real GHL agency user). Self-cleaning: the D step
 * DELETEs the GHL user it created. ⚠️ POST /users/ creates a real agency user
 * (may send an invite email to the labeled test address).
 *
 * In-memory user+member (ghl_user_links.member_id has no FK) → no real member
 * rows created. Only a ghl_user_links row is written (fake member id, labeled).
 *
 * Usage: cd apps/server && bun run scripts/e2e-ghl-staff.ts --seed
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { decrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { and, eq } from "drizzle-orm";
import { getControlPanelDb, getTenantDb } from "../src/lib/db";
import { syncStaffToGhl } from "../src/services/ghl/sync-staff";

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadDevVars() {
	try {
		for (const line of readFileSync(
			join(__dirname, "../.dev.vars"),
			"utf-8",
		).split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#")) continue;
			const i = t.indexOf("=");
			if (i === -1) continue;
			const k = t.slice(0, i).trim();
			const v = t
				.slice(i + 1)
				.trim()
				.replace(/^"(.*)"$/, "$1");
			if (!process.env[k]) process.env[k] = v;
		}
	} catch {}
}
loadDevVars();

const seed = process.argv.includes("--seed");
const RUN = `e2estaff${Date.now().toString().slice(-6)}`;
const BASE = "https://services.leadconnectorhq.com";
const companyId = process.env.GHL_AGENCY_ID || "";

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
const [br] = await tDb
	.select({ id: hierarchyNodes.id })
	.from(hierarchyNodes)
	.where(and(eq(hierarchyNodes.type, "branch"), eq(hierarchyNodes.name, "SS2")))
	.limit(1);
if (!br) {
	console.log("no SS2 branch");
	process.exit(1);
}

console.log(
	`${seed ? "SEED" : "DRY"} — staff CRUD run=${RUN} companyId=${companyId ? companyId.slice(0, 6) + "…" : "MISSING"} branch=SS2\n`,
);
if (!companyId) {
	console.log(
		"❌ GHL_AGENCY_ID not set (.dev.vars) — cannot create GHL users.",
	);
	process.exit(1);
}
if (!seed) {
	console.log(
		"DRY — re-run with --seed to create/verify/update/delete a real GHL agency user.",
	);
	process.exit(0);
}

const userId = randomUUID();
const member = {
	id: randomUUID(),
	userId,
	role: "trainer",
	status: "active",
	hierarchyScopeId: br.id,
};
const user = {
	id: userId,
	email: `${RUN}@avantej-e2e.test`,
	firstName: "E2E",
	lastName: "Coach",
	name: "E2E Coach",
	phone: null,
};
const common = {
	controlPanelDb: cpDb,
	tenantDb: tDb,
	organizationId: org.id,
	branchNodeId: br.id,
	companyId,
	user,
	member,
	decryptApiKey: decrypt,
};
const getUser = async (id: string) =>
	fetch(`${BASE}/users/${id}`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: "2021-07-28",
			Accept: "application/json",
		},
	});
const results: any[] = [];

// CREATE
const c = await syncStaffToGhl({ ...common, operation: "create" });
const ghlUserId = c.ghlUserId;
console.log(`■ CREATE → status=${c.status} ghlUserId=${ghlUserId ?? c.error}`);
results.push({ case: "staff-C", pass: c.status === "synced" && !!ghlUserId });

// READ
if (ghlUserId) {
	const g = await getUser(ghlUserId);
	const gj: any = await g.json();
	const u = gj?.user ?? gj;
	const okR = g.status === 200 && u?.email === user.email;
	console.log(
		`■ READ   → GET /users/${ghlUserId} status=${g.status} email=${u?.email} ${okR ? "✅" : "❌"}`,
	);
	results.push({ case: "staff-R", pass: okR });

	// UPDATE (role change trainer→staff → narrower perms; same ghlUserId)
	const u2 = await syncStaffToGhl({
		...common,
		member: { ...member, role: "staff" },
		operation: "update",
	});
	const okU = u2.status === "synced" && u2.ghlUserId === ghlUserId;
	console.log(
		`■ UPDATE → status=${u2.status} sameUserId=${u2.ghlUserId === ghlUserId} ${okU ? "✅" : "❌"}`,
	);
	results.push({ case: "staff-U", pass: okU });

	// DELETE (low-level syncStaffToGhl delete → DELETE /users/)
	const d = await syncStaffToGhl({ ...common, operation: "delete" });
	const gAfter = await getUser(ghlUserId);
	const okD = gAfter.status === 404 || gAfter.status === 400;
	console.log(
		`■ DELETE → status=${d.status} then GET=${gAfter.status} ${okD ? "✅ removed" : "❌ still present"}`,
	);
	results.push({ case: "staff-D", pass: okD, ghlUserId });
}

console.log("\n── STAFF CRUD RESULTS ──");
for (const r of results) console.log(`  ${r.pass ? "✅" : "❌"} ${r.case}`);
console.log(
	`\nGHL user was created then deleted (self-cleaning). Labeled email: ${user.email}`,
);
process.exit(0);
