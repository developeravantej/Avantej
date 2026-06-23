/**
 * Live GHL verify + cleanup helper (real account). Reads the org's stored key.
 * Prints NO key. Subcommands:
 *   link-phone <phone>     → find ghl_contact_links + contactId for a customer phone
 *   get-contact <id>       → GET /contacts/:id (verify it exists in real GHL)
 *   del-contact <id>       → DELETE /contacts/:id
 *   link-user <email>      → find ghl_user_links.ghlUserId for a staff email
 *   get-user <id>          → GET /users/:id
 *   del-user <id>          → DELETE /users/:id
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt } from "@avantej-core/db";
import { user as authUser } from "@avantej-core/db/schema/auth";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { eq } from "drizzle-orm";
import { getControlPanelDb, getTenantDb } from "../src/lib/db";
import { ghlFetch } from "../src/services/ghl/http-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "996febce-aaad-4ded-8f47-02d2b566c8ee";

function loadDevVars(): void {
	try {
		for (const line of readFileSync(join(__dirname, "../.dev.vars"), "utf-8").split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#")) continue;
			const eq = t.indexOf("=");
			if (eq === -1) continue;
			const k = t.slice(0, eq).trim();
			const v = t.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
			if (!process.env[k]) process.env[k] = v;
		}
	} catch {}
}

async function key(): Promise<string> {
	const cp = getControlPanelDb();
	const org = await cp.query.organizations.findFirst({ where: eq(organizations.id, ORG) });
	if (!org?.ghlApiKeyEncrypted) throw new Error("no stored GHL key");
	return decrypt(org.ghlApiKeyEncrypted);
}

async function main() {
	loadDevVars();
	const [cmd, arg] = [process.argv[2], process.argv[3]];
	const tdb = await getTenantDb(ORG);

	if (cmd === "link-phone") {
		const profs = await tdb.select({ id: customerProfiles.id, userId: customerProfiles.userId, phone: customerProfiles.phone })
			.from(customerProfiles).where(eq(customerProfiles.phone, arg));
		for (const p of profs) {
			const links = await tdb.select({ contactId: ghlContactLinks.ghlContactId, status: ghlContactLinks.syncStatus })
				.from(ghlContactLinks).where(eq(ghlContactLinks.userId, p.userId));
			console.log(`profile=${p.id} user=${p.userId} phone=${p.phone} links=${JSON.stringify(links)}`);
		}
		if (!profs.length) console.log("no profile for phone", arg);
	} else if (cmd === "mk-contact") {
		// arg = phone; argv[4] = firstName. Creates a real GHL contact (fires GHL workflows).
		const raw = await ghlFetch<{ contact?: { id: string } }>({
			method: "POST",
			path: "/contacts/",
			apiKey: await key(),
			body: { locationId: "G0izzPbelobw04MIntR1", firstName: process.argv[4] || "ZZ", lastName: "InboundReal", phone: arg },
		} as never);
		console.log("created GHL contact:", JSON.stringify((raw as { contact?: { id: string } })?.contact?.id));
	} else if (cmd === "recent") {
		const { ghlSyncEvents } = await import("@avantej-core/db/schema/tenant/ghl-sync-events");
		const { desc } = await import("drizzle-orm");
		const rows = await tdb.select({ status: ghlSyncEvents.status, type: ghlSyncEvents.eventType, cid: ghlSyncEvents.ghlContactId, at: ghlSyncEvents.createdAt })
			.from(ghlSyncEvents).orderBy(desc(ghlSyncEvents.createdAt)).limit(8);
		console.log(JSON.stringify(rows, null, 0));
	} else if (cmd === "events") {
		const { ghlSyncEvents } = await import("@avantej-core/db/schema/tenant/ghl-sync-events");
		const rows = await tdb.select({ status: ghlSyncEvents.status, type: ghlSyncEvents.eventType, cid: ghlSyncEvents.ghlContactId, email: ghlSyncEvents.email, at: ghlSyncEvents.createdAt })
			.from(ghlSyncEvents).where(eq(ghlSyncEvents.ghlContactId, arg));
		console.log(JSON.stringify(rows));
	} else if (cmd === "get-contact") {
		const raw = await ghlFetch<{ contact?: Record<string, unknown> }>({ method: "GET", path: `/contacts/${arg}`, apiKey: await key() }).catch((e) => ({ err: String(e) }) as never);
		const c = (raw as { contact?: Record<string, unknown> })?.contact;
		if (c) console.log(JSON.stringify({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, address1: c.address1, tags: c.tags }));
		else console.log(JSON.stringify(raw)?.slice(0, 300));
	} else if (cmd === "del-contact") {
		await ghlFetch({ method: "DELETE", path: `/contacts/${arg}`, apiKey: await key() });
		console.log("deleted contact", arg);
	} else if (cmd === "link-user") {
		const u = await getControlPanelDb().select({ id: authUser.id }).from(authUser).where(eq(authUser.email, arg));
		if (!u[0]) return console.log("no user for email", arg);
		const links = await tdb.select({ ghlUserId: ghlUserLinks.ghlUserId, status: ghlUserLinks.syncStatus })
			.from(ghlUserLinks).where(eq(ghlUserLinks.userId, u[0].id));
		console.log(`user=${u[0].id} links=${JSON.stringify(links)}`);
	} else if (cmd === "users-find") {
		const raw = await ghlFetch<{ users?: Array<{ id: string; email?: string; name?: string }> }>({ method: "GET", path: `/users/?locationId=G0izzPbelobw04MIntR1`, apiKey: await key() }).catch((e) => ({ err: String(e) }) as never);
		const users = (raw as { users?: Array<{ id: string; email?: string; name?: string }> })?.users ?? [];
		const match = users.filter((u) => (u.email || "").includes(arg) || (u.name || "").includes(arg));
		console.log("matches:", JSON.stringify(match));
	} else if (cmd === "get-user") {
		const raw = await ghlFetch({ method: "GET", path: `/users/${arg}`, apiKey: await key() }).catch((e) => ({ err: String(e) }) as never);
		console.log(JSON.stringify(raw)?.slice(0, 300));
	} else if (cmd === "del-user") {
		await ghlFetch({ method: "DELETE", path: `/users/${arg}`, apiKey: await key() });
		console.log("deleted user", arg);
	} else {
		console.log("usage: link-phone|get-contact|del-contact|link-user|get-user|del-user <arg>");
	}
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
