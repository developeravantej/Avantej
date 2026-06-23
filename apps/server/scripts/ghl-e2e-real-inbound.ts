/**
 * Prove the REAL location inbound pipeline on staging: sign with the live
 * G0izz webhook_secret (read from DB, never printed) and POST a phone-only
 * ContactCreate to the staging webhook. Then verify + cleanup.
 *
 *   fire   → POST signed webhook to staging (no cleanup), prints CONTACT_ID + HTTP
 *   cleanup <contactId>
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { user } from "@avantej-core/db/schema/auth";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { ghlSyncEvents } from "@avantej-core/db/schema/tenant/ghl-sync-events";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { getControlPanelDb, getTenantDb } from "../src/lib/db";
import { buildPlaceholderEmail } from "../src/services/gohighlevel.service";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const LOCATION = "G0izzPbelobw04MIntR1";
const STAGING = "https://avantej-core-server.ngchwanlii-a9c.workers.dev";
function loadDevVars() { try { for (const l of readFileSync(join(__dirname,"../.dev.vars"),"utf-8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const e=t.indexOf("=");if(e<0)continue;const k=t.slice(0,e).trim();const v=t.slice(e+1).trim().replace(/^"(.*)"$/,"$1");if(!process.env[k])process.env[k]=v;} } catch {} }
const sign = (secret: string, body: string) => createHash("sha256").update(`${secret}.${body}`).digest("hex");

async function main() {
	loadDevVars();
	const cmd = process.argv[2];
	const cp = getControlPanelDb();
	const tdb = await getTenantDb(ORG);

	if (cmd === "fire") {
		const link = await cp.query.ghlBranchLinks.findFirst({ where: eq(ghlBranchLinks.ghlLocationId, LOCATION) });
		if (!link?.webhookSecret) throw new Error("no webhook_secret on G0izz link — set one first");
		const contactId = `zz-realinbound-${process.argv[3] || Date.now()}`;
		const body = JSON.stringify({ type: "ContactCreate", locationId: LOCATION, contact: { id: contactId, firstName: "ZZ", lastName: "RealInbound", phone: "+60120009904" } });
		const res = await fetch(`${STAGING}/webhooks/gohighlevel/${LOCATION}`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-wh-signature": sign(link.webhookSecret, body) },
			body,
		});
		const j = await res.json().catch(() => ({}));
		console.log(`CONTACT_ID=${contactId}`);
		console.log(`HTTP=${res.status} body=${JSON.stringify(j).slice(0, 200)}`);
	} else if (cmd === "cleanup") {
		const contactId = process.argv[3];
		const links = await tdb.select({ userId: ghlContactLinks.userId, cpId: ghlContactLinks.customerProfileId }).from(ghlContactLinks).where(eq(ghlContactLinks.ghlContactId, contactId));
		await tdb.delete(ghlSyncEvents).where(eq(ghlSyncEvents.ghlContactId, contactId));
		await tdb.delete(ghlContactLinks).where(eq(ghlContactLinks.ghlContactId, contactId));
		if (links[0]?.cpId) await tdb.delete(customerProfiles).where(eq(customerProfiles.id, links[0].cpId));
		if (links[0]?.userId) await tdb.delete(members).where(eq(members.userId, links[0].userId));
		const ph = buildPlaceholderEmail(contactId);
		const u = await cp.select({ id: user.id }).from(user).where(eq(user.email, ph));
		if (u[0]?.id) { await tdb.delete(customerProfiles).where(eq(customerProfiles.userId, u[0].id)); await tdb.delete(members).where(eq(members.userId, u[0].id)); await cp.delete(user).where(eq(user.email, ph)); }
		console.log("cleaned", contactId);
	} else { console.log("usage: fire | cleanup <contactId>"); }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
