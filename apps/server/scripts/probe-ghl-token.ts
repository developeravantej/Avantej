/**
 * One-off probe: validate GHL token by GETting /locations/{id} and
 * /locations/{id}/customFields. Used to diagnose 401s when programmatic
 * sync fails after the token was issued.
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
console.log(
	`Probing GHL with location=${locId}, token=${apiKey.slice(0, 8)}…${apiKey.slice(-4)}`,
);

const get = await fetch(
	`https://services.leadconnectorhq.com/locations/${locId}`,
	{
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: "2021-07-28",
			Accept: "application/json",
		},
	},
);
console.log(`\nGET /locations/${locId} → ${get.status} ${get.statusText}`);
console.log(`Body: ${(await get.text()).slice(0, 200)}`);

const list = await fetch(
	`https://services.leadconnectorhq.com/locations/${locId}/customFields`,
	{
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: "2021-07-28",
			Accept: "application/json",
		},
	},
);
console.log(`\nGET customFields → ${list.status} ${list.statusText}`);
console.log(`Body: ${(await list.text()).slice(0, 300)}`);
