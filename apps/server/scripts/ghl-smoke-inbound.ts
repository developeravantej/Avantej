/**
 * GHL INBOUND smoke test (GoHighLevel → Avantej webhook).
 *
 * Proves the inbound webhook path end-to-end against a RUNNING server + its DB:
 *   1. Upsert a throwaway ghl_branch_links row (smoke location → org + branch)
 *   2. NEGATIVE: POST with a bad signature → expect 401 invalid_signature
 *   3. POSITIVE (--create): POST a signed, phone-only contact webhook →
 *        expect 200, then read ghl_sync_events + ghl_contact_links back from the
 *        tenant DB to PROVE the inbound write happened. Phone-only means the
 *        webhook synthesizes a placeholder email, so NO magic-link email is sent
 *        and the created records are cleaned up by a deterministic key.
 *
 * This is the runnable version of the missing "request → DB" integration test:
 * it exercises the real Hono route, the real signature gate, and the real
 * processGhlWebhook DB writes.
 *
 * ── Prereqs ────────────────────────────────────────────────────────────────────
 *   • The target server must be RUNNING and reachable (local: bun dev:server).
 *   • DATABASE_URL + TENANT connection + ENCRYPTION_KEY available (via .dev.vars)
 *     so the script can read back / clean up the same DB the server writes to.
 *   • GHL_SMOKE_BRANCH_NODE_ID must be a REAL branch hierarchy node id in the
 *     target tenant (the auto-created member attaches to it). Find one via
 *     Drizzle Studio or: SELECT id FROM hierarchy_nodes WHERE type='branch' LIMIT 1;
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   cd apps/server
 *   # negative-only (safe, no records created):
 *   GHL_SMOKE_BRANCH_NODE_ID=<branchNodeId> bun run scripts/ghl-smoke-inbound.ts
 *
 *   # full create round-trip (creates + cleans up records in the target tenant):
 *   GHL_SMOKE_BRANCH_NODE_ID=<branchNodeId> bun run scripts/ghl-smoke-inbound.ts --create
 *
 *   # point at staging instead of localhost:
 *   GHL_SMOKE_BASE_URL=https://<worker> GHL_SMOKE_BRANCH_NODE_ID=<id> \
 *     bun run scripts/ghl-smoke-inbound.ts --create
 *
 * Env (all optional except branch node id for --create):
 *   GHL_SMOKE_BASE_URL        default http://localhost:3020
 *   GHL_SMOKE_ORG_ID          default 996febce-aaad-4ded-8f47-02d2b566c8ee (test org)
 *   GHL_SMOKE_LOCATION_ID     default avantej-smoke-loc
 *   GHL_SMOKE_WEBHOOK_SECRET  default avantej-smoke-secret
 *   GHL_SMOKE_BRANCH_NODE_ID  required for --create
 *
 * Run against a TEST tenant, never production.
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

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eq = trimmed.indexOf("=");
			if (eq === -1) continue;
			const key = trimmed.slice(0, eq).trim();
			const value = trimmed
				.slice(eq + 1)
				.trim()
				.replace(/^"(.*)"$/, "$1");
			if (!process.env[key]) process.env[key] = value;
		}
	} catch {
		// optional
	}
}

const ok = (m: string) => console.log(`  ✅ ${m}`);
const info = (m: string) => console.log(`  • ${m}`);
const step = (m: string) => console.log(`\n▶ ${m}`);

function signGhl(secret: string, rawBody: string): string {
	// Matches verifyGhlWebhookAuth's primary check: sha256(`${secret}.${rawBody}`)
	return createHash("sha256").update(`${secret}.${rawBody}`).digest("hex");
}

async function main() {
	loadDevVars();

	const baseUrl = (
		process.env.GHL_SMOKE_BASE_URL || "http://localhost:3020"
	).replace(/\/$/, "");
	const orgId =
		process.env.GHL_SMOKE_ORG_ID || "996febce-aaad-4ded-8f47-02d2b566c8ee";
	const locationId = process.env.GHL_SMOKE_LOCATION_ID || "avantej-smoke-loc";
	const secret = process.env.GHL_SMOKE_WEBHOOK_SECRET || "avantej-smoke-secret";
	const branchNodeId = process.env.GHL_SMOKE_BRANCH_NODE_ID || "";
	const doCreate = process.argv.includes("--create");
	const url = `${baseUrl}/webhooks/gohighlevel/${locationId}`;

	console.log(
		`GHL inbound smoke — server=${baseUrl} org=${orgId} location=${locationId}`,
	);

	const cpDb = getControlPanelDb();
	const tenantDb = await getTenantDb(orgId);

	// 1. Ensure the smoke branch link exists (idempotent upsert).
	step("ensure ghl_branch_links row");
	if (!branchNodeId) {
		throw new Error(
			"GHL_SMOKE_BRANCH_NODE_ID is required (a real branch hierarchy node id in the tenant).",
		);
	}
	await cpDb
		.insert(ghlBranchLinks)
		.values({
			organizationId: orgId,
			tenantBranchId: branchNodeId,
			ghlLocationId: locationId,
			ghlApiKey: "smoke-unused",
			webhookSecret: secret,
			isActive: true,
		})
		.onConflictDoUpdate({
			target: ghlBranchLinks.ghlLocationId,
			set: {
				webhookSecret: secret,
				isActive: true,
				tenantBranchId: branchNodeId,
			},
		});
	ok(`link active for location ${locationId} → branch ${branchNodeId}`);

	// 2. NEGATIVE: bad signature must be rejected.
	step("POST with BAD signature → expect 401");
	const negBody = JSON.stringify({
		type: "ContactCreate",
		contact: { id: "smoke-neg", phone: "+60100000000" },
		locationId,
	});
	const negRes = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-wh-signature": "sha256=deadbeef",
		},
		body: negBody,
	});
	if (negRes.status !== 401) {
		throw new Error(
			`expected 401 for bad signature, got ${negRes.status}: ${await negRes.text()}`,
		);
	}
	ok("bad signature rejected with 401");

	if (!doCreate) {
		console.log(
			"\n✅ Inbound smoke (negative-only) PASSED. Route + signature gate work.\n   Re-run with --create for the full create round-trip.",
		);
		return;
	}

	// 3. POSITIVE: signed, phone-only contact create.
	//    Phone-only → placeholder email → no magic-link email dispatched.
	const contactId = `avantej-smoke-${process.pid}`;
	const placeholderEmail = buildPlaceholderEmail(contactId);
	step(`POST signed create for contact ${contactId} → expect 200`);
	const body = JSON.stringify({
		type: "ContactCreate",
		locationId,
		contact: {
			id: contactId,
			firstName: "Avantej",
			lastName: "InboundSmoke",
			phone: "+60198887777",
		},
	});
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-wh-signature": signGhl(secret, body),
		},
		body,
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (res.status !== 200 || json.received !== true) {
		throw new Error(
			`expected 200 received:true, got ${res.status}: ${JSON.stringify(json)}`,
		);
	}
	ok(`webhook accepted (status field: ${String(json.status)})`);

	// 4. Read back the durable webhook outputs from the tenant DB.
	step("verify DB writes (ghl_sync_events + ghl_contact_links)");
	const events = await tenantDb
		.select({
			status: ghlSyncEvents.status,
			eventType: ghlSyncEvents.eventType,
		})
		.from(ghlSyncEvents)
		.where(eq(ghlSyncEvents.ghlContactId, contactId));
	if (events.length === 0) {
		throw new Error("no ghl_sync_events row written for the smoke contact");
	}
	ok(`ghl_sync_events row present (status=${events[0]?.status})`);

	const links = await tenantDb
		.select({
			id: ghlContactLinks.id,
			userId: ghlContactLinks.userId,
			cpId: ghlContactLinks.customerProfileId,
		})
		.from(ghlContactLinks)
		.where(eq(ghlContactLinks.ghlContactId, contactId));
	if (links.length > 0) {
		ok(`ghl_contact_links row present (userId=${links[0]?.userId ?? "none"})`);
	} else {
		info("no ghl_contact_links row (contact may have been canonical-skipped)");
	}

	// 5. Cleanup — best effort, keyed by the deterministic smoke contact/email.
	step("cleanup smoke records");
	const linkUserId = links[0]?.userId ?? null;
	const linkCpId = links[0]?.cpId ?? null;
	const cleanups: Array<[string, () => Promise<unknown>]> = [
		[
			"ghl_sync_events",
			() =>
				tenantDb
					.delete(ghlSyncEvents)
					.where(eq(ghlSyncEvents.ghlContactId, contactId)),
		],
		[
			"ghl_contact_links",
			() =>
				tenantDb
					.delete(ghlContactLinks)
					.where(eq(ghlContactLinks.ghlContactId, contactId)),
		],
	];
	if (linkCpId) {
		cleanups.push([
			"customer_profiles",
			() =>
				tenantDb
					.delete(customerProfiles)
					.where(eq(customerProfiles.id, linkCpId)),
		]);
	}
	if (linkUserId) {
		cleanups.push([
			"members",
			() => tenantDb.delete(members).where(eq(members.userId, linkUserId)),
		]);
	}
	cleanups.push([
		"customer_profiles(by placeholder user)",
		async () => {
			const u = await cpDb
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, placeholderEmail));
			const uid = u[0]?.id;
			if (uid) {
				await tenantDb
					.delete(customerProfiles)
					.where(eq(customerProfiles.userId, uid));
				await tenantDb.delete(members).where(eq(members.userId, uid));
			}
		},
	]);
	cleanups.push([
		"control-panel user",
		() => cpDb.delete(user).where(eq(user.email, placeholderEmail)),
	]);

	const residue: string[] = [];
	for (const [name, fn] of cleanups) {
		try {
			await fn();
			info(`cleaned ${name}`);
		} catch (e) {
			residue.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	if (residue.length) {
		console.warn("  ⚠️ residue (manual cleanup may be needed):");
		for (const r of residue) console.warn(`     - ${r}`);
	}

	console.log(
		`\n✅ Inbound smoke (--create) PASSED. Route + signature + processGhlWebhook DB writes verified.`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(
			`\n❌ Inbound smoke FAILED: ${e instanceof Error ? e.message : e}`,
		);
		process.exit(1);
	});
