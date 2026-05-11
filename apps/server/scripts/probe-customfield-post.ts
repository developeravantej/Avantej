/**
 * Probe: POST /locations/{id}/customFields and dump raw response body.
 * Used to diagnose 422 errors from the branch-sync custom-field creation.
 */
import { decrypt } from "@avantej-core/db";
import { Pool } from "@neondatabase/serverless";

const p = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query(
	"SELECT id, name, ghl_location_id, ghl_api_key_encrypted FROM organizations WHERE name = 'Test Fitness Franchise'",
);
await p.end();
const org = r.rows[0];
const apiKey = decrypt(org.ghl_api_key_encrypted);
const locId = org.ghl_location_id;

const body = {
	name: "Select Preferred Branch in Malaysia",
	fieldKey: "malaysia_location",
	dataType: "SINGLE_OPTIONS",
	model: "contact",
	options: ["Sabah - Test Sabah Branch"],
};
console.log("POST body:", JSON.stringify(body, null, 2));

const res = await fetch(
	`https://services.leadconnectorhq.com/locations/${locId}/customFields`,
	{
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: "2021-07-28",
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify(body),
	},
);
console.log(`\nStatus: ${res.status} ${res.statusText}`);
const text = await res.text();
console.log(`Body: ${text}`);
