#!/usr/bin/env bun
// One-shot backfill: fix existing seed users whose `account.accountId` was set to email
// instead of user id (Better-Auth requires accountId == user.id for credential provider).
// Safe to re-run: no-ops on rows already correct.

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, inArray } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";
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

const SEED_EMAILS = [
	"trainer.deterministic@test.com",
	"staff.deterministic@test.com",
	"e2e.client@test.com",
];

const targets = await db.query.users.findMany({
	where: (u) => inArray(u.email, SEED_EMAILS),
});

for (const u of targets) {
	const accts = await db.query.account.findMany({
		where: (a) => and(eq(a.userId, u.id), eq(a.providerId, "credential")),
	});
	for (const a of accts) {
		if (a.accountId === u.id) {
			console.log(`   OK   ${u.email}: accountId already matches userId`);
			continue;
		}
		await db.update(account).set({ accountId: u.id, updatedAt: new Date() }).where(eq(account.id, a.id));
		console.log(`   FIX  ${u.email}: accountId "${a.accountId}" -> "${u.id}"`);
	}
}

await pool.end();
console.log("\nBackfill complete.");
