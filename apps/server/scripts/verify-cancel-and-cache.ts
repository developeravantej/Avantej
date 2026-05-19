import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "fs";
import { decrypt } from "@avantej-core/db/lib/encryption";
neonConfig.webSocketConstructor = ws;
const env = Object.fromEntries(readFileSync(".dev.vars","utf8").split(/\r?\n/).filter(l=>l && !l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")];}));
process.env.ENCRYPTION_KEY = env.ENCRYPTION_KEY;
const cp = new Pool({ connectionString: env.DATABASE_URL });
const conn = decrypt((await cp.query("SELECT connection_string FROM organizations WHERE slug='test-fitness-franchise'")).rows[0].connection_string);
const t = new Pool({ connectionString: conn });
const q = async (l:string,s:string) => { try { const r = await t.query(s); console.log(`\n=== ${l} ===`); console.log(r.rows.slice(0,5)); } catch(e) { console.log(`\n=== ${l} ===\n${(e as Error).message.slice(0,160)}`); } };

await q("cancelled sale row", `SELECT sales_order_number, status, cancellation_reason, cancellation_reason_category, cancellation_date, cancelled_by FROM sales_orders WHERE status='cancelled' ORDER BY cancellation_date DESC LIMIT 1`);
await q("audit log: sale cancelled", `SELECT action, summary, created_at FROM audit_logs WHERE action LIKE 'sale%' ORDER BY created_at DESC LIMIT 5`);
await q("branch_stats_cache computed_at (should be very recent for the branch of the cancelled sale)", `SELECT bsc.computed_at, hn.name FROM branch_stats_cache bsc JOIN hierarchy_nodes hn ON hn.id=bsc.hierarchy_node_id ORDER BY bsc.computed_at DESC LIMIT 3`);
await q("walk-in customers + sales", `SELECT wc.id, wc.name, wc.converted_at, COUNT(so.id) sale_count FROM walk_in_customers wc LEFT JOIN sales_orders so ON so.walk_in_customer_id=wc.id GROUP BY wc.id, wc.name, wc.converted_at`);

await t.end(); await cp.end();
