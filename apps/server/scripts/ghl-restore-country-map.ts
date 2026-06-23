/**
 * Restore organizations.ghlCountryFieldMap by re-discovering each country's
 * existing GHL custom field (the fields persist in GHL; only the map was wiped).
 * Calls ensureCountryFieldExists per country hierarchy node — finds-or-reuses,
 * never duplicates. Prints before/after map size.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { eq } from "drizzle-orm";
import { getControlPanelDb, getTenantDb } from "../src/lib/db";
import { ensureCountryFieldExists } from "../src/services/ghl/branch-sync";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "996febce-aaad-4ded-8f47-02d2b566c8ee";
function loadDevVars() { try { for (const l of readFileSync(join(__dirname,"../.dev.vars"),"utf-8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const e=t.indexOf("=");if(e<0)continue;const k=t.slice(0,e).trim();const v=t.slice(e+1).trim().replace(/^"(.*)"$/,"$1");if(!process.env[k])process.env[k]=v;} } catch {} }

async function main() {
	loadDevVars();
	const cp = getControlPanelDb();
	const tdb = await getTenantDb(ORG);
	const org = await cp.query.organizations.findFirst({ where: eq(organizations.id, ORG) });
	if (!org?.ghlLocationId || !org.ghlApiKeyEncrypted) throw new Error("org not connected");
	const apiKey = decrypt(org.ghlApiKeyEncrypted);
	const before = Object.keys((org.ghlCountryFieldMap as Record<string, unknown>) ?? {}).length;
	console.log(`map size BEFORE: ${before}`);

	const countries = await tdb.select({ id: hierarchyNodes.id, name: hierarchyNodes.name })
		.from(hierarchyNodes).where(eq(hierarchyNodes.type, "country"));
	console.log(`country nodes: ${countries.length}`);

	let ok = 0, fail = 0;
	for (const c of countries) {
		try {
			const r = await ensureCountryFieldExists({
				controlPanelDb: cp,
				organizationId: ORG,
				ghlLocationId: org.ghlLocationId,
				ghlApiKey: apiKey,
				countryNodeId: c.id,
				countryName: c.name,
				initialOption: "—",
			});
			ok++;
			console.log(`  ✓ ${c.name} -> ${r.fieldKey} (${r.ghlFieldId.slice(0,8)}…)`);
		} catch (e) {
			fail++;
			console.log(`  ✗ ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	const after = await cp.query.organizations.findFirst({ where: eq(organizations.id, ORG) });
	const size = Object.keys((after?.ghlCountryFieldMap as Record<string, unknown>) ?? {}).length;
	console.log(`map size AFTER: ${size}  (ok=${ok} fail=${fail})`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
