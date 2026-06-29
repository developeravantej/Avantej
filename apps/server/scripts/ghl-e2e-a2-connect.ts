/**
 * A2 e2e: reversible org-shared disconnect → reconnect on the LIVE org.
 * Decrypts the stored key (never printed), signs in as franchisee, then:
 *   getOrgShared (connected) → disconnect → getOrgShared (disconnected)
 *   → connect(loc, key) → getOrgShared (reconnected).
 * Restores the exact prior state.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { eq } from "drizzle-orm";
import { getControlPanelDb } from "../src/lib/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const SRV = "https://avantej-core-server.ngchwanlii-a9c.workers.dev";
const ORIGIN = "https://avantej-core-web.ngchwanlii-a9c.workers.dev";
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
	const cp = getControlPanelDb();
	const org = await cp.query.organizations.findFirst({
		where: eq(organizations.id, ORG),
	});
	if (!org?.ghlApiKeyEncrypted || !org.ghlLocationId)
		throw new Error("org not connected — abort (won't risk it)");
	const apiKey = decrypt(org.ghlApiKeyEncrypted);
	const loc = org.ghlLocationId;

	// sign in (franchisee)
	const si = await fetch(`${SRV}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: ORIGIN },
		body: JSON.stringify({
			email: "franchisee@gmail.com",
			password: "password123",
		}),
	});
	const cookie = (si.headers.get("set-cookie") || "").split(";")[0];
	if (!cookie) throw new Error("no session cookie");
	const rpc = async (path: string, input: Record<string, unknown>) => {
		const r = await fetch(`${SRV}/rpc/${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: ORIGIN, cookie },
			body: JSON.stringify({ json: input }),
		});
		const j = (await r.json().catch(() => ({}))) as {
			json?: Record<string, unknown>;
		};
		return j.json ?? j;
	};
	const status = (s: Record<string, unknown>) =>
		`connected=${!!s.ghlLocationId} hasKey=${s.hasApiKey} fields=${s.countryFieldCount}`;

	console.log(
		"1. before     :",
		status(
			(await rpc("ghl/getOrgShared", { organizationId: ORG })) as Record<
				string,
				unknown
			>,
		),
	);
	console.log(
		"2. disconnect :",
		JSON.stringify(
			await rpc("ghl/disconnectOrgShared", { organizationId: ORG }),
		),
	);
	console.log(
		"3. after disc :",
		status(
			(await rpc("ghl/getOrgShared", { organizationId: ORG })) as Record<
				string,
				unknown
			>,
		),
	);
	console.log(
		"4. reconnect  :",
		JSON.stringify(
			await rpc("ghl/connectOrgShared", {
				organizationId: ORG,
				ghlLocationId: loc,
				ghlApiKey: apiKey,
			}),
		),
	);
	console.log(
		"5. after recon:",
		status(
			(await rpc("ghl/getOrgShared", { organizationId: ORG })) as Record<
				string,
				unknown
			>,
		),
	);
}
main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
