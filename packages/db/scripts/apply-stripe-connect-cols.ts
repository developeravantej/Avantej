import { Pool } from "@neondatabase/serverless";
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(import.meta.dir, "../../../apps/server/.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

const statements = [
	`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" text`,
	`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "stripe_connect_status" text DEFAULT 'pending' NOT NULL`,
	`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "stripe_connect_account_type" text DEFAULT 'franchiser' NOT NULL`,
	`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "stripe_connect_onboarding_completed_at" timestamp`,
];

for (const stmt of statements) {
	console.log("→", stmt);
	await pool.query(stmt);
}

// Add unique constraint + index (idempotent)
try {
	await pool.query(
		`ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_connect_account_id_unique" UNIQUE("stripe_connect_account_id")`,
	);
	console.log("→ added unique constraint");
} catch (e: any) {
	if (e.code === "42710") console.log("→ unique constraint already exists, skipped");
	else throw e;
}

try {
	await pool.query(
		`CREATE INDEX IF NOT EXISTS "organizations_stripe_connect_idx" ON "organizations" ("stripe_connect_account_id")`,
	);
	console.log("→ ensured index");
} catch (e: any) {
	console.log("→ index error:", e.message);
}

// Verify
const cols = await pool.query(
	`SELECT column_name FROM information_schema.columns WHERE table_name = 'organizations' AND column_name LIKE 'stripe_connect%'`,
);
console.log("\nstripe_connect columns now on organizations:");
for (const r of cols.rows) console.log("  ✓", (r as any).column_name);

await pool.end();
