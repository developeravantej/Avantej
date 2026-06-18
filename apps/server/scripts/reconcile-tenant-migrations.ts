#!/usr/bin/env bun
/**
 * Reconcile (heal) a drifted tenant branch's migration state.
 *
 * WHY: A tenant branch can drift so that its schema and its `drizzle_migrations`
 * tracking table disagree — caused by CoW branching from a lagging parent,
 * `db:push`, or a partially-applied migration. In that state the normal
 * `runTenantMigrations` either re-runs a non-idempotent migration (now fixed) or
 * aborts on a benign "already exists" the moment ANY statement's effect is
 * already present. This tool brings the branch to HEAD safely:
 *
 *   - Re-applies EVERY migration in order against the live schema.
 *   - A statement whose effect already exists (benign: "already exists", or a
 *     column/relation a later migration renamed/dropped) is treated as
 *     already-applied → skipped, not fatal.
 *   - A CRITICAL error (type/cast/enum/operator/function — the 0085 class) ABORTS
 *     without marking, so a real problem is never masked. (The migration set is
 *     audit-clean: `bun audit:migrations:strict` → 0 critical.)
 *   - Every successfully-reconciled migration hash is recorded in
 *     drizzle_migrations so subsequent normal runs skip it.
 *
 * SAFETY: mutates the target DB. Prints the (credential-redacted) host and
 * requires --yes to execute. Use --dry-run to preview the tracking diff first.
 *
 * NOTE on data backfills: re-applying re-runs data-migration UPDATEs. The audit
 * proves they don't ERROR on re-run, but on a branch with real data a
 * non-null-guarded backfill could recompute values. Safe for dev/test branches;
 * for a production tenant, snapshot first.
 *
 * USAGE (defaults to TENANT_DATABASE_URL from .dev.vars):
 *   cd apps/server
 *   bun run scripts/reconcile-tenant-migrations.ts --dry-run
 *   bun run scripts/reconcile-tenant-migrations.ts --yes
 *   bun run scripts/reconcile-tenant-migrations.ts --url="postgres://..." --yes
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { TENANT_MIGRATIONS } from "@avantej-core/db/generated/tenant-migrations.generated";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function parseStatements(sql: string): string[] {
	return sql
		.split("--> statement-breakpoint")
		.map((s) => s.trim())
		.filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}

/** Benign = DDL state-mismatch already-applied; not a real failure. */
function isBenign(msg: string): boolean {
	return (
		/already exists/i.test(msg) ||
		/column .* does not exist/i.test(msg) ||
		/relation ".*" does not exist/i.test(msg)
	);
}

function redactHost(url: string): string {
	return url.replace(/(\w+:\/\/)[^@]*@/, "$1***:***@").replace(/\?.*$/, "");
}

const CREATE_TRACKING_SQL = `
CREATE TABLE IF NOT EXISTS drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS drizzle_migrations_hash_idx ON drizzle_migrations(hash);
`;

async function main() {
	loadDevVars();
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const yes = args.includes("--yes");
	const urlArg = args
		.find((a) => a.startsWith("--url="))
		?.slice("--url=".length);
	const url = urlArg ?? process.env.TENANT_DATABASE_URL;

	if (!url) {
		console.error(
			"No DB URL. Set TENANT_DATABASE_URL (.dev.vars) or pass --url=...",
		);
		process.exit(2);
	}

	console.log(`Target: ${redactHost(url)}`);
	console.log(`Mode:   ${dryRun ? "DRY-RUN (no writes)" : "APPLY"}\n`);

	if (!dryRun && !yes) {
		console.error(
			"Refusing to mutate without --yes. Re-run with --dry-run to preview, or --yes to apply.",
		);
		process.exit(2);
	}

	neonConfig.webSocketConstructor = ws;
	const pool = new Pool({ connectionString: url });

	let appliedClean = 0;
	let healed = 0; // applied but had ≥1 benign-skip (drift evidence)
	let alreadyTracked = 0;

	try {
		for (const stmt of CREATE_TRACKING_SQL.split(";")
			.map((s) => s.trim())
			.filter(Boolean)) {
			await pool.query(stmt);
		}

		const trackedRes = await pool.query("SELECT hash FROM drizzle_migrations");
		const tracked = new Set<string>(
			(trackedRes.rows as Array<{ hash: string }>).map((r) => r.hash),
		);

		const missing = TENANT_MIGRATIONS.filter((m) => !tracked.has(m.hash));
		console.log(
			`${TENANT_MIGRATIONS.length} migrations total · ${tracked.size} tracked · ${missing.length} missing from tracking.\n`,
		);

		if (dryRun) {
			if (missing.length === 0) {
				console.log("✅ Tracking is complete — nothing to reconcile.");
			} else {
				console.log(
					"Would reconcile (apply + benign-skip already-present statements):",
				);
				for (const m of missing) console.log(`   • ${m.hash}`);
			}
			return;
		}

		for (const migration of TENANT_MIGRATIONS) {
			if (tracked.has(migration.hash)) {
				alreadyTracked++;
				continue;
			}
			const statements = parseStatements(migration.sql);
			let benignSkips = 0;
			for (let i = 0; i < statements.length; i++) {
				const s = statements[i]!;
				try {
					await pool.query(s);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					if (isBenign(msg)) {
						benignSkips++;
						continue;
					}
					// CRITICAL — do not mask, do not mark applied.
					console.error(
						`\n❌ CRITICAL error reconciling ${migration.hash} [stmt #${i}]:\n   ${msg}\n   ${s.replace(/\s+/g, " ").slice(0, 140)}\n`,
					);
					console.error(
						"Aborting. Investigate this migration (run `bun audit:migrations:strict`).",
					);
					process.exit(1);
				}
			}
			await pool.query(
				"INSERT INTO drizzle_migrations (hash) VALUES ($1) ON CONFLICT (hash) DO NOTHING",
				[migration.hash],
			);
			if (benignSkips > 0) {
				healed++;
				console.log(
					`   ~ ${migration.hash} reconciled (${benignSkips} already-present statement(s) skipped)`,
				);
			} else {
				appliedClean++;
				console.log(`   + ${migration.hash} applied`);
			}
		}

		console.log(
			`\n✅ Reconciled. ${alreadyTracked} already tracked · ${appliedClean} freshly applied · ${healed} healed (had drift).`,
		);
	} finally {
		await pool.end().catch(() => {});
	}
}

main().catch((e) => {
	console.error("Reconcile failed:", e);
	process.exit(2);
});
