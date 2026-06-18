/**
 * Integration test: file-based tenant migration loader.
 *
 * Strategy: instead of provisioning a real Neon project per test (slow + costly),
 * we use a temporary PostgreSQL schema within the existing tenant DB. Each test
 * creates `migrate_test_<random>`, sets `search_path` to it, runs migrations
 * against an empty namespace, and drops the schema afterwards.
 *
 * Caveat: a few of the tenant SQL files reference the `public` schema explicitly
 * (e.g. `REFERENCES "public"."members"("id")`). Those statements would fail in
 * a sibling schema. To keep the test focused on the *loader* (not the SQL),
 * we run only the lightweight `0021_add_tenant_migrations_metadata.sql` file
 * for the apply-pending case. Backfill / idempotency cases run synthetic
 * migrations that don't depend on the larger schema.
 *
 * Run: bun test src/tests/integration/tenant-migrate.test.ts
 * Prereqs: TENANT_DATABASE_URL set in .dev.vars
 * Skip: SKIP_INTEGRATION_TESTS=true
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import {
	applyPending,
	ensureMigrationTable,
	getAppliedMigrations,
	loadMigrationFiles,
	type MigrationFile,
} from "@/lib/tenant-migrate";
import { shouldSkipIntegration } from "@/tests/helpers/integration-setup";

/**
 * Local .dev.vars loader. The shared helper resolves to the wrong path
 * for some test layouts; this version explicitly targets `apps/server/.dev.vars`.
 */
function loadDevVarsLocal(): void {
	const devVarsPath = join(import.meta.dir, "../../../.dev.vars");
	try {
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx === -1) continue;
			const key = trimmed.slice(0, eqIdx).trim();
			const value = trimmed.slice(eqIdx + 1).trim();
			if (!process.env[key]) process.env[key] = value;
		}
	} catch {
		console.warn("[tenant-migrate.test] .dev.vars not found at", devVarsPath);
	}
}

neonConfig.webSocketConstructor = ws;

const SKIP = shouldSkipIntegration();
const describeOrSkip = SKIP ? describe.skip : describe;

function randomSuffix(): string {
	return Math.random().toString(36).slice(2, 10);
}

function hashSql(sql: string): string {
	return createHash("sha256").update(sql).digest("hex");
}

