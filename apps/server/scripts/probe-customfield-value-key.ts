/**
 * Probe (B3): does the GHL Contacts API set a custom field via `{ id, value }`
 * or `{ id, field_value }`?
 *
 * The codebase sends contact custom fields as `{ id, value }` (payload-builders.ts,
 * types.ts). The official GHL OpenAPI says contact custom-field VALUES must be
 * `{ id | key, field_value }`. If the spec is right, every contact custom-field
 * write (the branch dropdown AND the new designated_* fields) silently no-ops —
 * which matches the EMPTY designated_branch seen in production. A mock cannot
 * catch this (it echoes the body), so this MUST be confirmed against live GHL.
 *
 * What it does (against a REAL, THROWAWAY-safe location):
 *   1. Resolve apiKey + locationId (from DATABASE_URL org row, or env).
 *   2. Pick an existing TEXT custom field (default: gender / designated_country).
 *   3. Create a throwaway contact.
 *   4. PUT  customFields:[{ id, value: "VALUE_KEY_WORKS" }]      → GET back.
 *   5. PUT  customFields:[{ id, field_value: "FIELDVALUE_KEY_WORKS" }] → GET back.
 *   6. Report which key actually persisted on the contact.
 *   7. DELETE the throwaway contact.
 *
 * ── Usage (STAGING only — makes live API calls + creates/deletes a contact) ──
 *   cd apps/server
 *   # via DB org row (decrypts stored key):
 *   DATABASE_URL=<control-panel-url> ORG_NAME="Test Fitness Franchise" \
 *     bun run scripts/probe-customfield-value-key.ts --yes-mutate
 *
 *   # or via explicit creds:
 *   GHL_PROBE_LOCATION_ID=<loc> GHL_PROBE_API_KEY=<key> \
 *     bun run scripts/probe-customfield-value-key.ts --yes-mutate
 *
 *   # optionally target a specific field key:
 *   ... GHL_PROBE_FIELD_KEY=designated_country bun run scripts/probe-customfield-value-key.ts --yes-mutate
 *
 * Without --yes-mutate it prints the plan and exits (no network mutations).
 */

const BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

const args = new Set(process.argv.slice(2));
const willMutate = args.has("--yes-mutate");

async function resolveCreds(): Promise<{ apiKey: string; locationId: string }> {
	const envKey = process.env.GHL_PROBE_API_KEY;
	const envLoc = process.env.GHL_PROBE_LOCATION_ID;
	if (envKey && envLoc) return { apiKey: envKey, locationId: envLoc };

	// Fall back to the control-panel org row (decrypts the stored key).
	const { decrypt } = await import("@avantej-core/db");
	const { Pool } = await import("@neondatabase/serverless");
	const orgName = process.env.ORG_NAME ?? "Test Fitness Franchise";
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const r = await pool.query(
		"SELECT ghl_location_id, ghl_api_key_encrypted FROM organizations WHERE name = $1",
		[orgName],
	);
	await pool.end();
	const org = r.rows[0];
	if (!org?.ghl_location_id || !org?.ghl_api_key_encrypted) {
		throw new Error(
			`No GHL creds. Set GHL_PROBE_API_KEY + GHL_PROBE_LOCATION_ID, or point DATABASE_URL at a control-panel DB with org "${orgName}" connected.`,
		);
	}
	return {
		apiKey: decrypt(org.ghl_api_key_encrypted),
		locationId: org.ghl_location_id,
	};
}

function ghl(apiKey: string) {
	return async (method: string, path: string, body?: unknown) => {
		const res = await fetch(`${BASE}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Version: VERSION,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		const text = await res.text();
		let json: any;
		try {
			json = text ? JSON.parse(text) : null;
		} catch {
			json = text;
		}
		if (!res.ok) {
			throw new Error(
				`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`,
			);
		}
		return json;
	};
}

function readFieldValue(contact: any, fieldId: string): string | null {
	const cf = contact?.contact?.customFields ?? contact?.customFields ?? [];
	for (const f of cf) {
		if (f.id === fieldId) return f.value ?? f.field_value ?? null;
	}
	return null;
}

async function main() {
	const { apiKey, locationId } = await resolveCreds();
	const call = ghl(apiKey);

	// Pick the field to probe.
	const wantKey = process.env.GHL_PROBE_FIELD_KEY ?? "designated_country";
	const fallbackKey = "gender";
	const list = await call("GET", `/locations/${locationId}/customFields`);
	const fields: any[] = list.customFields ?? [];
	const match =
		fields.find(
			(f) => f.fieldKey === wantKey || f.fieldKey === `contact.${wantKey}`,
		) ??
		fields.find(
			(f) =>
				f.fieldKey === fallbackKey || f.fieldKey === `contact.${fallbackKey}`,
		);
	if (!match) {
		throw new Error(
			`No probe field found (looked for "${wantKey}" then "${fallbackKey}"). Existing keys: ${fields.map((f) => f.fieldKey).join(", ")}`,
		);
	}
	const fieldId = match.id as string;

	console.log("── B3 value-key probe ─────────────────────────────");
	console.log(`location:  ${locationId}`);
	console.log(`field:     ${match.fieldKey} (id=${fieldId})`);
	console.log(`mutate:    ${willMutate ? "YES (live)" : "no (dry-run)"}`);
	if (!willMutate) {
		console.log(
			"\nDry run. Re-run with --yes-mutate to create a throwaway contact and test both key shapes.",
		);
		return;
	}

	const email = `b3-probe-${Date.now()}@avantej-probe.invalid`;
	const created = await call("POST", "/contacts/", {
		locationId,
		email,
		firstName: "B3",
		lastName: "Probe",
	});
	const contactId = created?.contact?.id ?? created?.id;
	console.log(`\ncreated throwaway contact: ${contactId} (${email})`);

	try {
		// Shape 1: { id, value }
		await call("PUT", `/contacts/${contactId}`, {
			customFields: [{ id: fieldId, value: "VALUE_KEY_WORKS" }],
		});
		const afterValue = await call("GET", `/contacts/${contactId}`);
		const v1 = readFieldValue(afterValue, fieldId);
		console.log(`\n[shape {id,value}]       persisted = ${JSON.stringify(v1)}`);

		// Shape 2: { id, field_value }
		await call("PUT", `/contacts/${contactId}`, {
			customFields: [{ id: fieldId, field_value: "FIELDVALUE_KEY_WORKS" }],
		});
		const afterFieldValue = await call("GET", `/contacts/${contactId}`);
		const v2 = readFieldValue(afterFieldValue, fieldId);
		console.log(`[shape {id,field_value}] persisted = ${JSON.stringify(v2)}`);

		console.log("\n── VERDICT ─────────────────────────────────────────");
		if (v1 === "VALUE_KEY_WORKS") {
			console.log(
				"✅ `{ id, value }` WORKS — current code is correct. No change needed.",
			);
		} else if (v2 === "FIELDVALUE_KEY_WORKS") {
			console.log(
				"❗ `{ id, field_value }` is REQUIRED — current code's `value` silently no-ops.\n   → flip the key in payload-builders.ts + types.ts (one constant).",
			);
		} else {
			console.log(
				`⚠️ Inconclusive. value→${JSON.stringify(v1)}, field_value→${JSON.stringify(v2)}. Inspect the raw GET output manually.`,
			);
		}
	} finally {
		await call("DELETE", `/contacts/${contactId}`).catch(() => {});
		console.log(`\ncleaned up contact ${contactId}`);
	}
}

main().catch((e) => {
	console.error("probe failed:", e instanceof Error ? e.message : e);
	process.exit(1);
});
