/**
 * One-off: replace the stored GHL Private Integration Token for a tenant
 * already on the org-shared sync model. Re-encrypts the supplied token
 * via the standard encryption helper and updates organizations.
 *
 * Usage:
 *   bun run scripts/update-tenant-ghl-token.ts --tenant "<name>" --token "<pit-...>"
 */
import { decrypt, encrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";

neonConfig.webSocketConstructor = ws;

function parseArgs() {
	const a = process.argv.slice(2);
	const ti = a.indexOf("--tenant");
	const to = a.indexOf("--token");
	if (ti === -1 || to === -1 || !a[ti + 1] || !a[to + 1]) {
		console.error(
			'Usage: bun run update-tenant-ghl-token.ts --tenant "<name>" --token "<pit-...>"',
		);
		process.exit(1);
	}
	return { tenant: a[ti + 1]!, token: a[to + 1]! };
}

const { tenant, token } = parseArgs();
const cpUrl = process.env.DATABASE_URL;
if (!cpUrl) throw new Error("DATABASE_URL not set");

const pool = new Pool({ connectionString: cpUrl });
const db = drizzle({ client: pool, schema: controlPanelSchema });

const org = await db.query.organizations.findFirst({
	where: eq(organizations.name, tenant),
});
if (!org) {
	await pool.end();
	throw new Error(`Tenant not found: ${tenant}`);
}
console.log(`\nTenant: ${org.name} (${org.id})`);
console.log(`Sync model: ${org.ghlSyncModel ?? "NULL"}`);
console.log(`Location: ${org.ghlLocationId ?? "—"}`);

const encrypted = encrypt(token);
const roundTrip = decrypt(encrypted);
if (roundTrip !== token) {
	await pool.end();
	throw new Error("Encryption round-trip failed — refusing to write");
}

await db
	.update(organizations)
	.set({ ghlApiKeyEncrypted: encrypted, updatedAt: new Date() })
	.where(eq(organizations.id, org.id));

console.log(
	`\n✅ Updated ghl_api_key_encrypted for ${tenant} (token=${token.slice(0, 8)}…${token.slice(-4)})`,
);
await pool.end();
