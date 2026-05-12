import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { decrypt } from "@avantej-core/db";
import * as cp from "@avantej-core/db/schema/control-panel-schema";
import { config } from "dotenv";
config({ path: ".env" });
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle({ client: pool, schema: cp });
const links = await db.query.ghlBranchLinks.findMany();
for (const l of links) {
	console.log({
		id: l.id,
		orgId: l.organizationId,
		branchId: l.tenantBranchId,
		locId: l.ghlLocationId,
		active: l.isActive,
		keyPreview: `${decrypt(l.ghlApiKey).slice(0, 12)}...`,
	});
}
console.log(`total: ${links.length}`);
await pool.end();
