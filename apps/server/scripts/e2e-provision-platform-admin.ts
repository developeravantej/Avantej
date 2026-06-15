#!/usr/bin/env bun
/**
 * E2E helper: provision a platform-admin login for the journey suite.
 *
 *   cd apps/server && bun run scripts/e2e-provision-platform-admin.ts
 *
 * Creates (idempotently) developer.avantej@gmail.com:
 *   - a control-panel `user` row (role 'admin' for the Better-Auth admin plugin)
 *   - a `credential` `account` row with a scrypt password ('password123')
 *   - a `platform_admins` super_admin row
 * all sharing the same user id. Safe to re-run.
 */

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import ws from "ws";
import { hashPassword } from "better-auth/crypto";
import * as schema from "@avantej-core/db/schema/control-panel-schema";
import { user, account } from "@avantej-core/db/schema/auth";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(() => {
	const p = join(__dirname, "../.dev.vars");
	const c = readFileSync(p, "utf-8");
	for (const line of c.split("\n")) {
		const m = line.trim().match(/^([^=]+)=(.*)$/);
		if (m?.[1] && m[2] !== undefined && !process.env[m[1]])
			process.env[m[1]] = m[2];
	}
})();

const EMAIL = "developer.avantej@gmail.com";
const PASSWORD = "password123";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle({ client: pool, schema });

const now = new Date();

// 1. user
let u = await db.query.users.findFirst({
	where: (t, { eq: e }) => e(t.email, EMAIL),
});
if (!u) {
	const id = randomUUID();
	await db.insert(user).values({
		id,
		name: "Avantej Developer",
		firstName: "Avantej",
		lastName: "Developer",
		email: EMAIL,
		emailVerified: true,
		role: "admin",
		createdAt: now,
		updatedAt: now,
	} as typeof user.$inferInsert);
	u = await db.query.users.findFirst({
		where: (t, { eq: e }) => e(t.email, EMAIL),
	});
	console.log(`created user ${EMAIL} (${id})`);
} else {
	await db
		.update(user)
		.set({ role: "admin", emailVerified: true, updatedAt: now })
		.where(eq(user.id, u.id));
	console.log(`user ${EMAIL} exists (${u.id}) — ensured role=admin`);
}
const userId = u!.id;

// 2. credential account
const hash = await hashPassword(PASSWORD);
const existingAcct = await db.query.account.findMany({
	where: (a, { eq: e, and }) =>
		and(e(a.userId, userId), e(a.providerId, "credential")),
});
if (existingAcct.length === 0) {
	await db.insert(account).values({
		id: randomUUID(),
		accountId: userId,
		providerId: "credential",
		userId,
		password: hash,
		createdAt: now,
		updatedAt: now,
	} as typeof account.$inferInsert);
	console.log(`created credential account (scrypt hash len ${hash.length})`);
} else {
	await db
		.update(account)
		.set({ password: hash, updatedAt: now })
		.where(eq(account.id, existingAcct[0]!.id));
	console.log(`credential account exists — password reset to '${PASSWORD}'`);
}

// 3. platform_admins super_admin
const existingPa = await db.query.platformAdmins
	?.findFirst?.({ where: (p: any, { eq: e }: any) => e(p.userId, userId) })
	.catch(() => null);
if (!existingPa) {
	await db
		.insert(platformAdmins)
		.values({
			userId,
			role: "super_admin",
		} as typeof platformAdmins.$inferInsert)
		.onConflictDoNothing();
	console.log(`granted super_admin`);
} else {
	console.log(`already a platform admin (${existingPa.role})`);
}

await pool.end();
console.log("\nPlatform admin provisioned:", EMAIL, "/", PASSWORD);
