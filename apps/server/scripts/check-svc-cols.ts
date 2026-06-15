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
const list = async (tbl: string) => {
	const r = await t.query(
		`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
		[tbl],
	);
	console.log(`\n=== ${tbl} ===`);
	console.log(r.rows.map((r: any) => r.column_name).join(", "));
};
for (const tbl of [
	"services",
	"trainer_tiers",
	"appointments",
	"commission_splits",
	"category_commission_configs",
])
	await list(tbl);

const r = await t.query(
	`SELECT a.id, a.status, a.start_time, s.name svc, s.price, cs.calculated_amount, cs.status cs_status FROM appointments a LEFT JOIN services s ON s.id = a.service_id LEFT JOIN commission_splits cs ON cs.appointment_id = a.id WHERE a.status='completed' ORDER BY a.start_time DESC LIMIT 5`,
);
console.log("\n=== completed appts with prices + commission ===");
console.log(r.rows);

await t.end();
await cp.end();
