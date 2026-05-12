import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { decrypt } from "@avantej-core/db";
import * as cp from "@avantej-core/db/schema/control-panel-schema";
import { eq } from "drizzle-orm";
import { config } from "dotenv";
config({ path: ".env" });
neonConfig.webSocketConstructor = ws;

const ghlUserId = process.argv[2];
if (!ghlUserId) {
	console.error("usage: bun run verify-ghl-user.ts <ghlUserId>");
	process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle({ client: pool, schema: cp });
const link = await db.query.ghlBranchLinks.findFirst({
	where: eq(cp.ghlBranchLinks.isActive, true),
});
if (!link) throw new Error("no active branch link");
const apiKey = decrypt(link.ghlApiKey);

const res = await fetch(`https://services.leadconnectorhq.com/users/${ghlUserId}`, {
	method: "GET",
	headers: {
		Authorization: `Bearer ${apiKey}`,
		Version: "2021-07-28",
		Accept: "application/json",
	},
});
console.log("status:", res.status);
console.log(await res.text());
await pool.end();
