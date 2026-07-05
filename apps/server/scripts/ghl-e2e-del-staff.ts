/** Cleanup a test staff created via invite-accept: deletes GHL user + Avantej rows by email. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt } from "@avantej-core/db";
import { account, user as authUser } from "@avantej-core/db/schema/auth";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { getControlPanelDb, getTenantDb } from "../src/lib/db";
import { ghlFetch } from "../src/services/ghl/http-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "996febce-aaad-4ded-8f47-02d2b566c8ee";
function loadDevVars() {
	try {
		for (const l of readFileSync(
			join(__dirname, "../.dev.vars"),
			"utf-8",
		).split("\n")) {
			const t = l.trim();
			if (!t || t.startsWith("#")) continue;
			const e = t.indexOf("=");
			if (e < 0) continue;
			const k = t.slice(0, e).trim();
			const v = t
				.slice(e + 1)
				.trim()
				.replace(/^"(.*)"$/, "$1");
			if (!process.env[k]) process.env[k] = v;
		}
	} catch {}
}

async function main() {
	loadDevVars();
	const email = process.argv[2];
	const cp = getControlPanelDb();
	const tdb = await getTenantDb(ORG);
	const u = await cp
		.select({ id: authUser.id })
		.from(authUser)
		.where(eq(authUser.email, email));
	const uid = u[0]?.id;
	if (uid) {
		// delete real GHL user(s) linked to this member
		const links = await tdb
			.select({ ghlUserId: ghlUserLinks.ghlUserId })
			.from(ghlUserLinks)
			.where(eq(ghlUserLinks.userId, uid));
		const apiKey = decrypt(
			(await cp.query.organizations.findFirst({
				where: eq(organizations.id, ORG),
			}))!.ghlApiKeyEncrypted!,
		);
		for (const l of links) {
			await ghlFetch({
				method: "DELETE",
				path: `/users/${l.ghlUserId}`,
				apiKey,
			}).catch(() => {});
			console.log("deleted GHL user", l.ghlUserId);
		}
		await tdb.delete(ghlUserLinks).where(eq(ghlUserLinks.userId, uid));
		await tdb.delete(members).where(eq(members.userId, uid));
		await cp.delete(account).where(eq(account.userId, uid));
		await cp.delete(authUser).where(eq(authUser.id, uid));
		console.log("deleted Avantej user/member/links", uid);
	}
	await tdb.delete(invitations).where(eq(invitations.email, email));
	console.log("deleted invitation for", email);
}
main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