describeOrSkip("tenant-migrate file-based loader", () => {
	let pool: Pool;
	let schemaName: string;

	beforeAll(async () => {
		loadDevVarsLocal();
		const url = process.env.TENANT_DATABASE_URL ?? process.env.DATABASE_URL;
		if (!url) {
			throw new Error(
				"Neither TENANT_DATABASE_URL nor DATABASE_URL is set in .dev.vars",
			);
		}
		// Re-export under TENANT_DATABASE_URL so the per-test sub-pools pick it up.
		process.env.TENANT_DATABASE_URL = url;
		schemaName = `migrate_test_${randomSuffix()}`;
		pool = new Pool({ connectionString: url });
		await pool.query(`CREATE SCHEMA "${schemaName}"`);
		// Subsequent queries on connections obtained from this pool will run
		// inside this schema (each connection picks up search_path on connect).
		await pool.query(`SET search_path TO "${schemaName}"`);
	});

	afterAll(async () => {
		if (pool) {
			try {
				await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
			} catch (e) {
				console.warn(`[tenant-migrate.test] failed to drop ${schemaName}:`, e);
			}
			await pool.end();
		}
	});

	test("loadMigrationFiles returns sorted, checksummed entries", () => {
		const files = loadMigrationFiles();
		expect(files.length).toBeGreaterThan(0);
		// Sorted by filename prefix
		for (let i = 1; i < files.length; i++) {
			expect(files[i]!.name >= files[i - 1]!.name).toBe(true);
		}
		// Every file has a non-empty checksum and SQL
		for (const f of files) {
			expect(f.checksum).toMatch(/^[0-9a-f]{64}$/);
			expect(f.sql.length).toBeGreaterThan(0);
		}
		// 0021 metadata migration is present
		expect(
			files.some((f) => f.name === "0021_add_tenant_migrations_metadata"),
		).toBe(true);
	});

	test("apply-pending on fresh tenant: applies all synthetic migrations", async () => {
		// Use a sub-schema for this test
		const sub = `${schemaName}_fresh`;
		await pool.query(`CREATE SCHEMA "${sub}"`);
		try {
			const subPool = new Pool({
				connectionString: process.env.TENANT_DATABASE_URL!,
			});
			// pin every connection in this pool to the sub-schema
			subPool.on(
				"connect",
				(client: { query: (sql: string) => Promise<unknown> }) => {
					client.query(`SET search_path TO "${sub}"`).catch(() => {});
				},
			);
			try {
				const sql1 = `CREATE TABLE "t_one" ("id" int);`;
				const sql2 = `CREATE TABLE "t_two" ("id" int);`;
				const synthetic: MigrationFile[] = [
					{ name: "9000_test_one", sql: sql1, checksum: hashSql(sql1) },
					{ name: "9001_test_two", sql: sql2, checksum: hashSql(sql2) },
				];

				const ranNow = await applyPending(subPool, synthetic);
				expect(ranNow).toEqual(["9000_test_one", "9001_test_two"]);

				// drizzle_migrations should have both entries
				const applied = await getAppliedMigrations(subPool);
				expect(applied.has("9000_test_one")).toBe(true);
				expect(applied.has("9001_test_two")).toBe(true);

				// Tables should physically exist in the sub-schema
				const tables = (await subPool.query(
					`SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
					[sub],
				)) as { rows: Array<{ table_name: string }> };
				const names = new Set(tables.rows.map((r) => r.table_name));
				expect(names.has("t_one")).toBe(true);
				expect(names.has("t_two")).toBe(true);
			} finally {
				await subPool.end();
			}
		} finally {
			await pool.query(`DROP SCHEMA "${sub}" CASCADE`);
		}
	});

	test("backfill: existing drizzle_migrations rows are respected, only pending migrations run", async () => {
		const sub = `${schemaName}_backfill`;
		await pool.query(`CREATE SCHEMA "${sub}"`);
		try {
			const subPool = new Pool({
				connectionString: process.env.TENANT_DATABASE_URL!,
			});
			subPool.on(
				"connect",
				(client: { query: (sql: string) => Promise<unknown> }) => {
					client.query(`SET search_path TO "${sub}"`).catch(() => {});
				},
			);
			try {
				await ensureMigrationTable(subPool);

				// Pre-populate as if 9000 already ran
				await subPool.query(
					"INSERT INTO drizzle_migrations (hash) VALUES ($1)",
					["9000_test_one"],
				);

				const sql1 = `CREATE TABLE "t_one_should_not_exist" ("id" int);`;
				const sql2 = `CREATE TABLE "t_two_backfill" ("id" int);`;
				const synthetic: MigrationFile[] = [
					{ name: "9000_test_one", sql: sql1, checksum: hashSql(sql1) },
					{ name: "9001_test_two", sql: sql2, checksum: hashSql(sql2) },
				];

				const ranNow = await applyPending(subPool, synthetic);
				expect(ranNow).toEqual(["9001_test_two"]);

				const tables = (await subPool.query(
					`SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
					[sub],
				)) as { rows: Array<{ table_name: string }> };
				const names = new Set(tables.rows.map((r) => r.table_name));
				// First migration was skipped because it was already in drizzle_migrations
				expect(names.has("t_one_should_not_exist")).toBe(false);
				// Second migration ran
				expect(names.has("t_two_backfill")).toBe(true);
			} finally {
				await subPool.end();
			}
		} finally {
			await pool.query(`DROP SCHEMA "${sub}" CASCADE`);
		}
	});

	test("idempotency: re-running apply-pending is a no-op", async () => {
		const sub = `${schemaName}_idem`;
		await pool.query(`CREATE SCHEMA "${sub}"`);
		try {
			const subPool = new Pool({
				connectionString: process.env.TENANT_DATABASE_URL!,
			});
			subPool.on(
				"connect",
				(client: { query: (sql: string) => Promise<unknown> }) => {
					client.query(`SET search_path TO "${sub}"`).catch(() => {});
				},
			);
			try {
				const sql1 = `CREATE TABLE "t_idem" ("id" int);`;
				const synthetic: MigrationFile[] = [
					{ name: "9000_idem", sql: sql1, checksum: hashSql(sql1) },
				];

				const first = await applyPending(subPool, synthetic);
				expect(first).toEqual(["9000_idem"]);

				const second = await applyPending(subPool, synthetic);
				expect(second).toEqual([]);

				const applied = await getAppliedMigrations(subPool);
				expect(applied.has("9000_idem")).toBe(true);
			} finally {
				await subPool.end();
			}
		} finally {
			await pool.query(`DROP SCHEMA "${sub}" CASCADE`);
		}
	});

	/**
	 * Idempotency-on-existing-tenant case.
	 *
	 * Simulates a tenant that has already applied every embedded historical migration
	 * (its `drizzle_migrations` is fully populated with HISTORICAL_ORDER) and now
	 * picks up the rewritten 8 newcomer files. The newcomers must apply without
	 * error even though the schema state they would have produced is already in
	 * place.
	 *
	 * To keep the test isolated from the live `public` schema, we (1) pre-create
	 * stub dep tables in the sub-schema (`members`, `package_instances`, `expenses`),
	 * (2) pre-create the schema-state the NOVEL newcomers would produce
	 * (coach_intake_* tables, package_instances.preferred_trainer_id), and (3)
	 * rewrite the SQL strings so that `"public"."members"` references point at the
	 * sub-schema. The re-run must succeed and re-running a second time must be a
	 * no-op.
	 */
	const NEWCOMER_HASHES = [
		"0004_talented_terrax",
		"0011_clear_marvex",
		"0012_military_captain_marvel",
		"0013_dashing_venus",
		"0014_expenses_currency_myr",
		"0014_lively_jane_foster",
		"0019_gray_rachel_grey",
		"0020_add_coach_intake_tables",
	];

	// Longer timeout: this test pre-stamps ~34 hashes and runs 8 file migrations
	// across a network-attached Neon pool, which adds up.
	test("idempotency on existing tenant: 8 newcomers re-apply cleanly when schema already matches", async () => {
		const sub = `${schemaName}_existing_tenant`;
		await pool.query(`CREATE SCHEMA "${sub}"`);
		try {
			const subPool = new Pool({
				connectionString: process.env.TENANT_DATABASE_URL!,
			});
			subPool.on(
				"connect",
				(client: { query: (sql: string) => Promise<unknown> }) => {
					client.query(`SET search_path TO "${sub}"`).catch(() => {});
				},
			);
			try {
				// 1. Stub dep tables. These stand in for the rich live schema; they
				//    only need the columns our newcomers reference.
				await subPool.query(
					`CREATE TABLE "members" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
				);
				await subPool.query(
					`CREATE TABLE "package_instances" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
				);
				await subPool.query(
					`CREATE TABLE "expenses" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "currency" text DEFAULT 'usd' NOT NULL)`,
				);

				// 2. Pre-create the state the NOVEL newcomers would produce, so we
				//    actually exercise their idempotent guards.
				await subPool.query(
					`ALTER TABLE "package_instances" ADD COLUMN "preferred_trainer_id" uuid`,
				);
				await subPool.query(
					`ALTER TABLE "package_instances" ADD CONSTRAINT "package_instances_preferred_trainer_id_members_id_fk" FOREIGN KEY ("preferred_trainer_id") REFERENCES "${sub}"."members"("id")`,
				);
				await subPool.query(`CREATE TABLE "coach_intake_availability" (
					"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
					"trainer_id" uuid NOT NULL REFERENCES "${sub}"."members"("id") ON DELETE CASCADE,
					"day_of_week" text NOT NULL,
					"start_time" text NOT NULL,
					"end_time" text NOT NULL,
					"is_active" boolean DEFAULT true NOT NULL,
					"created_at" timestamptz DEFAULT now() NOT NULL,
					"updated_at" timestamptz DEFAULT now() NOT NULL
				)`);
				await subPool.query(
					`CREATE INDEX "coach_intake_trainer_idx" ON "coach_intake_availability" ("trainer_id")`,
				);
				await subPool.query(
					`CREATE INDEX "coach_intake_trainer_day_idx" ON "coach_intake_availability" ("trainer_id","day_of_week")`,
				);
				await subPool.query(`CREATE TABLE "coach_intake_exceptions" (
					"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
					"trainer_id" uuid NOT NULL REFERENCES "${sub}"."members"("id") ON DELETE CASCADE,
					"date" timestamptz NOT NULL,
					"start_time" text NOT NULL,
					"end_time" text NOT NULL,
					"reason" text,
					"created_at" timestamptz DEFAULT now() NOT NULL,
					CONSTRAINT "coach_intake_exc_unique" UNIQUE("trainer_id","date","start_time","end_time")
				)`);
				await subPool.query(
					`CREATE INDEX "coach_intake_exc_trainer_date_idx" ON "coach_intake_exceptions" ("trainer_id","date")`,
				);

				// 3. Pre-stamp drizzle_migrations with every HISTORICAL_ORDER hash
				//    to simulate an existing tenant past the historical baseline.
				await ensureMigrationTable(subPool);
				const allFiles = loadMigrationFiles();
				const newcomerSet = new Set(NEWCOMER_HASHES);
				const historicalHashes = allFiles
					.map((f) => f.name)
					.filter((name) => !newcomerSet.has(name));
				for (const hash of historicalHashes) {
					await subPool.query(
						"INSERT INTO drizzle_migrations (hash) VALUES ($1) ON CONFLICT (hash) DO NOTHING",
						[hash],
					);
				}

				// 4. Rewrite SQL: replace `"public"."` with `"<sub>".` so the FK
				//    targets point at the sub-schema stubs. This is purely for test
				//    isolation; production tenants reference the real public schema.
				const rewritten: MigrationFile[] = allFiles.map((f) => {
					const sql = f.sql.replace(/"public"\./g, `"${sub}".`);
					return { ...f, sql, checksum: hashSql(sql) };
				});

				// 5. First apply: only the 8 newcomers should run (everything else is
				//    pre-stamped). They must all succeed despite the schema already
				//    matching what they would create.
				const firstRun = await applyPending(subPool, rewritten);
				const firstRunSet = new Set(firstRun);
				for (const newcomer of NEWCOMER_HASHES) {
					expect(firstRunSet.has(newcomer)).toBe(true);
				}
				// No historical migration should re-apply.
				for (const hist of historicalHashes) {
					expect(firstRunSet.has(hist)).toBe(false);
				}

				// 6. Second apply: full no-op.
				const secondRun = await applyPending(subPool, rewritten);
				expect(secondRun).toEqual([]);

				// 7. drizzle_migrations now contains every newcomer hash too.
				const applied = await getAppliedMigrations(subPool);
				for (const newcomer of NEWCOMER_HASHES) {
					expect(applied.has(newcomer)).toBe(true);
				}
			} finally {
				await subPool.end();
			}
		} finally {
			await pool.query(`DROP SCHEMA "${sub}" CASCADE`);
		}
	}, 60_000);
});
