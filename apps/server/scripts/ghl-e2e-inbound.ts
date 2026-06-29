/**
 * E2E inbound helper (split fire/cleanup so the UI can show the event before teardown).
 * Uses a throwaway location (avantej-e2e-inbound-loc) bound to org 996febce so the
 * resulting sync event appears in that org's GHL Integration → Sync Events UI.
 * Touches NO real GHL account.
 *
 *   bun run scripts/ghl-e2e-inbound.ts fire            → ensure link + POST signed contact (NO cleanup); prints CONTACT_ID
 *   bun run scripts/ghl-e2e-inbound.ts cleanup <id>    → delete the records for that contact
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
const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const LOCATION = "avantej-e2e-inbound-loc";
const SECRET = "avantej-e2e-secret";
const BRANCH_NODE = "732f16af-5e0d-4add-9a0b-03aac652ddbd"; // Bukit Jalil (no existing GHL link)
const BASE = process.env.GHL_E2E_BASE_URL || "http://avantej.localhost:3020";

function loadDevVars(): void {
	try {
		for (const line of readFileSync(
			join(__dirname, "../.dev.vars"),
			"utf-8",
		).split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#")) continue;
			const eq = t.indexOf("=");
			if (eq === -1) continue;
			const k = t.slice(0, eq).trim();
			const v = t
				.slice(eq + 1)
				.trim()
				.replace(/^"(.*)"$/, "$1");
			if (!process.env[k]) process.env[k] = v;
		}
	} catch {}
}
const signGhl = (secret: string, body: string) =>
	createHash("sha256").update(`${secret}.${body}`).digest("hex");

async function fire() {
	const cpDb = getControlPanelDb();
	const tenantDb = await getTenantDb(ORG_ID);
	await cpDb
		.insert(ghlBranchLinks)
		.values({
			organizationId: ORG_ID,
			tenantBranchId: BRANCH_NODE,
			ghlLocationId: LOCATION,
			ghlApiKey: "e2e-unused",
			webhookSecret: SECRET,
			isActive: true,
		})
		.onConflictDoUpdate({
			target: ghlBranchLinks.ghlLocationId,
			set: {
				webhookSecret: SECRET,
				isActive: true,
				tenantBranchId: BRANCH_NODE,
			},
		});

	const contactId = `e2e-ghl-${process.argv[3] || process.pid}`;
	const body = JSON.stringify({
		type: "ContactCreate",
		locationId: LOCATION,
		contact: {
			id: contactId,
			firstName: "E2E",
			lastName: "GHLInbound",
			phone: "+60198887766",
		},
	});
	const res = await fetch(`${BASE}/webhooks/gohighlevel/${LOCATION}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-wh-signature": signGhl(SECRET, body),
		},
		body,
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (res.status !== 200)
		throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(json)}`);
	const events = await tenantDb
		.select({ status: ghlSyncEvents.status })
		.from(ghlSyncEvents)
		.where(eq(ghlSyncEvents.ghlContactId, contactId));
	console.log(`CONTACT_ID=${contactId}`);
	console.log(`EVENT_STATUS=${events[0]?.status ?? "none"}`);
	console.log(`HTTP=${res.status} field=${String(json.status)}`);
}

async function cleanup(contactId: string) {
	const cpDb = getControlPanelDb();
	const tenantDb = await getTenantDb(ORG_ID);
	const links = await tenantDb
		.select({
			userId: ghlContactLinks.userId,
			cpId: ghlContactLinks.customerProfileId,
		})
		.from(ghlContactLinks)
		.where(eq(ghlContactLinks.ghlContactId, contactId));
	const placeholderEmail = buildPlaceholderEmail(contactId);
	await tenantDb
		.delete(ghlSyncEvents)
		.where(eq(ghlSyncEvents.ghlContactId, contactId));
	await tenantDb
		.delete(ghlContactLinks)
		.where(eq(ghlContactLinks.ghlContactId, contactId));
	if (links[0]?.cpId)
		await tenantDb
			.delete(customerProfiles)
			.where(eq(customerProfiles.id, links[0].cpId));
	if (links[0]?.userId)
		await tenantDb.delete(members).where(eq(members.userId, links[0].userId));
	const u = await cpDb
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, placeholderEmail));
	if (u[0]?.id) {
		await tenantDb
			.delete(customerProfiles)
			.where(eq(customerProfiles.userId, u[0].id));
		await tenantDb.delete(members).where(eq(members.userId, u[0].id));
		await cpDb.delete(user).where(eq(user.email, placeholderEmail));
	}
	await cpDb
		.update(ghlBranchLinks)
		.set({ isActive: false })
		.where(eq(ghlBranchLinks.ghlLocationId, LOCATION));
	console.log(`cleaned ${contactId} + deactivated ${LOCATION}`);
}

async function main() {
	loadDevVars();
	const cmd = process.argv[2];
	if (cmd === "fire") await fire();
	else if (cmd === "cleanup") await cleanup(process.argv[3] || "");
	else throw new Error("usage: ghl-e2e-inbound.ts fire|cleanup <contactId>");
}
main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
