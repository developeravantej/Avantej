import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { decrypt } from "@avantej-core/db";
import * as cp from "@avantej-core/db/schema/control-panel-schema";
import * as t from "@avantej-core/db/schema/tenant-schema";
import { eq, like, inArray } from "drizzle-orm";
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

const branchLink = await cpDb.query.ghlBranchLinks.findFirst({
	where: eq(cp.ghlBranchLinks.isActive, true),
});
if (!branchLink) throw new Error("no active branch link");
const apiKey = decrypt(branchLink.ghlApiKey);

// Find e2e leftover users by email pattern
const leftoverUsers = await cpDb.query.user.findMany({
	where: like(cp.user.email, "developer.avantej+e2e%@gmail.com"),
});
console.log(`leftover CP users: ${leftoverUsers.length}`);

const userIds = leftoverUsers.map((u) => u.id);
const leftoverMembers =
	userIds.length > 0
		? await tDb.query.members.findMany({
				where: inArray(t.members.userId, userIds),
			})
		: [];
const memberIds = leftoverMembers.map((m) => m.id);
console.log(`leftover tenant members: ${leftoverMembers.length}`);

const leftoverLinks =
	memberIds.length > 0
		? await tDb.query.ghlUserLinks.findMany({
				where: inArray(t.ghlUserLinks.memberId, memberIds),
			})
		: [];
console.log(`leftover ghl_user_links: ${leftoverLinks.length}`);

// GHL DELETE for each
for (const link of leftoverLinks) {
	if (link.syncStatus === "active") {
		try {
			const res = await fetch(
				`https://services.leadconnectorhq.com/users/${link.ghlUserId}`,
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						Version: "2021-07-28",
						Accept: "application/json",
					},
				},
			);
			console.log(`GHL DELETE /users/${link.ghlUserId} -> ${res.status}`);
		} catch (e) {
			console.warn(`GHL DELETE failed for ${link.ghlUserId}:`, e);
		}
	}
}

// DB cleanup
if (memberIds.length > 0) {
	await tDb
		.delete(t.ghlUserLinks)
		.where(inArray(t.ghlUserLinks.memberId, memberIds));
	await tDb.delete(t.members).where(inArray(t.members.id, memberIds));
}
if (userIds.length > 0) {
	await cpDb.delete(cp.user).where(inArray(cp.user.id, userIds));
}
// Wipe any pending e2e invitations
await tDb
	.delete(t.invitations)
	.where(like(t.invitations.email, "developer.avantej+e2e%@gmail.com"));

console.log("cleanup done");
await cpPool.end();
await tPool.end();
