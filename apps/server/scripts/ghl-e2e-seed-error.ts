/** Seed a ghl_contact_links row to syncStatus='error' (simulate a failed sync) by customer phone. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { eq } from "drizzle-orm";
import { getTenantDb } from "../src/lib/db";

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
	const phone = process.argv[2];
	const tdb = await getTenantDb(ORG);
	const prof = await tdb
		.select({ userId: customerProfiles.userId })
		.from(customerProfiles)
		.where(eq(customerProfiles.phone, phone));
	if (!prof[0]) {
		console.log("no profile for", phone);
		return;
	}
	const r = await tdb
		.update(ghlContactLinks)
		.set({ syncStatus: "error", lastError: "seeded e2e failure" })
		.where(eq(ghlContactLinks.userId, prof[0].userId))
		.returning({
			status: ghlContactLinks.syncStatus,
			branch: ghlContactLinks.branchNodeId,
		});
	console.log("seeded error:", JSON.stringify(r));
}
main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
