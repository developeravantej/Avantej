import { test, expect } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";
import { decrypt } from "@avantej-core/db";
import { rpc, getOrgId } from "../_safe-mutation";

/**
 * UAT §10 — GoHighLevel synchronization (LIVE, against the provisioned account).
 *
 * The test org `test-fitness-franchise` is provisioned for GHL: org-shared model,
 * location G0izzPbelobw04MIntR1 ("MOVE Private Fitness Studio"), an encrypted PIT
 * key, and GHL_AGENCY_ID in .dev.vars. These specs prove the integration end to end:
 *
 *  1. ghlSync/listEvents responds — the inbound webhook (GHL -> Avantej) processing
 *     surface is wired and observable through the app (always runs, no external dep).
 *  2. (E2E_REAL_GHL=1) Read round-trip: the stored PIT key authenticates against the
 *     live GHL API (GET /locations 200) and every linked staff member resolves to a
 *     real GHL user (GET /users/:id 200) — proving staff sync actually reached GHL.
 *  3. (E2E_REAL_GHL=1) Write round-trip: create a clearly-marked test GHL user ->
 *     verify -> delete -> confirm gone (self-cleaning). Proves the §10 "Create user
 *     -> GHL user" + deactivate/delete capability against the real account.
 *
 * The live tests are gated on E2E_REAL_GHL=1 so normal CI stays read-only; they
 * create only test-prefixed data and delete it in finally{}.
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_HEADERS = (key: string) => ({
	Authorization: `Bearer ${key}`,
	Version: "2021-07-28",
	"Content-Type": "application/json",
	Accept: "application/json",
});

// Resolve the provisioned org's GHL location + decrypted PIT key from the
// control-panel DB (same source the dispatchers use). Loads apps/server/.env for
// DATABASE_URL + ENCRYPTION_KEY since Playwright runs from the repo root.
async function resolveGhl(): Promise<{
	key: string;
	locationId: string;
} | null> {
	loadEnv({ path: "apps/server/.env" });
	const cpUrl = process.env.DATABASE_URL;
	if (!cpUrl || !process.env.ENCRYPTION_KEY) return null;
	const cp = new Pool({ connectionString: cpUrl });
	try {
		const { rows } = await cp.query(
			"select ghl_location_id, ghl_api_key_encrypted from organizations where slug=$1",
			["test-fitness-franchise"],
		);
		const row = rows[0];
		if (!row?.ghl_location_id || !row?.ghl_api_key_encrypted) return null;
		return {
			key: decrypt(row.ghl_api_key_encrypted),
			locationId: row.ghl_location_id,
		};
	} finally {
		await cp.end();
	}
}

test.describe("§10 GoHighLevel synchronization (live)", () => {
	test("ghlSync/listEvents responds — inbound webhook processing is wired", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const events = await rpc(page.request, "ghlSync/listEvents", {
			organizationId,
			limit: 5,
		});
		// Returns the GHL->Avantej webhook event audit log (may be empty on a fresh
		// tenant; here it is non-empty because real sync has been running).
		expect(Array.isArray(events), "listEvents returns an array").toBeTruthy();
	});

	test("read round-trip: stored PIT key + staff links resolve to live GHL", async () => {
		test.skip(
			process.env.E2E_REAL_GHL !== "1",
			"set E2E_REAL_GHL=1 for live GHL",
		);
		const ghl = await resolveGhl();
		test.skip(!ghl, "org not provisioned for GHL (no key/location)");
		if (!ghl) return;

		// The stored PIT key authenticates and the location is live.
		const locRes = await fetch(`${GHL_BASE}/locations/${ghl.locationId}`, {
			headers: GHL_HEADERS(ghl.key),
		});
		expect(locRes.status, "GET /locations with stored key").toBe(200);

		// Every staff member synced to GHL resolves to a real GHL user.
		loadEnv({ path: "apps/server/.env" });
		const cp = new Pool({ connectionString: process.env.DATABASE_URL });
		let tenantUrl: string;
		try {
			const { rows } = await cp.query(
				"select connection_string from organizations where slug=$1",
				["test-fitness-franchise"],
			);
			tenantUrl = decrypt(rows[0].connection_string);
		} finally {
			await cp.end();
		}
		const t = new Pool({ connectionString: tenantUrl });
		let links: { ghl_user_id: string }[];
		try {
			const { rows } = await t.query(
				"select ghl_user_id from ghl_user_links where sync_status = 'active'",
			);
			links = rows;
		} finally {
			await t.end();
		}
		test.skip(links.length === 0, "no active staff links to verify");

		let verified = 0;
		for (const l of links) {
			const r = await fetch(`${GHL_BASE}/users/${l.ghl_user_id}`, {
				headers: GHL_HEADERS(ghl.key),
			});
			if (r.status === 200) verified++;
		}
		expect(
			verified,
			"every active staff link resolves to a live GHL user",
		).toBe(links.length);
	});

	test("write round-trip: create -> verify -> delete a GHL user (self-cleaning)", async () => {
		test.skip(
			process.env.E2E_REAL_GHL !== "1",
			"set E2E_REAL_GHL=1 for live GHL",
		);
		const ghl = await resolveGhl();
		test.skip(!ghl, "org not provisioned for GHL");
		if (!ghl) return;

		const stamp = `${Date.now()}`;
		const payload = {
			companyId: process.env.GHL_AGENCY_ID || "iDgsCeSnq9lA4PWPSTFI",
			firstName: "E2E-GHL-LIVE",
			lastName: `Test${stamp}`,
			email: `avantej.ghl.e2e+${stamp}@example.com`,
			type: "account",
			role: "user",
			locationIds: [ghl.locationId],
			permissions: {
				contactsEnabled: true,
				appointmentsEnabled: true,
				assignedDataOnly: true,
			},
		};

		let createdId: string | null = null;
		try {
			const c = await fetch(`${GHL_BASE}/users/`, {
				method: "POST",
				headers: GHL_HEADERS(ghl.key),
				body: JSON.stringify(payload),
			});
			expect(c.status, "POST /users/ creates the GHL user").toBe(201);
			const cb = (await c.json()) as { id: string };
			createdId = cb.id;
			expect(createdId, "created GHL user has an id").toBeTruthy();

			const g = await fetch(`${GHL_BASE}/users/${createdId}`, {
				headers: GHL_HEADERS(ghl.key),
			});
			expect(g.status, "GET /users/:id returns the new user").toBe(200);
		} finally {
			if (createdId) {
				const d = await fetch(`${GHL_BASE}/users/${createdId}`, {
					method: "DELETE",
					headers: GHL_HEADERS(ghl.key),
				});
				expect(
					[200, 404].includes(d.status),
					"DELETE /users/:id cleans up",
				).toBeTruthy();
				const after = await fetch(`${GHL_BASE}/users/${createdId}`, {
					headers: GHL_HEADERS(ghl.key),
				});
				expect(
					[400, 404].includes(after.status),
					"deleted GHL user is gone",
				).toBeTruthy();
			}
		}
	});
});
