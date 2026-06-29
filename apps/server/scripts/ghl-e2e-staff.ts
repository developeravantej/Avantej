/**
 * LIVE staff outbound smoke with a MOCK user (never touches existing GHL users).
 * Creates a throwaway GHL user via syncStaffToGhl(create), reads it back, then
 * deletes it. Prints the ghlUserId + verify result. Cleans up ghl_user_links.
 *
 *   bun run scripts/ghl-e2e-staff.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt } from "@avantej-core/db";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { eq } from "drizzle-orm";
import { getControlPanelDb, getTenantDb } from "../src/lib/db";
import { ghlFetch } from "../src/services/ghl/http-client";
import { syncStaffToGhl } from "../src/services/ghl/sync-staff";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const BRANCH = "732f16af-5e0d-4add-9a0b-03aac652ddbd"; // Bukit Jalil
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
	const ts = process.argv[2] || String(process.pid);
	const cp = getControlPanelDb();
	const tdb = await getTenantDb(ORG);
	const companyId = process.env.GHL_AGENCY_ID || "";
	if (!companyId) throw new Error("GHL_AGENCY_ID not set");

	const mockUserId = `zz-staff-${ts}`;
	const mockUser = {
		id: mockUserId,
		email: `zz-staff-${ts}@example.com`,
		firstName: "ZZ",
		lastName: `StaffTest-${ts}`,
		name: `ZZ StaffTest-${ts}`,
	};
	const mockMember = { role: "staff" as const, status: "active" as const };

	console.log("▶ create mock GHL user …");
	const res = await syncStaffToGhl({
		controlPanelDb: cp,
		tenantDb: tdb,
		organizationId: ORG,
		branchNodeId: BRANCH,
		companyId,
		user: mockUser,
		member: mockMember as never,
		operation: "create",
		decryptApiKey: decrypt,
	});
	console.log("  result:", JSON.stringify(res));
	const ghlUserId = (res as { ghlUserId?: string }).ghlUserId;

	if (ghlUserId) {
		console.log("▶ verify via GET /users/:id …");
		const got = await ghlFetch<{ id?: string; email?: string; name?: string }>({
			method: "GET",
			path: `/users/${ghlUserId}`,
			apiKey: decrypt(
				(await cp.query.organizations.findFirst({
					where: (o, { eq: e }) => e(o.id, ORG),
				}))!.ghlApiKeyEncrypted!,
			),
		}).catch((e) => ({ err: String(e) }) as never);
		console.log("  GHL user:", JSON.stringify(got).slice(0, 200));

		console.log("▶ cleanup: delete mock GHL user + link …");
		await ghlFetch({
			method: "DELETE",
			path: `/users/${ghlUserId}`,
			apiKey: decrypt(
				(await cp.query.organizations.findFirst({
					where: (o, { eq: e }) => e(o.id, ORG),
				}))!.ghlApiKeyEncrypted!,
			),
		}).catch(() => {});
	}
	await tdb.delete(ghlUserLinks).where(eq(ghlUserLinks.userId, mockUserId));
	console.log("  cleaned mock user", mockUserId);
}
main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
