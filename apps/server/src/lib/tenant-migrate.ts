/**
 * File-based tenant migration loader (Node-only).
 *
 * Reads SQL files from `packages/db/src/migrations/tenant/*.sql`, computes
 * SHA-256 checksums, and applies pending migrations against a Neon Pool.
 *
 * Used by:
 *  - Drift detection script (`scripts/check-drift.ts`)
 *  - Integration tests (`apps/server/src/tests/integration/tenant-migrate.test.ts`)
 *  - Future tenant provisioning gate (Node contexts only)
 *
 * Cloudflare Workers compatibility: NOT directly usable from Workers because
 * `readFileSync` is not available at the Workers runtime. Worker code paths
 * must continue to use `runTenantMigrations` from `@avantej-core/db/migrate-tenant`,
 * which embeds SQL as constants. See zplan/05-06_09-12_schema-relationship-fixes/
 * execute/log.md for the rationale behind the hybrid approach.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export type MigrationFile = {
	/** Filename without `.sql` extension. e.g. `0020_add_coach_intake_tables` */
	name: string;
	/** Raw SQL content. */
	sql: string;
	/** SHA-256 checksum of the SQL content (hex). */
	checksum: string;
};

/**
 * Default location of tenant migration files relative to monorepo root.
 * Resolved from this file's location: apps/server/src/lib/tenant-migrate.ts
 *  → ../../../../packages/db/src/migrations/tenant
 */
function defaultMigrationsDir(): string {
	return resolve(__dirname, "../../../../packages/db/src/migrations/tenant");
}

/**
 * Load all `*.sql` migration files from the tenant migrations directory,
 * sorted by filename prefix (lexicographic; relies on the `0000_`, `0001_` ... naming convention).
 */
export function loadMigrationFiles(dir?: string): MigrationFile[] {
	const dirPath = dir ?? defaultMigrationsDir();
	const entries = readdirSync(dirPath, { withFileTypes: true });
	const files = entries
		.filter((e) => e.isFile() && e.name.endsWith(".sql"))
		.map((e) => e.name)
		.sort();

	return files.map((filename) => {
		const sql = readFileSync(join(dirPath, filename), "utf-8");
		const checksum = createHash("sha256").update(sql).digest("hex");
		return {
			name: filename.replace(/\.sql$/, ""),
			sql,
			checksum,
		};
	});
}

/**
 * Parse a migration SQL file into individual executable statements.
 * Drizzle uses `--> statement-breakpoint` as the separator.
 */
export function parseMigrationSQL(sql: string): string[] {
	return sql
		.split("--> statement-breakpoint")
		.map((stmt) => stmt.trim())
		.filter((stmt) => {
			const cleaned = stmt.replace(/--.*$/gm, "").trim();
			return cleaned.length > 0;
		});
}

/**
 * Ensure the `drizzle_migrations` tracking table exists.
 * Schema matches the historical embedded migrator for backward compatibility.
 * The 0021 migration file augments this table with `checksum` and `applied_at`.
 */
export async function ensureMigrationTable(pool: Pool): Promise<void> {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS drizzle_migrations (
			id SERIAL PRIMARY KEY,
			hash TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		)
	`);
	await pool.query(
		"CREATE UNIQUE INDEX IF NOT EXISTS drizzle_migrations_hash_idx ON drizzle_migrations(hash)",
	);
	// Augment with the metadata columns added by 0021. Using ADD COLUMN IF NOT
	// EXISTS so this is idempotent against tenants that pre-date 0021.
	await pool.query(
		`ALTER TABLE drizzle_migrations ADD COLUMN IF NOT EXISTS checksum text`,
	);
	await pool.query(
		`ALTER TABLE drizzle_migrations ADD COLUMN IF NOT EXISTS applied_at timestamptz NOT NULL DEFAULT now()`,
	);
}

/**
 * Read the set of already-applied migration hashes.
 */
export async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
	const result = (await pool.query(
		"SELECT hash FROM drizzle_migrations",
	)) as { rows: Array<{ hash: string }> };
	return new Set(result.rows.map((r) => r.hash));
}

/**
 * Backward-compat: tenants provisioned before the 0002 split-merge had
 * "0002_rbac_tables" + "0003_add_branch_fields" applied separately. The
 * later embedded-and-file migration "0002_calm_martin_li" is functionally
 * equivalent. If both legacy hashes are present, mark the merged hash as
 * applied without re-executing.
 */
async function backfillCalmMartinLi(
	pool: Pool,
	applied: Set<string>,
	checksum: string,
): Promise<boolean> {
	if (applied.has("0002_calm_martin_li")) return false;
	if (
		applied.has("0002_rbac_tables") &&
		applied.has("0003_add_branch_fields")
	) {
		await pool.query(
			"INSERT INTO drizzle_migrations (hash, checksum) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING",
			["0002_calm_martin_li", checksum],
		);
		applied.add("0002_calm_martin_li");
		return true;
	}
	return false;
}

/**
 * Apply all pending migrations from `files` against `pool`.
 * Each migration runs inside a transaction (BEGIN/COMMIT).
 *
 * Returns the names of migrations that were applied during this run.
 */
export async function applyPending(
	pool: Pool,
	files: MigrationFile[],
): Promise<string[]> {
	await ensureMigrationTable(pool);
	const applied = await getAppliedMigrations(pool);
	const ranNow: string[] = [];

	for (const file of files) {
		// Special-case backward-compat for 0002_calm_martin_li
		if (file.name === "0002_calm_martin_li") {
			const backfilled = await backfillCalmMartinLi(pool, applied, file.checksum);
			if (backfilled) continue;
		}

		if (applied.has(file.name)) continue;

		const statements = parseMigrationSQL(file.sql);

		// Run all statements + the tracking insert in a single transaction.
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			for (const stmt of statements) {
				await client.query(stmt);
			}
			await client.query(
				"INSERT INTO drizzle_migrations (hash, checksum) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING",
				[file.name, file.checksum],
			);
			await client.query("COMMIT");
		} catch (err) {
			await client.query("ROLLBACK").catch(() => {});
			throw new Error(
				`Migration ${file.name} failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			client.release();
		}

		applied.add(file.name);
		ranNow.push(file.name);
	}

	return ranNow;
}

/**
 * Wait until the latest known migration is recorded as applied.
 * Useful for tests that race against another process running migrations.
 */
export async function waitForLatest(
	pool: Pool,
	files: MigrationFile[],
	timeoutMs = 30_000,
): Promise<void> {
	if (files.length === 0) return;
	const latest = files[files.length - 1]!.name;
	const startedAt = Date.now();
	// Poll every 500ms until either applied or timeout
	while (Date.now() - startedAt < timeoutMs) {
		const applied = await getAppliedMigrations(pool);
		if (applied.has(latest)) return;
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(
		`Timed out after ${timeoutMs}ms waiting for migration ${latest} to be applied`,
	);
}

/**
 * High-level entrypoint for Node-side migration runs (tests, scripts).
 * Opens a pool, applies pending migrations, closes the pool.
 */
export async function runFileMigrations(
	connectionString: string,
	dir?: string,
): Promise<string[]> {
	const pool = new Pool({ connectionString });
	try {
		const files = loadMigrationFiles(dir);
		return await applyPending(pool, files);
	} finally {
		await pool.end();
	}
}
