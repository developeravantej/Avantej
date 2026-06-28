/** One-off cleanup: delete a test customer (profile+member+CP user) by phone. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { user as authUser } from "@avantej-core/db/schema/auth";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { getControlPanelDb, getTenantDb } from "../src/lib/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "996febce-aaad-4ded-8f47-02d2b566c8ee";
function loadDevVars() { try { for (const l of readFileSync(join(__dirname,"../.dev.vars"),"utf-8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const e=t.indexOf("=");if(e<0)continue;const k=t.slice(0,e).trim();const v=t.slice(e+1).trim().replace(/^"(.*)"$/,"$1");if(!process.env[k])process.env[k]=v;} } catch {} }

async function main() {
	loadDevVars();
	const phone = process.argv[2];
	const tdb = await getTenantDb(ORG);
	const cp = getControlPanelDb();
	const profs = await tdb.select({ id: customerProfiles.id, userId: customerProfiles.userId })
		.from(customerProfiles).where(eq(customerProfiles.phone, phone));
	for (const p of profs) {
		await tdb.delete(customerProfiles).where(eq(customerProfiles.id, p.id));
		await tdb.delete(members).where(eq(members.userId, p.userId));
		await cp.delete(authUser).where(eq(authUser.id, p.userId));
		console.log("deleted profile", p.id, "user", p.userId);
	}
	if (!profs.length) console.log("nothing for", phone);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
