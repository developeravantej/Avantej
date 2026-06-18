/**
 * One-off live GHL verification for Path C Primary Staff dropdown reconcile.
 * Run from apps/server: bun scripts/verify-primary-staff-dropdown-live.ts
 */
import dotenv from "dotenv";
import fs from "node:fs";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { dispatchStaffSync } from "../src/services/ghl/dispatch-staff-sync";

dotenv.config({ path: ".env" });
const devVars = fs.readFileSync(".dev.vars", "utf8");
for (const line of devVars.split("\n")) {
	const t = line.trim();
	if (!t || t.startsWith("#")) continue;
	const i = t.indexOf("=");
	if (i === -1) continue;
	const k = t.slice(0, i).trim();
	if (k === "GHL_AGENCY_ID") {
		process.env.GHL_AGENCY_ID = t.slice(i + 1).trim();
	}
}

delete process.env.MOCK_GHL;

const agencyId = process.env.GHL_AGENCY_ID;
if (!agencyId) throw new Error("GHL_AGENCY_ID missing from .dev.vars");

const cpPool = new Pool({ connectionString: process.env.DATABASE_URL! });
const cp = drizzle({ client: cpPool, schema: controlPanelSchema });
const org = await cp.query.organizations.findFirst({
	where: eq(organizations.slug, "test-fitness-franchise"),
});
if (!org) throw new Error("org not found");

const tenantPool = new Pool({
	connectionString: decrypt(org.connectionString),
});
const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

const staff = await tenantDb
	.select({ id: members.id })
	.from(members)
	.where(and(eq(members.status, "active"), eq(members.role, "staff")));

console.log(`Syncing ${staff.length} staff member(s) to live GHL…`);
for (const s of staff) {
	const existing = await tenantDb.query.ghlUserLinks.findFirst({
		where: eq(ghlUserLinks.memberId, s.id),
	});
	const operation = existing?.ghlUserId ? "update" : ("create" as const);
	const result = await dispatchStaffSync({
		controlPanelDb: cp,
		tenantDb,
		organizationId: org.id,
		memberId: s.id,
		operation,
		env: { GHL_AGENCY_ID: agencyId },
	});
	console.log(`  member ${s.id.slice(0, 8)} (${operation}) →`, result);
}

const orgAfter = await cp.query.organizations.findFirst({
	where: eq(organizations.id, org.id),
});
console.log(
	"ghlPrimaryStaffFieldId:",
	orgAfter?.ghlPrimaryStaffFieldId ?? null,
);

const links = await tenantDb
	.select({
		memberId: ghlUserLinks.memberId,
		label: ghlUserLinks.primaryStaffOptionLabel,
		syncStatus: ghlUserLinks.syncStatus,
	})
	.from(ghlUserLinks);
console.log("ghl_user_links:", links);

const fieldId = orgAfter?.ghlPrimaryStaffFieldId;
if (!fieldId) {
	console.error("FAIL: no primary staff field id after reconcile");
	process.exit(1);
}

const apiKey = decrypt(orgAfter!.ghlApiKeyEncrypted!);
const fieldRes = await fetch(
	`https://services.leadconnectorhq.com/locations/${org.ghlLocationId}/customFields/${fieldId}`,
	{
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: "2021-07-28",
			Accept: "application/json",
		},
	},
);
if (!fieldRes.ok) {
	console.error(
		"GHL GET customField failed",
		fieldRes.status,
		await fieldRes.text(),
	);
	process.exit(1);
}

const fieldBody = (await fieldRes.json()) as {
	customField?: { picklistOptions?: string[] };
};
const ghlOptions = [...(fieldBody.customField?.picklistOptions ?? [])].sort();

const dbLabels = links
	.filter((l) => l.syncStatus === "active" && l.label)
	.map((l) => l.label!)
	.sort();
console.log("GHL options:", ghlOptions);
console.log("DB labels:", dbLabels);

const match = JSON.stringify(ghlOptions) === JSON.stringify(dbLabels);
console.log(
	match ? "PASS: GHL picklistOptions match DB labels" : "FAIL: option mismatch",
);

if (dbLabels.length > 0) {
	const [resolved] = await tenantDb
		.select({ memberId: ghlUserLinks.memberId })
		.from(ghlUserLinks)
		.where(eq(ghlUserLinks.primaryStaffOptionLabel, dbLabels[0]!))
		.limit(1);
	console.log(
		resolved
			? `PASS: label "${dbLabels[0]}" resolves to member ${resolved.memberId.slice(0, 8)}`
			: "FAIL: label lookup returned no member",
	);
}

await tenantPool.end();
await cpPool.end();
process.exit(match ? 0 : 1);
