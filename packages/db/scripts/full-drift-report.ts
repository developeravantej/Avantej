import { Pool } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "../../apps/server/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

// 1. List all tables
const tables = await pool.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name
`);
console.log(`=== ${tables.rows.length} tables in DB ===`);

// 2. Check drizzle journal locations
for (const schema of ["drizzle", "public"]) {
	const r = await pool.query(
		`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name LIKE '%migration%'`,
		[schema],
	);
	if (r.rows.length) {
		console.log(
			`migration tables in ${schema}: ${r.rows.map((r: any) => r.table_name).join(", ")}`,
		);
	}
}

// 3. Show organizations columns
const cols = await pool.query(
	`SELECT column_name FROM information_schema.columns WHERE table_name = 'organizations' ORDER BY ordinal_position`,
);
console.log(
	`\norganizations: ${cols.rows.map((r: any) => r.column_name).join(", ")}`,
);

// 4. Check which migration journal exists
try {
	const j = await pool.query(
		`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
	);
	console.log(`\ndrizzle.__drizzle_migrations: ${j.rows.length} entries`);
	for (const r of j.rows)
		console.log(
			"  -",
			(r as any).id,
			(r as any).hash?.slice(0, 12),
			(r as any).created_at,
		);
} catch {
	console.log("\nNo drizzle.__drizzle_migrations table");
}

await pool.end();
