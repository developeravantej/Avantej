/**
 * GHL OUTBOUND smoke test (Avantej → GoHighLevel).
 *
 * Proves the outbound integration end-to-end against a REAL GHL location:
 *   1. validateGhlApiKey      — the API key authenticates for the location
 *   2. ensureCustomFieldsExist — required custom fields provision idempotently
 *   3. POST /contacts/         — create a throwaway contact
 *   4. GET  /contacts/:id      — read it back
 *   5. DELETE /contacts/:id    — clean up
 *   6. (optional) POST/DELETE /users/ — staff sync round-trip (needs GHL_AGENCY_ID)
 *
 * This is the Tier-3 "does staging actually talk to GHL" check. Run it once
 * after wiring a sandbox location, before pointing real tenants at it.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 * Real GHL sandbox (makes live API calls — use a THROWAWAY location):
 *   cd apps/server
 *   GHL_SMOKE_LOCATION_ID=<loc> GHL_SMOKE_API_KEY=<key> \
 *     bun run scripts/ghl-smoke-outbound.ts
 *
 *   # include the staff/user round-trip:
 *   GHL_SMOKE_LOCATION_ID=<loc> GHL_SMOKE_API_KEY=<key> GHL_AGENCY_ID=<companyId> \
 *     bun run scripts/ghl-smoke-outbound.ts --with-staff
 *
 * Offline self-test (no creds, no network — exercises the code paths via the
 * built-in MOCK_GHL responder):
 *   cd apps/server
 *   MOCK_GHL=1 NODE_ENV=development bun run scripts/ghl-smoke-outbound.ts --with-staff
 *
 * Reads GHL_SMOKE_* from the environment OR .dev.vars. Never commit real keys.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ghlFetch } from "../src/services/ghl/http-client";
import { ensureCustomFieldsExist, validateGhlApiKey } from "../src/services/ghl/setup";

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
			const value = trimmed.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
			if (!process.env[key]) process.env[key] = value;
		}
	} catch {
		// .dev.vars optional — rely on real env
	}
}

const ok = (msg: string) => console.log(`  ✅ ${msg}`);
const info = (msg: string) => console.log(`  • ${msg}`);
const step = (msg: string) => console.log(`\n▶ ${msg}`);

async function main() {
	loadDevVars();

	const isMock =
		process.env.MOCK_GHL === "1" && process.env.NODE_ENV !== "production";
	const withStaff = process.argv.includes("--with-staff");

	// In mock mode the responder ignores credentials, so fall back to dummy
	// values so the script can run with zero setup.
	const locationId =
		process.env.GHL_SMOKE_LOCATION_ID || (isMock ? "mock_loc_smoke" : "");
	const apiKey = process.env.GHL_SMOKE_API_KEY || (isMock ? "mock_key" : "");
	const companyId =
		process.env.GHL_AGENCY_ID || (isMock ? "mock_company" : "");

	if (!locationId || !apiKey) {
		throw new Error(
			"GHL_SMOKE_LOCATION_ID and GHL_SMOKE_API_KEY are required (or run with MOCK_GHL=1 NODE_ENV=development).",
		);
	}

	console.log(
		`GHL outbound smoke — mode=${isMock ? "MOCK (offline)" : "LIVE"} location=${locationId}`,
	);

	// 1. Validate API key
	step("validateGhlApiKey");
	const valid = await validateGhlApiKey(apiKey, locationId);
	if (!valid) {
		throw new Error(
			"validateGhlApiKey returned false — key/location mismatch or key lacks access.",
		);
	}
	ok("API key authenticates for the location");

	// 2. Ensure custom fields
	step("ensureCustomFieldsExist (idempotent)");
	const fields = await ensureCustomFieldsExist({ apiKey, locationId });
	ok(`custom fields present: ${Object.keys(fields).join(", ") || "(none)"}`);

	// 3. Create throwaway contact
	step("POST /contacts/ (throwaway)");
	const stamp = `${locationId}-${process.pid}`;
	const contactEmail = `avantej-smoke+${stamp}@example.com`;
	const created = await ghlFetch<{ id?: string; contact?: { id?: string } }>({
		method: "POST",
		path: "/contacts/",
		apiKey,
		body: {
			locationId,
			firstName: "Avantej",
			lastName: "Smoke",
			email: contactEmail,
			phone: "+60123456789",
			source: "Avantej Smoke Test",
		},
	});
	const contactId = created.id ?? created.contact?.id;
	if (!contactId) throw new Error("contact create returned no id");
	ok(`created contact ${contactId}`);

	// 4. Read it back (skip in mock — responder doesn't persist)
	if (!isMock) {
		step("GET /contacts/:id");
		const fetched = await ghlFetch<{ contact?: { id?: string } }>({
			method: "GET",
			path: `/contacts/${contactId}`,
			apiKey,
		});
		if (fetched.contact?.id !== contactId) {
			throw new Error("read-back contact id did not match created id");
		}
		ok("read-back matches");
	} else {
		info("skip read-back in mock mode (responder is stateless)");
	}

	// 5. Clean up contact
	step("DELETE /contacts/:id (cleanup)");
	await ghlFetch({ method: "DELETE", path: `/contacts/${contactId}`, apiKey });
	ok("contact deleted");

	// 6. Optional staff/user round-trip
	if (withStaff) {
		if (!companyId) {
			info(
				"skip staff round-trip — GHL_AGENCY_ID (companyId) not set; required for POST /users/",
			);
		} else {
			step("POST /users/ then DELETE (staff round-trip)");
			const user = await ghlFetch<{ id?: string }>({
				method: "POST",
				path: "/users/",
				apiKey,
				body: {
					companyId,
					locationIds: [locationId],
					firstName: "Avantej",
					lastName: "SmokeStaff",
					email: `avantej-smoke-staff+${stamp}@example.com`,
					type: "account",
					role: "user",
				},
			});
			const userId = user.id;
			if (!userId) throw new Error("user create returned no id");
			ok(`created GHL user ${userId}`);
			await ghlFetch({ method: "DELETE", path: `/users/${userId}`, apiKey });
			ok("GHL user deleted");
		}
	}

	console.log(
		`\n✅ Outbound smoke PASSED (${isMock ? "mock" : "live"}). GHL outbound path is reachable.`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(`\n❌ Outbound smoke FAILED: ${e instanceof Error ? e.message : e}`);
		if (e && typeof e === "object" && "body" in e) {
			console.error("   GHL response body:", (e as { body: unknown }).body);
		}
		process.exit(1);
	});
