import { Pool } from "@neondatabase/serverless";
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({
	path: path.resolve(import.meta.dir, "../../../apps/server/.env"),
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const r = await pool.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'organizations' ORDER BY ordinal_position
`);
console.log("organizations columns:");
for (const row of r.rows) console.log(" -", (row as any).column_name);
const j = await pool.query(`SELECT * FROM __drizzle_migrations ORDER BY id`);
console.log("\n__drizzle_migrations:");
for (const row of j.rows) console.log(" -", row);
await pool.end();
