#!/usr/bin/env bun
/**
 * Rehash a user's credential password using Better-Auth's scrypt algorithm.
 *
 * WHY: Some seed/bootstrap paths wrote bcrypt hashes into account.password.
 * Better-Auth verifies with scrypt, so those accounts throw
 * `BetterAuthError: Invalid password hash` on every sign-in → the server
 * returns 500 and the browser surfaces it as a (misleading) CORS error.
 *
 * This script finds the user by email, locates their `credential` provider
 * account(s), and overwrites the password with a valid scrypt hash.
 * Idempotent — safe to re-run.
 *
 * TARGET DATABASE = whatever DATABASE_URL resolves to. To fix PRODUCTION,
 * pass the production control-panel connection string explicitly:
 *
 *   # PowerShell
 *   $env:DATABASE_URL="postgres://...prod-control-panel..."; `
 *     bun run scripts/fix-auth-password-scrypt.ts
 *
 *   # bash
 *   DATABASE_URL="postgres://...prod-control-panel..." \
 *     bun run scripts/fix-auth-password-scrypt.ts
 *
 * If DATABASE_URL is already set in the environment it is used as-is; otherwise
 * the script falls back to apps/server/.dev.vars (which points at the DEV DB).
 *
 * Override the accounts to fix via CLI args of the form email=password:
 *   bun run scripts/fix-auth-password-scrypt.ts foo@bar.com=secret123
 */

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";
import { hashPassword } from "better-auth/crypto";
import * as schema from "@avantej-core/db/schema/control-panel-schema";
import { account } from "@avantej-core/db/schema/auth";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Only fall back to .dev.vars when DATABASE_URL is NOT already in the env, so
// an explicit prod connection string passed on the command line always wins.
if (!process.env.DATABASE_URL) {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const m = line.trim().match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
				process.env[m[1]] = m[2];
			}
		}
	} catch {
		// no .dev.vars — rely on the environment
	}
}

if (!process.env.DATABASE_URL) {
	console.error("DATABASE_URL is required (env or .dev.vars).");
	process.exit(1);
}

// Canonical credentials from CLAUDE.md (override via CLI args email=password).
const DEFAULTS: { email: string; password: string }[] = [
	{ email: "developer.avantej@gmail.com", password: "password1234" },
	{ email: "franchisee@gmail.com", password: "password123" },
];

const cliPairs = process.argv
	.slice(2)
	.map((arg) => {
		const idx = arg.indexOf("=");
		if (idx <= 0) return null;
		return { email: arg.slice(0, idx).trim(), password: arg.slice(idx + 1) };
	})
	.filter((x): x is { email: string; password: string } => x !== null);

const targets = cliPairs.length > 0 ? cliPairs : DEFAULTS;

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });

console.log(
	`Rehashing ${targets.length} account(s) to scrypt against the configured control-panel DB...\n`,
);

let fixed = 0;
let missing = 0;
for (const t of targets) {
	const u = await db.query.users.findFirst({
		where: (tbl, { eq: e }) => e(tbl.email, t.email),
	});
	if (!u) {
		console.log(`   MISS ${t.email}: no user row`);
		missing++;
		continue;
	}
	const accts = await db.query.account.findMany({
		where: (a) => and(eq(a.userId, u.id), eq(a.providerId, "credential")),
	});
	if (accts.length === 0) {
		console.log(`   MISS ${t.email}: no credential account (social-only?)`);
		missing++;
		continue;
	}
	for (const a of accts) {
		const hash = await hashPassword(t.password);
		await db
			.update(account)
			.set({ password: hash, updatedAt: new Date() })
			.where(eq(account.id, a.id));
		console.log(`   FIX  ${t.email}: scrypt hash written (len ${hash.length})`);
		fixed++;
	}
}

await pool.end();
console.log(`\nDone. fixed=${fixed} missing=${missing}.`);
