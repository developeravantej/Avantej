import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { decrypt } from "@avantej-core/db";
import * as cp from "@avantej-core/db/schema/control-panel-schema";
import * as t from "@avantej-core/db/schema/tenant-schema";
import { eq } from "drizzle-orm";
import { config } from "dotenv";
config({ path: ".env" });
neonConfig.webSocketConstructor = ws;

const cpPool = new Pool({ connectionString: process.env.DATABASE_URL! });
const cpDb = drizzle({ client: cpPool, schema: cp });

const org = await cpDb.query.organizations.findFirst();
if (!org) throw new Error("no org");
const tenantUrl = decrypt(org.connectionString);

const tPool = new Pool({ connectionString: tenantUrl });
const tDb = drizzle({ client: tPool, schema: t });

const links = await tDb.query.ghlUserLinks.findMany();
console.log("ghl_user_links rows:", links.length);
for (const l of links) {
	const member = await tDb.query.members.findFirst({
		where: eq(t.members.id, l.memberId),
	});
	const u = member
		? await cpDb.query.user.findFirst({
				where: eq(cp.user.id, member.userId),
			})
		: null;
	console.log({
		ghlUserId: l.ghlUserId,
		syncStatus: l.syncStatus,
		memberRole: member?.role,
		userEmail: u?.email,
		userName: u?.name,
		userId: u?.id,
		memberId: l.memberId,
	});
}
await cpPool.end();
await tPool.end();
