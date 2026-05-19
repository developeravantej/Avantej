import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "fs";
import { decrypt } from "@avantej-core/db/lib/encryption";
neonConfig.webSocketConstructor = ws;
const env = Object.fromEntries(readFileSync(".dev.vars","utf8").split(/\r?\n/).filter(l=>l && !l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")];}));
process.env.ENCRYPTION_KEY = env.ENCRYPTION_KEY!;
const cp = new Pool({ connectionString: env.DATABASE_URL });
const conn = decrypt((await cp.query("SELECT connection_string FROM organizations WHERE slug='test-fitness-franchise'")).rows[0].connection_string);
const t = new Pool({ connectionString: conn });
const q = async (label:string, sql:string) => { try { const r = await t.query(sql); console.log(`\n--- ${label} (${r.rows.length}) ---`); console.log(r.rows.slice(0,5)); } catch (e) { console.log(`\n--- ${label} ERROR --- ${(e as Error).message.slice(0,160)}`); } };

console.log("=========================================");
console.log("LIFECYCLE 3: PACKAGE (purchase→assign→burn→expiry)");
console.log("=========================================");
await q("package_instances summary", `SELECT status, COUNT(*) n FROM package_instances GROUP BY status`);
await q("packages with sessions used > 0", `SELECT id, status, total_sessions, sessions_used, expires_at FROM package_instances WHERE sessions_used > 0 LIMIT 5`);
await q("packages WITHOUT any appointment_clients link", `SELECT pi.id, pi.status, pi.total_sessions, pi.sessions_used FROM package_instances pi LEFT JOIN appointment_clients ac ON ac.package_instance_id = pi.id WHERE pi.status IN ('active','partially_used') AND ac.id IS NULL LIMIT 5`);
await q("expired packages still status=active", `SELECT id, status, expires_at FROM package_instances WHERE status IN ('active','partially_used') AND expires_at < NOW() LIMIT 5`);

console.log("\n=========================================");
console.log("LIFECYCLE 4: APPOINTMENT (book→check-in→complete→commission)");
console.log("=========================================");
await q("appointments by status", `SELECT status, COUNT(*) n FROM appointments GROUP BY status ORDER BY n DESC`);
await q("completed appointments WITHOUT commission_splits", `SELECT a.id, a.start_time, a.status FROM appointments a LEFT JOIN commission_splits cs ON cs.appointment_id=a.id WHERE a.status='completed' AND cs.id IS NULL LIMIT 5`);
await q("check_ins for appointments", `SELECT COUNT(*) total_checkins FROM check_ins`);
await q("appointments completed but no check_in", `SELECT a.id, a.start_time FROM appointments a LEFT JOIN check_ins ci ON ci.appointment_id=a.id WHERE a.status='completed' AND ci.id IS NULL LIMIT 5`);

console.log("\n=========================================");
console.log("LIFECYCLE 5: CANCEL SALE (cancel + category)");
console.log("=========================================");
await q("cancelled sales", `SELECT sales_order_number, status, cancellation_reason, cancellation_reason_category, cancellation_date FROM sales_orders WHERE status='cancelled' LIMIT 5`);
await q("sales with reason text but no category", `SELECT COUNT(*) n FROM sales_orders WHERE cancellation_reason IS NOT NULL AND cancellation_reason_category IS NULL`);

console.log("\n=========================================");
console.log("LIFECYCLE 7: PACKAGE FREEZE/UNFREEZE");
console.log("=========================================");
await q("membership_holds", `SELECT package_instance_id, started_at, ended_at, reason FROM membership_holds LIMIT 5`);
await q("packages frozen but no membership_hold", `SELECT pi.id, pi.status FROM package_instances pi LEFT JOIN membership_holds mh ON mh.package_instance_id = pi.id WHERE pi.status='frozen' AND mh.id IS NULL LIMIT 5`);

console.log("\n=========================================");
console.log("LIFECYCLE 8: WALK-IN customers");
console.log("=========================================");
await q("walk_in_customers", `SELECT id, name, phone, converted_at FROM walk_in_customers LIMIT 5`);
await q("sales tied to walk-in", `SELECT customer_type, COUNT(*) n FROM sales_orders WHERE customer_type='walk_in' GROUP BY customer_type`);

console.log("\n=========================================");
console.log("LIFECYCLE 9: BRANCH QR SELF-SIGNUP");
console.log("=========================================");
await q("branch invites", `SELECT id, kind, uses_count, max_uses, is_active, expires_at FROM invitations WHERE kind='branch_self_signup' LIMIT 5`);
await q("invitation_usages", `SELECT iu.invitation_id, iu.user_id, iu.used_at FROM invitation_usages iu LIMIT 5`);

console.log("\n=========================================");
console.log("LIFECYCLE 11: CLASS SLOTS");
console.log("=========================================");
await q("class_slots", `SELECT COUNT(*) total FROM class_slots`);
await q("class_slot rooms + capacity", `SELECT id, room_id, capacity FROM class_slots LIMIT 3`);

console.log("\n=========================================");
console.log("LIFECYCLE 12: PROMOTIONS");
console.log("=========================================");
await q("promotions", `SELECT id, code, type, status FROM promotions LIMIT 5`);
await q("promotion_usages", `SELECT COUNT(*) usages FROM promotion_usages`);

console.log("\n=========================================");
console.log("LIFECYCLE 13: INSTALLMENT PLANS");
console.log("=========================================");
await q("installment_plans", `SELECT id, code, is_default, num_installments, is_active FROM installment_plans LIMIT 5`);
await q("installments by status", `SELECT status, COUNT(*) n FROM installments GROUP BY status`);

console.log("\n=========================================");
console.log("LIFECYCLE 14: TAX RATES");
console.log("=========================================");
await q("tax_rates", `SELECT name, code, rate_basis_points, is_default, is_active FROM tax_rates LIMIT 5`);
await q("sales_order_items with tax_rate_bps snapshot", `SELECT COUNT(*) FILTER (WHERE tax_rate_bps IS NOT NULL) with_tax, COUNT(*) FILTER (WHERE tax_rate_bps IS NULL) no_tax FROM sales_order_items`);

console.log("\n=========================================");
console.log("LIFECYCLE 15+: BRANCH STATS CACHE");
console.log("=========================================");
await q("branch_stats_cache rows", `SELECT bsc.hierarchy_node_id, hn.name, bsc.members_count, bsc.staff_count, bsc.month_revenue_cents, bsc.computed_at FROM branch_stats_cache bsc JOIN hierarchy_nodes hn ON hn.id = bsc.hierarchy_node_id ORDER BY bsc.computed_at DESC`);

await t.end(); await cp.end();
