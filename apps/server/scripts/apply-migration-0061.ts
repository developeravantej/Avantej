/**
 * One-off: apply tenant migration 0061 (customer_profile stripe fields) to
 * a single tenant DB. Same pattern as apply-migration-0060.ts.
 */

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { decrypt } from "@avantej-core/db/lib/encryption";

const SQL = `
ALTER TABLE "customer_profiles"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_connect_account_id_snapshot" text,
  ADD COLUMN IF NOT EXISTS "default_payment_method_id" text;

CREATE INDEX IF NOT EXISTS "customer_profiles_stripe_customer_idx"
  ON "customer_profiles" ("stripe_customer_id");
`;

async function main() {
	const orgId = process.argv[2];
	if (!orgId) {
		console.error("Usage: bun run scripts/apply-migration-0061.ts <orgId>");
		process.exit(1);
	}
	const dbUrl = process.env.DATABASE_URL;
	const encKey = process.env.ENCRYPTION_KEY;
	if (!dbUrl || !encKey) {
		console.error("DATABASE_URL + ENCRYPTION_KEY required");
		process.exit(1);
	}

	const cpPool = new Pool({ connectionString: dbUrl });
	const cpDb = drizzle({ client: cpPool });
	const [org] = await cpDb.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
	if (!org) {
		console.error("Org not found:", orgId);
		process.exit(1);
	}
	const tenantUrl = decrypt(org.connectionString);
	console.log(`[apply-0061] org=${org.slug} -> tenant DB`);

	const tenantPool = new Pool({ connectionString: tenantUrl });
	const client = await tenantPool.connect();
	try {
		await client.query(SQL);
		console.log("[apply-0061] applied successfully");
	} finally {
		client.release();
		await tenantPool.end();
		await cpPool.end();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
