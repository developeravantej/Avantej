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

const q = async (label:string, sql:string) => {
  try { const r = await t.query(sql); console.log(`\n=== ${label} (${r.rows.length}) ===`); console.log(r.rows.slice(0,5)); }
  catch (e) { console.log(`\n=== ${label} (ERROR) ===\n${(e as Error).message.slice(0,200)}`); }
};

await q("service_categories", `SELECT id, name FROM service_categories LIMIT 5`);
await q("category_commission_configs", `SELECT id, category_id, payment_type, max_coaches, cap_amount_cents FROM category_commission_configs LIMIT 5`);
await q("commission_coach_slots (weightages)", `SELECT config_id, slot_index, weightage_basis_points FROM commission_coach_slots LIMIT 10`);
await q("commission_condition_rates", `SELECT * FROM commission_condition_rates LIMIT 5`);
await q("services with category", `SELECT s.id, s.name, s.price_cents, s.service_category_id, sc.name AS cat_name FROM services s LEFT JOIN service_categories sc ON sc.id = s.service_category_id LIMIT 10`);
await q("completed appt → service price → commission",
  `SELECT a.id, a.status, ac.client_id, a.service_id, s.name service, s.price_cents, cs.calculated_amount, cs.status cs_status
   FROM appointments a
   JOIN appointment_clients ac ON ac.appointment_id = a.id
   LEFT JOIN services s ON s.id = a.service_id
   LEFT JOIN commission_splits cs ON cs.appointment_id = a.id
   WHERE a.status='completed'
   ORDER BY a.start_time DESC LIMIT 5`);
await q("trainer_tiers", `SELECT id, name, rate_basis_points FROM trainer_tiers LIMIT 5`);
await q("members.trainer_tier_id sample", `SELECT id, role, trainer_tier_id FROM members WHERE role='trainer' LIMIT 5`);

await t.end(); await cp.end();
