// One-off: print first pending appointment + tenant DB URL for an org.
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { decrypt } from "@avantej-core/db/lib/encryption";

const orgId = process.argv[2]!;
const dbUrl = process.env.DATABASE_URL!;

const cpPool = new Pool({ connectionString: dbUrl });
const cpDb = drizzle({ client: cpPool });
const [org] = await cpDb.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
const tenantUrl = decrypt(org!.connectionString);
console.log("tenant_db:", tenantUrl.replace(/:[^@]+@/, ":***@"));

const tenantPool = new Pool({ connectionString: tenantUrl });
const r = await tenantPool.query(
	"SELECT id, session_total, payment_status FROM appointments WHERE payment_status='pending' LIMIT 3",
);
console.log("appointments:", r.rows);
await tenantPool.end();
await cpPool.end();
