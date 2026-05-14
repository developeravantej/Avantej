// Inspect full payment state of one appointment.
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { decrypt } from "@avantej-core/db/lib/encryption";

const orgId = process.argv[2]!;
const apptId = process.argv[3]!;
const cpPool = new Pool({ connectionString: process.env.DATABASE_URL! });
const cpDb = drizzle({ client: cpPool });
const [org] = await cpDb.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
const tenantUrl = decrypt(org!.connectionString, process.env.ENCRYPTION_KEY!);
const tp = new Pool({ connectionString: tenantUrl });
const r = await tp.query(
	`SELECT id, payment_status, paid_at, stripe_payment_intent_id, payment_method_type,
	        currency, session_total, application_fee_amount, payment_link_url, payment_failure_reason,
	        stripe_connect_account_id_snapshot
	 FROM appointments WHERE id=$1`,
	[apptId],
);
console.log(r.rows[0]);
await tp.end();
await cpPool.end();
