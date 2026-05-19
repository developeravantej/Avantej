import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "fs";
import { decrypt } from "@avantej-core/db/lib/encryption";
neonConfig.webSocketConstructor = ws;
const env = Object.fromEntries(
  readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g, "")];
  })
);
process.env.ENCRYPTION_KEY = env.ENCRYPTION_KEY!;
const cp = new Pool({ connectionString: env.DATABASE_URL });
const orgs = await cp.query("SELECT id, name, slug, connection_string FROM organizations WHERE slug = 'test-fitness-franchise'");
console.log("org:", orgs.rows[0]?.id, orgs.rows[0]?.name);
const conn = decrypt(orgs.rows[0].connection_string);
const t = new Pool({ connectionString: conn });
const cols = await t.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'hierarchy_nodes' ORDER BY column_name");
console.log("hierarchy_nodes columns:", cols.rows.map((r:any) => r.column_name).join(", "));
const mig = await t.query("SELECT hash FROM drizzle_migrations ORDER BY id DESC LIMIT 12");
console.log("last 12 migrations:", mig.rows.map((r:any) => r.hash));
const bsc = await t.query("SELECT to_regclass('branch_stats_cache') AS exists");
console.log("branch_stats_cache:", bsc.rows[0]?.exists);
await t.end();
await cp.end();
