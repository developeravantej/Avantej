/**
 * Tenant Database Migration Runner
 *
 * Applies tenant schema migrations to newly provisioned Neon projects.
 * This runs programmatically when a new tenant database is created.
 *
 * Migrations are imported from a generated module (`./generated/tenant-migrations.generated`)
 * which embeds the SQL of each `.sql` file in `packages/db/src/migrations/tenant/`
 * as a string constant. This keeps the runtime path Cloudflare Workers compatible
 * (no FS access at Worker runtime) while making the on-disk `.sql` files the
 * single source of truth.
 *
 * To add a new migration:
 *   1. Drop the new `.sql` file in `packages/db/src/migrations/tenant/`
 *   2. Add its hash to `HISTORICAL_ORDER` in `scripts/gen-tenant-migrations.ts`
 *      (only if you need it placed at a specific position; otherwise it auto-appends)
 *   3. Run `bun gen:migrations` and commit both the `.sql` file and the regenerated
 *      `packages/db/src/generated/tenant-migrations.generated.ts`.
 *
 * The CI guard `bun verify:migrations` (script: `scripts/verify-migrations-generated.ts`)
 * fails if the generated file drifts from the `.sql` directory.
 *
 * Usage:
 * ```typescript
 * import { runTenantMigrations } from "@avantej-core/db/migrate-tenant";
 *
 * await runTenantMigrations(connectionString);
 * ```
 *
 * Process:
 * 1. Creates migrations tracking table if it doesn't exist
 * 2. Executes migrations in order (defined by `TENANT_MIGRATIONS` from the generated module)
 * 3. Tracks applied migrations to avoid re-running
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import {
	LATEST_MIGRATION_VERSION,
	TENANT_MIGRATIONS,
} from "./generated/tenant-migrations.generated";

// Configure WebSocket support
neonConfig.webSocketConstructor = ws;

// Re-export so existing callers (e.g. apps/server/scripts, payment.service.ts,
// organizations.routes.ts, packages/db/src/index.ts) continue to resolve these
// symbols from `@avantej-core/db/migrate-tenant` without changes.
export { LATEST_MIGRATION_VERSION, TENANT_MIGRATIONS };

/**
 * Type for Neon Pool client
 * Used for executing raw SQL in migrations
 */
type NeonPool = Pool;

/**
 * SQL to create migrations tracking table
 */
const CREATE_MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS drizzle_migrations_hash_idx ON drizzle_migrations(hash);
`;

/**
 * Parse SQL migration file and split into individual statements
 * Drizzle migrations use '--> statement-breakpoint' as separators
 */
function parseMigrationSQL(sql: string): string[] {
	// Split by statement breakpoint, filter out empty strings and comments
	return sql
		.split("--> statement-breakpoint")
		.map((stmt) => stmt.trim())
		.filter((stmt) => {
			// Filter out empty statements and pure comment lines
			const cleaned = stmt.replace(/--.*$/gm, "").trim();
			return cleaned.length > 0;
		});
}

/**
 * Check if migration has already been applied
 */
async function isMigrationApplied(
	pool: NeonPool,
	hash: string,
): Promise<boolean> {
	try {
		const result = (await pool.query(
			"SELECT 1 FROM drizzle_migrations WHERE hash = $1 LIMIT 1",
			[hash],
		)) as { rows: Array<{ "?column?": number }> };
		// Handle different return types from Neon Pool
		return result.rows.length > 0;
	} catch {
		// If table doesn't exist or query fails, assume not applied
		return false;
	}
}

/**
 * Execute raw SQL statement using Neon Pool
 * Uses Pool.query() method for raw SQL strings
 */
async function executeRawSQL(pool: NeonPool, sqlString: string): Promise<void> {
	// Use Pool.query() method for raw SQL execution
	await pool.query(sqlString);
}

/**
 * Mark migration as applied
 */
async function markMigrationApplied(
	pool: NeonPool,
	hash: string,
): Promise<void> {
	await pool.query(
		"INSERT INTO drizzle_migrations (hash) VALUES ($1) ON CONFLICT (hash) DO NOTHING",
		[hash],
	);
}

/**
 * Run all tenant migrations on a newly created database
 *
 * @param connectionString - PostgreSQL connection string for the tenant database
 * @returns The final migration version hash that was applied (or already present)
 * @throws Error if migrations fail
 */
export async function runTenantMigrations(
	connectionString: string,
): Promise<string> {
	if (!connectionString) {
		throw new Error("Connection string is required");
	}

	// Create Neon Pool client
	const pool = new Pool({ connectionString });

	try {
		// Step 1: Ensure migrations tracking table exists
		// Execute raw SQL by splitting into statements and executing each
		const createTableStatements = CREATE_MIGRATIONS_TABLE_SQL.trim()
			.split(";")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

		for (const statement of createTableStatements) {
			if (statement.trim()) {
				await executeRawSQL(pool, statement);
			}
		}

		// Step 2: Execute each migration in order
		for (const migration of TENANT_MIGRATIONS) {
			const { hash, sql: migrationSQL } = migration;

			// Skip if already applied
			if (await isMigrationApplied(pool, hash)) {
				console.log(`Skipping already applied migration: ${hash}`);
				continue;
			}

			// Backward compatibility: Check if old split migrations were applied
			// If "0002_rbac_tables" and "0003_add_branch_fields" are both applied,
			// mark "0002_calm_martin_li" as applied (they're equivalent)
			if (hash === "0002_calm_martin_li") {
				const rbacApplied = await isMigrationApplied(pool, "0002_rbac_tables");
				const branchFieldsApplied = await isMigrationApplied(
					pool,
					"0003_add_branch_fields",
				);
				if (rbacApplied && branchFieldsApplied) {
					console.log(
						`Migration ${hash} already applied via split migrations (0002_rbac_tables + 0003_add_branch_fields), marking as applied`,
					);
					await markMigrationApplied(pool, hash);
					continue;
				}
			}

			console.log(`Applying migration: ${hash}`);

			// Parse into individual statements
			const statements = parseMigrationSQL(migrationSQL);

			// Execute each statement
			for (const statement of statements) {
				if (statement.trim()) {
					await executeRawSQL(pool, statement);
				}
			}

			// Mark migration as applied
			await markMigrationApplied(pool, hash);
			console.log(`Applied migration: ${hash}`);
		}

		console.log("All tenant migrations applied successfully");
		return LATEST_MIGRATION_VERSION;
	} catch (error) {
		console.error("Failed to run tenant migrations:", error);
		throw new Error(
			`Failed to run tenant migrations: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	} finally {
		// Always release the pool so callers (tenant provisioning, the test-branch
		// preload) don't leak an idle Neon connection. A leaked connection later
		// throws "terminating connection due to administrator command" when the
		// branch it points at is dropped. Swallow end() errors — best-effort.
		await pool.end().catch(() => {});
	}
}
