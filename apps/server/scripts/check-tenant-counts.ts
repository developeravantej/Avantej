import { decrypt } from "@avantej-core/db";
import { getControlPanelDb } from "../src/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { eq } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";

const orgId = process.argv[2] ?? "996febce-aaad-4ded-8f47-02d2b566c8ee";
const cpDb = getControlPanelDb();
const [org] = await cpDb
	.select({ connectionString: organizations.connectionString })
	.from(organizations)
	.where(eq(organizations.id, orgId));

const connStr = decrypt(org!.connectionString);
const pool = new Pool({ connectionString: connStr });
const q = (sql: string) => pool.query(sql).then((r) => r.rows);

console.log("=== PHASE 2 — SCHEMA RELATIONSHIPS ===\n");

// Agent 2.1 — members.roleId
const roleIdNull = await q(
	`SELECT COUNT(*) FROM members WHERE role_id IS NULL`,
);
const roleIdSet = await q(
	`SELECT COUNT(*) FROM members WHERE role_id IS NOT NULL`,
);
console.log(
	"2.1 members.role_id: set=" +
		roleIdSet[0].count +
		" NULL=" +
		roleIdNull[0].count,
);
const orphanRoleId = await q(
	`SELECT COUNT(*) FROM members m WHERE m.role_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = m.role_id)`,
);
console.log("     orphan role_id refs:", orphanRoleId[0].count);

// Agent 2.2 — branch pricing: service_prices + product_prices populated?
const sp = await q(`SELECT COUNT(*) FROM service_prices`);
const pp = await q(`SELECT COUNT(*) FROM product_prices`);
console.log(
	"\n2.2 branch pricing: service_prices=" +
		sp[0].count +
		" product_prices=" +
		pp[0].count,
);

// Agent 2.3 — tax_rate_id on order items
const taxSoi = await q(
	`SELECT COUNT(*) FROM sales_order_items WHERE tax_rate_id IS NOT NULL`,
);
const taxSoiNull = await q(
	`SELECT COUNT(*) FROM sales_order_items WHERE tax_rate_id IS NULL`,
);
const taxPi = await q(
	`SELECT COUNT(*) FROM payment_items WHERE tax_rate_id IS NOT NULL`,
);
const taxPiNull = await q(
	`SELECT COUNT(*) FROM payment_items WHERE tax_rate_id IS NULL`,
);
console.log(
	"\n2.3 tax_rate_id: soi_set=" +
		taxSoi[0].count +
		" soi_null=" +
		taxSoiNull[0].count,
);
console.log(
	"     payment_items: set=" + taxPi[0].count + " null=" + taxPiNull[0].count,
);

// Agent 2.4 — EXCLUDE constraint exists?
const excl = await q(
	`SELECT COUNT(*) FROM pg_constraint WHERE conname LIKE '%appointment%exclude%' OR conname LIKE '%appt%excl%' OR contype='x'`,
);
console.log("\n2.4 EXCLUDE constraints total in DB:", excl[0].count);

// Agent 2.5 — commission config versions
const ccv = await q(`SELECT COUNT(*) FROM category_commission_config_versions`);
const ccvConfigsWithVersionId = await q(
	`SELECT COUNT(*) FROM commission_splits WHERE "configVersionId" IS NOT NULL`,
).catch(() =>
	q(
		`SELECT COUNT(*) FROM commission_splits WHERE config_version_id IS NOT NULL`,
	).catch(() => ({ rows: [{ count: "col_unknown" }] })),
);
console.log(
	"\n2.5 config_versions rows=" +
		ccv[0].count +
		"  splits with configVersionId=" +
		(ccvConfigsWithVersionId as any).rows?.[0]?.count,
);

// Agent 2.7 — status history populated?
const sosh = await q(`SELECT COUNT(*) FROM sales_order_status_history`);
const psh = await q(`SELECT COUNT(*) FROM payment_status_history`);
const pish = await q(`SELECT COUNT(*) FROM package_instance_status_history`);
const apsh = await q(`SELECT COUNT(*) FROM appointment_status_history`);
console.log(
	"\n2.7 status history: so=" +
		sosh[0].count +
		" payment=" +
		psh[0].count +
		" pkg=" +
		pish[0].count +
		" appt=" +
		apsh[0].count,
);

