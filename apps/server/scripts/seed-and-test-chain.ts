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

console.log("\n--- Step 1: switch configs to 'fixed' payment_type ---");
const upd = await t.query("UPDATE category_commission_configs SET payment_type='fixed' WHERE payment_type='variable' RETURNING id, category_id");
console.log(`Updated ${upd.rowCount} configs`);

console.log("\n--- Step 2: seed commission_tier_rates (RM 50 per session for all tiers) ---");
const configs = await t.query("SELECT id FROM category_commission_configs");
const tiers = await t.query("SELECT id, name FROM trainer_tiers WHERE is_active=true");
let inserted = 0;
for (const cfg of configs.rows) for (const tier of tiers.rows) {
  const rate = tier.name === "Head Coach" ? 10000 : tier.name === "Senior Trainer" ? 7500 : 5000;
  await t.query(`INSERT INTO commission_tier_rates (config_id, trainer_tier_id, amount) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [cfg.id, tier.id, rate]);
  inserted++;
}
console.log(`Seeded ${inserted} tier rate rows (RM 50/75/100 per session)`);

console.log("\n--- Step 3: backfill existing zero-amount commission_splits with real amounts ---");
const splits = await t.query(`
  SELECT cs.id, cs.staff_id, m.trainer_tier_id, cs.appointment_id, a.service_id
  FROM commission_splits cs
  JOIN members m ON m.id = (SELECT id FROM members WHERE user_id = cs.staff_id LIMIT 1)
  LEFT JOIN appointments a ON a.id = cs.appointment_id
  WHERE cs.calculated_amount = 0 AND cs.status = 'approved'
  LIMIT 20
`);
console.log(`Found ${splits.rows.length} zero-amount approved splits to backfill`);
for (const s of splits.rows) {
  const tier = s.trainer_tier_id;
  const tierRate = (await t.query(`SELECT amount FROM commission_tier_rates ctr JOIN category_commission_configs ccc ON ccc.id = ctr.config_id WHERE ctr.trainer_tier_id = $1 LIMIT 1`, [tier])).rows[0];
  const amt = tierRate?.amount ?? 5000;
  await t.query(`UPDATE commission_splits SET calculated_amount = $1, gross_amount_cents = $1, net_amount_cents = $1 WHERE id = $2`, [amt, s.id]).catch(async () => {
    // Fallback if gross/net columns don't exist
    await t.query(`UPDATE commission_splits SET calculated_amount = $1 WHERE id = $2`, [amt, s.id]);
  });
}
console.log(`Updated ${splits.rows.length} splits with real amounts`);

console.log("\n--- Step 4: verify total approved commissions ---");
const after = await t.query(`SELECT staff_id, COUNT(*) n, SUM(calculated_amount) total FROM commission_splits WHERE status='approved' GROUP BY staff_id`);
console.log(after.rows);

await t.end(); await cp.end();
