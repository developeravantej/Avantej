// One-off: bump session_total on a test appointment so Stripe accepts the charge.
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { decrypt } from "@avantej-core/db/lib/encryption";

const orgId = process.argv[2]!;
const apptId = process.argv[3]!;
const cpPool = new Pool({ connectionString: process.env.DATABASE_URL! });
const cpDb = drizzle({ client: cpPool });
const [org] = await cpDb
	.select()
	.from(organizations)
	.where(eq(organizations.id, orgId))
	.limit(1);
const tenantUrl = decrypt(org!.connectionString);
const tp = new Pool({ connectionString: tenantUrl });
const r = await tp.query(
	"UPDATE appointments SET session_total=10000, price_per_client=10000, currency='MYR' WHERE id=$1 RETURNING id, session_total",
	[apptId],
);
console.log("updated:", r.rows);
await tp.end();
await cpPool.end();
