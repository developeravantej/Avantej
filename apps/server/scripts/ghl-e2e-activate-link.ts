/** Set a ghl_branch_links row active/inactive by location id. arg2 = location, arg3 = true|false */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { eq } from "drizzle-orm";
import { getControlPanelDb } from "../src/lib/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadDevVars() { try { for (const l of readFileSync(join(__dirname,"../.dev.vars"),"utf-8").split("\n")){const t=l.trim();if(!t||t.startsWith("#"))continue;const e=t.indexOf("=");if(e<0)continue;const k=t.slice(0,e).trim();const v=t.slice(e+1).trim().replace(/^"(.*)"$/,"$1");if(!process.env[k])process.env[k]=v;} } catch {} }

async function main() {
	loadDevVars();
	const loc = process.argv[2];
	const active = process.argv[3] !== "false";
	const cp = getControlPanelDb();
	const r = await cp.update(ghlBranchLinks).set({ isActive: active }).where(eq(ghlBranchLinks.ghlLocationId, loc)).returning({ loc: ghlBranchLinks.ghlLocationId, active: ghlBranchLinks.isActive });
	console.log("set:", JSON.stringify(r));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
