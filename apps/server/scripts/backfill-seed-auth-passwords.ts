#!/usr/bin/env bun
// One-shot backfill: rehash seed users' passwords using Better-Auth's scrypt algorithm.
// The original seed used bcrypt, which is incompatible with Better-Auth verifyPassword.
// Safe to re-run.

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";
import { hashPassword } from "better-auth/crypto";
import * as schema from "@avantej-core/db/schema/control-panel-schema";
import { account } from "@avantej-core/db/schema/auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(() => {
	const p = join(__dirname, "../.dev.vars");
	const c = readFileSync(p, "utf-8");
	for (const line of c.split("\n")) {
		const m = line.trim().match(/^([^=]+)=(.*)$/);
		if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) process.env[m[1]] = m[2];
	}
})();

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle({ client: pool, schema });

const SEED = [
	{ email: "trainer.deterministic@test.com", password: "password123" },
	{ email: "staff.deterministic@test.com", password: "password123" },
	{ email: "e2e.client@test.com", password: "password123" },
	{ email: "coach.alex@example.com", password: "password123" },
	{ email: "maya.trainer@example.com", password: "password123" },
	{ email: "daniel.fit@example.com", password: "password123" },
];

for (const s of SEED) {
	const u = await db.query.users.findFirst({ where: (t, { eq: e }) => e(t.email, s.email) });
	if (!u) {
		console.log(`   MISS ${s.email}: no user row`);
		continue;
	}
	const accts = await db.query.account.findMany({ where: (a) => and(eq(a.userId, u.id), eq(a.providerId, "credential")) });
	for (const a of accts) {
		const hash = await hashPassword(s.password);
		await db.update(account).set({ password: hash, updatedAt: new Date() }).where(eq(account.id, a.id));
		console.log(`   FIX  ${s.email}: scrypt hash written (len ${hash.length})`);
	}
}

await pool.end();
console.log("\nPassword backfill complete.");
