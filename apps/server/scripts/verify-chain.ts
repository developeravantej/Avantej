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
const conn = decrypt(
	(
		await cp.query(
			"SELECT connection_string FROM organizations WHERE slug='test-fitness-franchise'",
		)
	).rows[0].connection_string,
);
const t = new Pool({ connectionString: conn });
const q = async (label: string, sql: string) => {
	const r = await t.query(sql);
	console.log(`\n=== ${label} ===`);
	console.log(r.rows);
};
await q(
	"Newly created payout (new fields populated)",
	`SELECT id, recipient_id, amount, gross_amount_cents, deductions_cents, status, description, payout_method, paid_at FROM payouts ORDER BY created_at DESC LIMIT 1`,
);
await q(
	"commission_splits flipped from approved → paid",
	`SELECT COUNT(*) total, COUNT(*) FILTER (WHERE status='paid') paid, COUNT(*) FILTER (WHERE status='approved') still_approved FROM commission_splits`,
);
await q(
	"Audit log captured the batch",
	`SELECT action, COUNT(*) n FROM audit_logs WHERE action LIKE 'payout%' OR action LIKE 'commission%' GROUP BY action ORDER BY n DESC`,
);
await q(
	"Most recent audit entries",
	`SELECT action, entity_type, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 6`,
);
await t.end();
await cp.end();
