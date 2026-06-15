import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "fs";
import { decrypt } from "@avantej-core/db/lib/encryption";
neonConfig.webSocketConstructor = ws;
const env = Object.fromEntries(
	readFileSync(".dev.vars", "utf8")
		.split(/\r?\n/)
		.filter((l) => l && !l.startsWith("#"))
		.map((l) => {
			const i = l.indexOf("=");
			return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
		}),
);
process.env.ENCRYPTION_KEY = env.ENCRYPTION_KEY!;
const cp = new Pool({ connectionString: env.DATABASE_URL });
const org = (
	await cp.query(
		"SELECT connection_string FROM organizations WHERE slug='test-fitness-franchise'",
	)
).rows[0];
const t = new Pool({ connectionString: decrypt(org.connection_string) });

const q = async (label: string, sql: string) => {
	try {
		const r = await t.query(sql);
		console.log(`\n=== ${label} ===`);
		console.log(r.rows.slice(0, 8));
	} catch (e) {
		console.log(
			`\n=== ${label} (ERROR) ===\n${(e as Error).message.slice(0, 200)}`,
		);
	}
};

await q(
	"sales_orders summary",
	`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE status='confirmed') confirmed, COUNT(*) FILTER (WHERE status='cancelled') cancelled, SUM(total_amount) FILTER (WHERE status IN ('confirmed','completed')) total_revenue, COUNT(*) FILTER (WHERE refund_status != 'none') with_refund FROM sales_orders`,
);
await q(
	"recent confirmed sale",
	`SELECT id, sales_order_number, customer_name, total_amount, status, refund_status, created_at FROM sales_orders WHERE status='confirmed' ORDER BY created_at DESC LIMIT 3`,
);
await q(
	"sales_order_items per sale",
	`SELECT so.sales_order_number, soi.description, soi.quantity, soi.total_price, soi.tax_rate_bps FROM sales_orders so JOIN sales_order_items soi ON soi.sales_order_id = so.id WHERE so.status='confirmed' ORDER BY so.created_at DESC LIMIT 5`,
);
await q(
	"commission_splits summary",
	`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE status='pending') pending, COUNT(*) FILTER (WHERE status='approved') approved, COUNT(*) FILTER (WHERE status='paid') paid, COUNT(*) FILTER (WHERE status='voided') voided FROM commission_splits`,
);
await q(
	"sales WITHOUT commission splits",
	`SELECT so.id, so.sales_order_number, so.customer_name, so.total_amount FROM sales_orders so LEFT JOIN commission_splits cs ON cs.sales_order_id = so.id WHERE so.status='confirmed' AND cs.id IS NULL ORDER BY so.created_at DESC LIMIT 5`,
);
await q(
	"commissions WITH source",
	`SELECT cs.id, cs.staff_id, cs.status, cs.calculated_amount, cs.earned_at, cs.appointment_id, cs.sales_order_id, cs.package_instance_id FROM commission_splits cs ORDER BY cs.earned_at DESC LIMIT 5`,
);
await q(
	"payouts summary",
	`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE status='pending') pending, COUNT(*) FILTER (WHERE status='paid') paid, SUM(amount) total_amount FROM payouts`,
);
await q(
	"payouts with new fields",
	`SELECT id, recipient_id, amount, gross_amount_cents, deductions_cents, status, description, created_at FROM payouts ORDER BY created_at DESC LIMIT 5`,
);
await q(
	"appointments summary",
	`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE status='completed') completed FROM appointments`,
);
await q(
	"audit_logs by action",
	`SELECT action, COUNT(*) n FROM audit_logs GROUP BY action ORDER BY n DESC LIMIT 15`,
);
await q(
	"refunds chain",
	`SELECT r.id, r.amount_cents, r.status, r.created_at, so.sales_order_number FROM refunds r LEFT JOIN sales_orders so ON so.id = r.sales_order_id ORDER BY r.created_at DESC LIMIT 5`,
);
await q(
	"BROKEN: confirmed sales >RM 100 without ANY commission",
	`SELECT COUNT(*) bad_count FROM sales_orders so WHERE so.status IN ('confirmed','completed') AND so.total_amount > 10000 AND NOT EXISTS (SELECT 1 FROM commission_splits cs WHERE cs.sales_order_id = so.id)`,
);

await t.end();
await cp.end();
