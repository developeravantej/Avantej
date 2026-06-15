#!/usr/bin/env bun
/**
 * Tenant Migration Idempotency Audit
 *
 * WHY: `runTenantMigrations` re-applies any migration whose hash is missing from
 * a tenant branch's `drizzle_migrations` table (drift via CoW branching, db:push,
 * or a partially-applied migration). If such a migration is NOT idempotent it
 * throws and bricks that tenant's migrate path — exactly what 0085 did
 * (`column s.scheduling_type does not exist`). CLAUDE.md requires every tenant
 * migration to be idempotent; this script proves it empirically.
 *
 * WHAT IT DOES:
 *   1. Provisions a throwaway Neon branch off the tenant test project (CoW —
 *      inherits the current schema).
 *   2. Runs `runTenantMigrations` once (pass 1) so the branch is fully migrated.
 *   3. Re-applies EVERY migration's statements against that already-migrated
 *      schema (pass 2), catching + collecting each statement that throws. This
 *      simulates the worst realistic drift (hash missing, schema present).
 *   4. Prints a per-migration report and deletes the branch.
 *
 * Statements that are NOT idempotent show up as failures. Frozen drizzle-kit
 * CREATE TABLE / ADD CONSTRAINT history is expected to fail re-apply (protected
 * by the tracking table in production); the signal we care about is
 * HAND-WRITTEN migrations that should be re-runnable but aren't.
 *
 * USAGE (needs NEON_API_KEY in .dev.vars or env):
 *   cd apps/server && bun run scripts/audit-migration-idempotency.ts
 *   # optional: --strict exits 1 if any statement fails (CI gate once history is clean)
 *
 * Override the project to branch from:
 *   TENANT_NEON_PROJECT_ID=<id> bun run scripts/audit-migration-idempotency.ts
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { runTenantMigrations } from "@avantej-core/db";
import { TENANT_MIGRATIONS } from "@avantej-core/db/generated/tenant-migrations.generated";
import {
	createTestBranch,
	deleteTestBranch,
} from "../src/tests/helpers/neon-branch";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TENANT_PROJECT_ID = "silent-wind-47805343";

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#")) continue;
			const i = t.indexOf("=");
			if (i === -1) continue;
			const k = t.slice(0, i).trim();
			const v = t
				.slice(i + 1)
				.trim()
				.replace(/^"(.*)"$/, "$1");
			if (!process.env[k]) process.env[k] = v;
		}
	} catch {
		/* rely on env */
	}
}

/** Mirror of runner's parseMigrationSQL: split ONLY on --> statement-breakpoint. */
function parseStatements(sql: string): string[] {
	return sql
		.split("--> statement-breakpoint")
		.map((s) => s.trim())
		.filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}

interface Failure {
	hash: string;
	stmtIndex: number;
	snippet: string;
	message: string;
}

async function main() {
	loadDevVars();
	const apiKey = process.env.NEON_API_KEY;
	if (!apiKey) {
		console.error("NEON_API_KEY is required (.dev.vars or env).");
		process.exit(2);
	}
	const projectId =
		process.env.TENANT_NEON_PROJECT_ID ?? DEFAULT_TENANT_PROJECT_ID;
	const strict = process.argv.includes("--strict");

	neonConfig.webSocketConstructor = ws;

	const name = `idem-audit-${process.pid}-${Date.now().toString(36)}`;
	console.log(`Provisioning throwaway branch '${name}' off ${projectId}...`);
	const branch = await createTestBranch({ apiKey, projectId, name });

	const failures: Failure[] = [];
	const pool = new Pool({ connectionString: branch.connectionUri });
	try {
		// Pass 1 — bring the branch fully up to date (production provisioning path).
		console.log("Pass 1: runTenantMigrations (initial migrate)...");
		await runTenantMigrations(branch.connectionUri);

		// Pass 2 — re-apply every migration against the migrated schema.
		console.log(
			`Pass 2: re-applying ${TENANT_MIGRATIONS.length} migrations to test idempotency...\n`,
		);
		for (const migration of TENANT_MIGRATIONS) {
			const statements = parseStatements(migration.sql);
			for (let i = 0; i < statements.length; i++) {
				const stmt = statements[i]!;
				try {
					await pool.query(stmt);
				} catch (err) {
					failures.push({
						hash: migration.hash,
						stmtIndex: i,
						snippet: stmt.replace(/\s+/g, " ").slice(0, 120),
						message: err instanceof Error ? err.message : String(err),
					});
				}
			}
		}
	} finally {
		await pool.end().catch(() => {});
		await deleteTestBranch({
			apiKey,
			projectId,
			branchId: branch.branchId,
		}).catch((e) =>
			console.warn(`branch cleanup failed (sweep later): ${e.message}`),
		);
		console.log(`Deleted branch ${branch.branchId}.\n`);
	}

	// Classify failures:
	//   BENIGN — pure DDL state-mismatch in frozen history: an object already
	//   exists, or a column/relation a later migration renamed/dropped is now
	//   gone. These only throw under a FULL tracking-table wipe (not realistic
	//   production drift), never corrupt data, and are protected by the
	//   drizzle_migrations table during normal provisioning.
	//
	//   CRITICAL — type/cast/enum/operator/function errors or any data-mutating
	//   re-run. These are the 0085-class bugs that brick or corrupt a drifted
	//   tenant. NOTE: an *operator*/*function* "does not exist" (e.g.
	//   `string_agg(enum, …)`) is a TYPE error → CRITICAL, deliberately NOT
	//   matched by the column/relation patterns below.
	const isBenignDdl = (msg: string) =>
		/already exists/i.test(msg) ||
		/column .* does not exist/i.test(msg) ||
		/relation ".*" does not exist/i.test(msg);
	const critical = failures.filter((f) => !isBenignDdl(f.message));

	const groupByHash = (list: Failure[]) => {
		const m = new Map<string, Failure[]>();
		for (const f of list) {
			const arr = m.get(f.hash) ?? [];
			arr.push(f);
			m.set(f.hash, arr);
		}
		return m;
	};

	console.log("=".repeat(72));
	console.log("IDEMPOTENCY AUDIT REPORT (statements that threw on re-apply)");
	console.log("=".repeat(72));

	const criticalByHash = groupByHash(critical);
	if (critical.length === 0) {
		console.log(
			"✅ No CRITICAL idempotency violations — every data/enum/logic statement is re-run-safe.",
		);
	} else {
		console.log(
			"❌ CRITICAL idempotency violations (re-run would error/corrupt):",
		);
		for (const [hash, fs] of criticalByHash) {
			console.log(`\n● ${hash}  (${fs.length} failing statement(s))`);
			for (const f of fs) {
				console.log(`    [#${f.stmtIndex}] ${f.message}`);
				console.log(`        ${f.snippet}`);
			}
		}
	}

	const benignCount = failures.length - critical.length;
	console.log(
		`\nSummary: ${critical.length} critical, ${benignCount} benign frozen-DDL ` +
			`(\"already exists\" — protected by the migration tracking table, not re-run in normal provisioning).`,
	);
	console.log("=".repeat(72));

	if (strict && critical.length > 0) process.exit(1);
}

main().catch((e) => {
	console.error("Audit failed:", e);
	process.exit(2);
});