// Agent 2.8 — refund_items
const ri = await q(`SELECT COUNT(*) FROM refund_items`);
const r = await q(`SELECT COUNT(*) FROM refunds`);
console.log("\n2.8 refunds=" + r[0].count + " refund_items=" + ri[0].count);

// Agent 2.9 — commission_split_reversals
const csr = await q(`SELECT COUNT(*) FROM commission_split_reversals`);
console.log("\n2.9 commission_split_reversals:", csr[0].count);

// Agent 2.10 — promotion FK + announcement_scopes
const pu = await q(`SELECT COUNT(*) FROM promotion_usages`);
const puUuid = await q(
	`SELECT data_type FROM information_schema.columns WHERE table_name='promotion_usages' AND column_name='sales_order_id'`,
);
const as_ = await q(`SELECT COUNT(*) FROM announcement_scopes`);
console.log(
	"\n2.10 promotion_usages=" +
		pu[0].count +
		" sales_order_id type=" +
		(puUuid[0]?.data_type || "NOT FOUND"),
);
console.log("      announcement_scopes=" + as_[0].count);

// Agent 2.11 — goods receipts
const gr = await q(`SELECT COUNT(*) FROM goods_receipts`);
const gri = await q(`SELECT COUNT(*) FROM goods_receipt_items`);
console.log(
	"\n2.11 goods_receipts=" +
		gr[0].count +
		" goods_receipt_items=" +
		gri[0].count,
);

console.log("\n=== PHASE 3 — OPERATOR PRIORITY ===\n");

// Agent 3.1 — membership_holds
const mh = await q(`SELECT COUNT(*) FROM membership_holds`);
console.log("3.1 membership_holds:", mh[0].count);

// Agent 3.2 — lead_sources
const ls = await q(`SELECT COUNT(*) FROM lead_sources`);
const lsMembers = await q(
	`SELECT COUNT(*) FROM members WHERE lead_source_id IS NOT NULL`,
).catch(() => ({ rows: [{ count: "col_missing" }] }));
console.log(
	"3.2 lead_sources=" +
		ls[0].count +
		" members.lead_source_id set=" +
		((lsMembers as any).rows?.[0]?.count || "col_missing"),
);

// Agent 3.3 — complimentary tracking
const compCols = await q(
	`SELECT column_name FROM information_schema.columns WHERE table_name='sales_orders' AND column_name IN ('is_complimentary','complimentary_reason','complimentary_approved_by')`,
);
console.log(
	"3.3 comp cols on sales_orders:",
	compCols.map((r: any) => r.column_name).join(", ") || "NONE",
);

// Agent 3.4 — commission caps/floors
const capCols = await q(
	`SELECT column_name FROM information_schema.columns WHERE table_name='commission_splits' AND column_name IN ('cap_applied','floor_applied','excluded')`,
);
console.log(
	"3.4 commission caps cols on commission_splits:",
	capCols.map((r: any) => r.column_name).join(", ") || "NONE",
);
const capConfig = await q(
	`SELECT column_name FROM information_schema.columns WHERE table_name='category_commission_configs' AND column_name IN ('cap_amount','floor_amount','excluded_order_types')`,
);
console.log(
	"     config cap cols:",
	capConfig.map((r: any) => r.column_name).join(", ") || "NONE",
);

// Agent 3.5 — walk-in → customer_profile conversion FK
const wcCols = await q(
	`SELECT column_name FROM information_schema.columns WHERE table_name='walk_in_customers' AND column_name IN ('customer_profile_id','converted_at')`,
);
console.log(
	"3.5 walk_in_customers conv cols:",
	wcCols.map((r: any) => r.column_name).join(", ") || "NONE",
);

// Agent 3.6 — households
const hh = await q(`SELECT COUNT(*) FROM households`);
const hhMembers = await q(
	`SELECT COUNT(*) FROM members WHERE household_id IS NOT NULL`,
).catch(() => ({ rows: [{ count: "col_missing" }] }));
console.log(
	"3.6 households=" +
		hh[0].count +
		" members.household_id set=" +
		((hhMembers as any).rows?.[0]?.count || "col_missing"),
);

await pool.end();
