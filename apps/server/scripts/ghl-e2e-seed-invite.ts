/** Seed a pending staff invitation (mock) → prints TOKEN + EMAIL for the accept flow. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { getTenantDb } from "../src/lib/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const BRANCH = "732f16af-5e0d-4add-9a0b-03aac652ddbd"; // Bukit Jalil
const INVITED_BY = "wZGQSvB1v2xWt3NwcSV0DYvRDQLxldkH"; // franchisee
function loadDevVars() { try { for (const l of readFileSync(join(__dirname,"../.dev.vars"),"utf-8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const e=t.indexOf("=");if(e<0)continue;const k=t.slice(0,e).trim();const v=t.slice(e+1).trim().replace(/^"(.*)"$/,"$1");if(!process.env[k])process.env[k]=v;} } catch {} }

async function main() {
	loadDevVars();
	const ts = process.argv[2] || String(Date.now());
	const tdb = await getTenantDb(ORG);
	const token = `zz-invite-${ts}`;
	const email = `zz-staff-${ts}@example.com`;
	await tdb.insert(invitations).values({
		email,
		invitedBy: INVITED_BY,
		role: "trainer",
		hierarchyScopeId: BRANCH,
		token,
		status: "pending",
		expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
		kind: "staff",
		isActive: true,
	});
	console.log(`TOKEN=${token}`);
	console.log(`EMAIL=${email}`);
	console.log(`ORG=${ORG}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
